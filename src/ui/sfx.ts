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

// Tap-to-move click cue. Off by default because most players find
// it noisy on rapid taps; opt-in from Settings for those who want
// the haptic-style feedback. `playTapSfx` checks BOTH this flag
// and the master `sfxEnabled`, so the audio icon still works as
// the global mute.
let tapMoveSfxEnabled = false;

export function setTapMoveSfxEnabled(enabled: boolean): void {
  tapMoveSfxEnabled = enabled;
}

export function isTapMoveSfxEnabled(): boolean {
  return tapMoveSfxEnabled;
}

/** Variant of `playSfx` for the tap-to-move click cue. Gated by
 *  both the master SFX flag and the per-channel `tapMoveSfxEnabled`
 *  setting so the global mute still wins. Kept as a separate
 *  function so call sites read at a glance — `playTapSfx()` is
 *  obviously "the tap thing" without spelling out the URL. */
export function playTapSfx(): void {
  if (!tapMoveSfxEnabled) return;
  playSfx(SFX.TAP);
}

// Per-URL minimum gap between plays. Rapid tap-to-move taps were
// piling up the same source on mobile — audioEngine's same-URL
// stop+restart is async, so two fast plays would race and either
// crackle at the cut or sum into clipping. Skipping the new play
// (synchronous, here) keeps the prior tap's tail intact and caps
// the firing rate. 60ms is short enough to feel responsive on a
// burst of taps; if it ever needs per-SFX tuning, replace this
// constant with a `Record<string, number>`.
const SFX_MIN_GAP_MS = 200;
const sfxLastPlayedAt = new Map<string, number>();

export function playSfx(url: string): void {
  if (!sfxEnabled) return;
  const now = performance.now();
  const last = sfxLastPlayedAt.get(url) ?? -Infinity;
  if (now - last < SFX_MIN_GAP_MS) return;
  sfxLastPlayedAt.set(url, now);
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
  TAP: '/assets/audio/tap.mp3?v=3',
} as const;

/** Fetch + decode every entry in `SFX` so the first time the player
 *  triggers any of them, the chime fires the same frame instead of
 *  paying for a network roundtrip + decode. Called from GameCanvas
 *  on mount. Safe to run before any user gesture — Web Audio decode
 *  works on a suspended context. */
export function preloadSfx(): Promise<void> {
  return preloadAudio(Object.values(SFX));
}
