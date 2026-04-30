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

let primed = false;

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function prime() {
  if (primed || !isSupported()) return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // Priming is best-effort; if it throws, leave `primed = true` so
    // we don't keep re-attempting on every gesture.
  }
}

if (isSupported()) {
  const onFirstGesture = () => {
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
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.(
      'voiceschanged',
      () => window.speechSynthesis.getVoices(),
    );
  } catch {
    // Some browsers throw when the synth is not yet initialized — ignore.
  }
}

export function speakDialogue(text: string) {
  if (!isSupported() || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    // Browsers can leave the engine paused after long idles; resume
    // is a no-op when it's not paused.
    synth.resume();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error;
      // 'canceled' / 'interrupted' are expected when dialogue advances
      // before the previous utterance finishes — don't spam the console.
      if (err && err !== 'canceled' && err !== 'interrupted') {
        console.warn('[tts] speak error:', err);
      }
    };

    // Chromium occasionally drops a speak() that lands in the same tick
    // as a cancel(); deferring one task lets the queue settle.
    setTimeout(() => {
      try {
        synth.speak(utterance);
      } catch (err) {
        console.warn('[tts] speak threw:', err);
      }
    }, 0);
  } catch (err) {
    console.warn('[tts] speak failed:', err);
  }
}

export function cancelDialogueSpeech() {
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
