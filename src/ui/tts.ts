'use client';

/**
 * TTS helper for NPC dialogue.
 *
 * Why this exists: calling `window.speechSynthesis.speak()` from a
 * React effect that mounts AFTER the user's tap (game tick → bridge
 * event → setState → render → useEffect) loses the gesture context.
 * iOS Safari (and some Chromium builds) silently drop the very first
 * `speak()` unless it happens inside a user-gesture handler.
 *
 * We work around that by priming the engine on the first user gesture
 * with a silent utterance — once primed, the browser accepts later
 * `speak()` calls from any context for the lifetime of the page.
 */

// Verbose tracing — set to false once TTS is confirmed working.
// Logs the boot path, gesture priming, and per-utterance lifecycle
// so we can tell where a "no audio" report is failing without
// guessing. Each log line is prefixed `[tts]` so it's grep-friendly.
const DEBUG = true;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[tts]', ...args);
};

let primed = false;

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function prime() {
  if (primed || !isSupported()) return;
  primed = true;
  try {
    // iOS Safari ignores empty-text utterances for unlock purposes —
    // it needs a real string scheduled inside the gesture before
    // future speak() calls outside one are accepted. A single space
    // is the smallest non-empty payload that reliably counts.
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = 10; // burn through it as fast as possible so it doesn't add a perceptible silence
    u.onstart = () => log('prime: utterance started');
    u.onend = () => log('prime: utterance ended');
    u.onerror = (e) => log('prime: utterance error', (e as SpeechSynthesisErrorEvent).error);
    window.speechSynthesis.speak(u);
    log('prime: speak() returned, queued =', window.speechSynthesis.pending);
  } catch (err) {
    log('prime: threw', err);
    // Priming is best-effort; if it throws, leave `primed = true` so
    // we don't keep re-attempting on every gesture.
  }
}

if (isSupported()) {
  log('module: loaded, attaching gesture listeners');
  const onFirstGesture = (e: Event) => {
    log('gesture:', e.type, '→ priming');
    prime();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
    window.removeEventListener('touchstart', onFirstGesture, true);
  };
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);
  window.addEventListener('touchstart', onFirstGesture, true);

  // Some browsers populate voices asynchronously. Touching getVoices()
  // and listening for `voiceschanged` warms the cache so the first
  // real utterance has a voice to bind to.
  try {
    const initial = window.speechSynthesis.getVoices();
    log('voices: initial count =', initial.length);
    window.speechSynthesis.addEventListener?.(
      'voiceschanged',
      () => log('voices: changed, count =', window.speechSynthesis.getVoices().length),
    );
  } catch (err) {
    log('voices: query threw', err);
  }
} else {
  log('module: speechSynthesis NOT supported in this browser');
}

// Last text we kicked off, plus a timestamp. React 19 / Next dev runs
// effects in Strict Mode (mount → cleanup → mount), so DialogueOverlay's
// `useEffect(speakDialogue, [currentLine])` calls speakDialogue twice
// in the same tick with the same text. Without a guard, the second
// call sees the first utterance mid-flight, cancels it, queues a
// replacement, and Chromium's cancel/speak race drops the
// replacement — so neither plays. Deduping by text + a small window
// makes the strict-mode remount a no-op.
let lastSpokenText: string | null = null;
let lastSpokenAt = 0;
const DUPLICATE_WINDOW_MS = 250;

