/**
 * Tiny SFX helper for one-shot UI cues (correct-answer chime,
 * future tap/click effects, etc).
 *
 * Backed by `audioEngine.ts` (Web Audio). Previous HTMLAudioElement
 * implementation hit iOS Safari's single-audio-session limit:
 * perfect.mp3 would silently drop when fired while a word recording
 * was still playing. Web Audio's AudioBufferSourceNode per-fire
 * model removes the contention.
 *
 * All errors are swallowed silently — SFX failures should never
 * surface to the player or block gameplay.
 */
import { playAudioUrl } from './audioEngine';

export function playSfx(url: string): void {
  playAudioUrl(url).catch(() => { /* swallow */ });
}

/** Asset URLs centralised here so the call sites stay literal-free
 *  and a future asset rename is a one-line change. */
export const SFX = {
  CORRECT: '/assets/audio/perfect.mp3',
} as const;
