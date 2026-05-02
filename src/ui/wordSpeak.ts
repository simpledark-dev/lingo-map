/**
 * Speak a vocabulary word: prefer a pre-recorded MP3 played via
 * Web Audio when the pack has one, fall back to `speechSynthesis`
 * text-to-speech otherwise.
 *
 * Why this layer exists, separately from `tts.ts` and `sfx.ts`:
 *   – TTS is a synth engine; this code may also play recorded clips.
 *   – SFX is for one-shot UI cues (chimes), where overlap matters.
 *     A word "speak" is more like a prompt — usually called once per
 *     round on mount + once per speaker-button tap.
 *   – Decoupling lets us swap TTS for cleaner pre-recorded audio per
 *     word without rewriting every call site.
 *
 * Reliability: see `audioEngine.ts`. The HTMLAudioElement caching
 * layer that lived here previously — pause/reset/play with
 * eviction-on-error — was rewritten because iOS Safari's single-
 * audio-session model made it drop fires whenever the perfect.mp3
 * chime overlapped a word recording, with no error event we could
 * react to. Web Audio's per-source playback model fixes that.
 */
import type { VocabularyPack } from '../data/vocabularyPacks';
import { speakDialogue } from './tts';
import { playAudioUrl } from './audioEngine';

/** Speak the given target word. If the pack has a recorded MP3 for
 *  that target, plays the recording via Web Audio; otherwise falls
 *  through to TTS. A failed Web Audio play (engine unavailable,
 *  decode failure, context still locked) also falls back to TTS so
 *  the player always hears something — better a robotic voice than
 *  silence. */
export function speakVocabWord(pack: VocabularyPack, target: string): void {
  const url = pack.audio?.[target];
  if (!url) {
    speakDialogue(target);
    return;
  }
  playAudioUrl(url).then((ok) => {
    if (!ok) speakDialogue(target);
  });
}
