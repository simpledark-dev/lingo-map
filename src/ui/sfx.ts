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
import { playAudioUrl, preloadAudio } from './audioEngine';

export function playSfx(url: string): void {
  playAudioUrl(url).catch(() => { /* swallow */ });
}

/** Asset URLs centralised here so the call sites stay literal-free
 *  and a future asset rename is a one-line change. */
export const SFX = {
  CORRECT: '/assets/audio/perfect.mp3',
  UPGRADE: '/assets/audio/pop.mp3',
  SWITCH_MAP: '/assets/audio/switch-map-sound.mp3',
  NEXT_DIALOGUE: '/assets/audio/next-dialogue-sound.mp3',
} as const;

/** Fetch + decode every entry in `SFX` so the first time the player
 *  triggers any of them, the chime fires the same frame instead of
 *  paying for a network roundtrip + decode. Called from GameCanvas
 *  on mount. Safe to run before any user gesture — Web Audio decode
 *  works on a suspended context. */
export function preloadSfx(): Promise<void> {
  return preloadAudio(Object.values(SFX));
}
