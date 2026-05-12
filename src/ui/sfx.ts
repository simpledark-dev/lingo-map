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

// Module-level mute flag. Default ON; the audio-icon toggle in
// GameCanvas calls `setSfxEnabled` to mirror the music-enabled
// state, so muting BGM also mutes click cues. Kept local to this
// module so callers don't need to thread a flag through every
// `playSfx` site.
let sfxEnabled = true;

export function setSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
}

export function isSfxEnabled(): boolean {
  return sfxEnabled;
}

export function playSfx(url: string): void {
  if (!sfxEnabled) return;
  playAudioUrl(url).catch(() => { /* swallow */ });
}

/** Asset URLs centralised here so the call sites stay literal-free
 *  and a future asset rename is a one-line change.
 *
 *  Each URL carries a `?v=N` cache-buster. Bump the version on a
 *  given line whenever you edit that file's bytes — same filename
 *  means Vercel's CDN + the browser's HTTP cache + the service
 *  worker's precache + the in-memory AudioBuffer cache would all
 *  keep serving the OLD content otherwise (the audioEngine map is
 *  keyed by URL string, so a new `?v=…` is a fresh entry). Remember
 *  to mirror the version bump in `public/sw.js`'s PRECACHE_URLS. */
export const SFX = {
  CORRECT: '/assets/audio/perfect.mp3?v=2',
  UPGRADE: '/assets/audio/pop.mp3?v=2',
  SWITCH_MAP: '/assets/audio/switch-map-sound.mp3?v=2',
  NEXT_DIALOGUE: '/assets/audio/next-dialogue-sound.mp3?v=2',
  // Quick click cue fired on every tap-to-move. Kept short + soft so
  // it doesn't fatigue on rapid movement; if it ever feels noisy,
  // bump it down in volume by trimming the source MP3 rather than
  // adding a gain node (one less moving part in audioEngine).
  TAP: '/assets/audio/tap.mp3?v=2',
} as const;

/** Fetch + decode every entry in `SFX` so the first time the player
 *  triggers any of them, the chime fires the same frame instead of
 *  paying for a network roundtrip + decode. Called from GameCanvas
 *  on mount. Safe to run before any user gesture — Web Audio decode
 *  works on a suspended context. */
export function preloadSfx(): Promise<void> {
  return preloadAudio(Object.values(SFX));
}
