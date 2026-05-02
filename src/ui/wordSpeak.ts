/**
 * Speak a vocabulary word: prefer a pre-recorded MP3 when the pack
 * has one, fall back to `speechSynthesis` text-to-speech otherwise.
 *
 * Why this layer exists, separately from `tts.ts` and `sfx.ts`:
 *   – TTS is a synth engine; this code may also play HTMLAudio.
 *   – SFX is for one-shot UI cues (chimes), where overlap matters.
 *     A word "speak" is more like a prompt — usually called once per
 *     round on mount + once per speaker-button tap.
 *   – Decoupling lets us swap TTS for cleaner pre-recorded audio per
 *     word without rewriting every call site.
 *
 * Reliability notes (mostly iOS Safari):
 *   – HTMLAudioElement instances are cached per URL and reused. The
 *     first play happens during a user gesture (tap on speaker
 *     button, or just after a tap that opened a round) which
 *     unlocks autoplay for that element for the rest of the session.
 *   – `pause(); currentTime = 0; play()` on the cached element is a
 *     reliable reset between fires. Without the explicit pause, a
 *     pending `play()` Promise from the previous fire can leave the
 *     element mid-state and the next play silently fails.
 *   – When the recording errors (404, decode failure, autoplay
 *     blocked), we fall back to TTS so the player still hears
 *     something.
 *   – No deliberate `synth.cancel()` — that's the iOS-1s-freeze
 *     trigger we documented in DialogueOverlay's effect. Letting any
 *     in-flight TTS finish naturally is fine; new TTS via the
 *     fallback path triggers `speakDialogue`'s own cancel-on-replace
 *     under the hood.
 */
import type { VocabularyPack } from '../data/vocabularyPacks';
import { speakDialogue } from './tts';

const audioCache = new Map<string, HTMLAudioElement>();

function buildAudio(url: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  try {
    const el = new Audio(url);
    el.preload = 'auto';
    return el;
  } catch {
    return null;
  }
}

/** Get-or-create the cached element for `url`, evicting any stuck-
 *  state instance first. Stuck states we observe in the wild:
 *   – `el.error` set after a decode/network failure: no amount of
 *     `pause(); currentTime = 0; play()` recovers, every subsequent
 *     play returns a rejected promise. The user-visible symptom is
 *     "tap hear-again forever, no sound." Drop and rebuild.
 *   – `readyState === HAVE_NOTHING` long after construction: the
 *     element never managed to start loading (rare, but seen on
 *     iOS Safari after the page was backgrounded). Same fix. */
function getCached(url: string): HTMLAudioElement | null {
  let el = audioCache.get(url);
  if (el && (el.error || el.readyState === 0 /* HAVE_NOTHING */)) {
    audioCache.delete(url);
    el = undefined;
  }
  if (!el) {
    el = buildAudio(url) ?? undefined;
    if (el) audioCache.set(url, el);
  }
  return el ?? null;
}

/** Speak the given target word. If the pack has a recorded MP3 for
 *  that target, plays the recording; otherwise falls through to TTS.
 *  All failures fall back to TTS so the player always hears
 *  something — better a robotic voice than silence.
 *
 *  When `play()` rejects, we evict the cached element so the NEXT
 *  call rebuilds from scratch. Without this the bad-state element
 *  would silently fail every subsequent fire, even after the
 *  underlying issue (transient audio-session block on iOS, momentary
 *  network glitch on first load, etc.) has cleared. */
export function speakVocabWord(pack: VocabularyPack, target: string): void {
  const url = pack.audio?.[target];
  if (!url) {
    speakDialogue(target);
    return;
  }
  const el = getCached(url);
  if (!el) {
    speakDialogue(target);
    return;
  }
  try {
    el.pause();
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.catch((err: unknown) => {
        // Evict only if this exact instance is still in the cache —
        // a later call may already have replaced it.
        if (audioCache.get(url) === el) {
          audioCache.delete(url);
        }
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[wordSpeak] play rejected, evicted + falling back to TTS:', target, err);
        }
        speakDialogue(target);
      });
    }
  } catch (err) {
    if (audioCache.get(url) === el) {
      audioCache.delete(url);
    }
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[wordSpeak] threw, evicted + falling back to TTS:', target, err);
    }
    speakDialogue(target);
  }
}