// Currently-queued or playing dialogue utterance (NOT the prime
// one). We only call `synth.cancel()` when this is set — otherwise
// we'd cancel an in-flight prime utterance that the user just
// triggered with the SAME tap that opened the dialogue, throwing
// Chromium into a cancel/speak race that drops our real speak.
// Cleared on onend/onerror; reassigned on each fresh speakDialogue.
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function speakDialogue(text: string) {
  log('speakDialogue: called with', JSON.stringify(text.slice(0, 40)) + (text.length > 40 ? '…' : ''));
  if (!isSupported()) {
    log('speakDialogue: bail — speechSynthesis not supported');
    return;
  }
  if (!text) {
    log('speakDialogue: bail — empty text');
    return;
  }
  // Beat any deferred cancel from a prior unmount BEFORE the dedupe
  // check. Strict Mode's mount → cleanup → mount sequence schedules
  // a deferred cancel during the cleanup, then the second mount
  // re-enters speakDialogue with the same text. If the dedupe bails
  // out without clearing that cancel first, the cancel fires ~60ms
  // later and interrupts the utterance the *first* mount started.
  // Clearing here makes the strict-mode round-trip a true no-op.
  clearPendingCancel();
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (text === lastSpokenText && now - lastSpokenAt < DUPLICATE_WINDOW_MS) {
    log('speakDialogue: bail — duplicate within', Math.round(now - lastSpokenAt), 'ms (likely Strict Mode remount)');
    return;
  }
  lastSpokenText = text;
  lastSpokenAt = now;
  try {
    const synth = window.speechSynthesis;
    log('speakDialogue: pre-state speaking=', synth.speaking, 'pending=', synth.pending, 'paused=', synth.paused, 'primed=', primed, 'activeUtterance=', !!activeUtterance);
    // Only call `synth.cancel()` if a previous DIALOGUE utterance is
    // active (advancing to the next line, etc.). If the engine is
    // currently busy with the prime utterance — which happens when
    // the same user tap both primed TTS and triggered the dialogue
    // — calling cancel() here kills the prime AND throws Chromium
    // into the cancel/speak race that drops our real utterance.
    // Letting the prime finish naturally is harmless: it's a single
    // space at volume 0 and rate 10, done in milliseconds, and our
    // new utterance just sits in the queue behind it.
    const needCancel = activeUtterance !== null;
    if (needCancel) synth.cancel();
    activeUtterance = null;
    // Browsers can leave the engine paused after long idles; resume
    // is a no-op when it's not paused.
    synth.resume();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => log('utterance: onstart');
    utterance.onend = () => {
      log('utterance: onend');
      if (activeUtterance === utterance) activeUtterance = null;
    };
    utterance.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error;
      log('utterance: onerror =', err);
      if (activeUtterance === utterance) activeUtterance = null;
      // 'canceled' / 'interrupted' are expected when dialogue advances
      // before the previous utterance finishes — don't spam the console.
      if (err && err !== 'canceled' && err !== 'interrupted') {
        console.warn('[tts] speak error:', err);
      }
    };
    activeUtterance = utterance;

    // Speak synchronously regardless of whether we just cancelled.
    // The setTimeout-based defer was historically a Chromium
    // workaround for cancel/speak racing in the same task, but it
    // also adds a microtask gap that some Chrome builds use to drop
    // the utterance entirely (we just observed this). Modern Chrome
    // handles the synchronous cancel→speak fine, so we always go
    // straight through.
    log('speakDialogue: synchronous speak()');
    synth.speak(utterance);
    log('speakDialogue: synchronous speak() returned, post-state speaking=', synth.speaking, 'pending=', synth.pending);
    // Diagnostic: if the utterance never starts within 1s of being
    // queued, something dropped it. Clear `activeUtterance` so the
    // NEXT speakDialogue call doesn't think this dropped utterance
    // is still in flight (which would push it down the cancel-and-
    // replace path and drop it too — cascading silence).
    let started = false;
    utterance.addEventListener('start', () => { started = true; }, { once: true });
    setTimeout(() => {
      if (!started) {
        log('speakDialogue: ⚠ utterance did not start within 1s — likely dropped silently');
        if (activeUtterance === utterance) activeUtterance = null;
      }
    }, 1000);
  } catch (err) {
    console.warn('[tts] speak failed:', err);
  }
}

// Pending cancel timer. We don't fire `synth.cancel()` synchronously
// on cleanup any more — React Strict Mode (and any other code that
// remounts the dialogue overlay in the same tick) would slot a
// cancel between the speak() and the engine's queue-process step,
// and Chromium then silently drops the post-cancel speak. By
// deferring the cancel, a re-mount that fires `speakDialogue` first
// gets to clear this timer before the cancel ever runs.
let pendingCancelTimer: number | null = null;

export function cancelDialogueSpeech() {
  log('cancelDialogueSpeech: requested (will defer)');
  if (!isSupported()) return;
  if (pendingCancelTimer !== null) return; // already scheduled
  pendingCancelTimer = window.setTimeout(() => {
    pendingCancelTimer = null;
    try {
      log('cancelDialogueSpeech: firing cancel()');
      window.speechSynthesis.cancel();
      // The cancel flushes the synth queue. Drop our reference too,
      // otherwise a `synth.cancel()` that happens while our utterance
      // was waiting in queue (and never started) leaves
      // `activeUtterance` set forever — the next speakDialogue then
      // takes the cancel-and-replace path and Chromium drops the
      // replacement, cascading into perma-silence.
      activeUtterance = null;
    } catch {
      // ignore
    }
  }, 60);
}

/** Clear any pending cancel — called from speakDialogue so a fresh
 *  speak supersedes the deferred cancel rather than racing against it. */
function clearPendingCancel() {
  if (pendingCancelTimer !== null) {
    log('clearPendingCancel: cancelling deferred cancel');
    clearTimeout(pendingCancelTimer);
    pendingCancelTimer = null;
  }
}
