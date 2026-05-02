/**
 * Tiny SFX helper for one-shot UI cues (correct-answer chime,
 * future tap/click effects, etc).
 *
 * Why a module instead of inline `new Audio(...)` at each call site:
 *  - We pre-create one HTMLAudioElement per asset URL and just call
 *    `currentTime = 0; play()` on each play. Re-using the element
 *    avoids the 50–200 ms decode hit a fresh `new Audio()` causes
 *    on iOS Safari, which would otherwise stagger between the
 *    "✓ correct" feedback flash and the cheer.
 *  - Multiple rapid plays can overlap by spawning a one-off clone
 *    when the cached element is mid-playback, so two correct
 *    answers in quick succession don't cut each other off.
 *
 * All errors are swallowed silently — SFX failures should never
 * surface to the player or block gameplay. Background-music
 * autoplay rules don't apply to clips fired in response to a tap,
 * which is when we actually invoke this.
 */

const cached = new Map<string, HTMLAudioElement>();

function getCached(url: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let el = cached.get(url);
  if (!el) {
    try {
      el = new Audio(url);
      el.preload = 'auto';
      cached.set(url, el);
    } catch {
      return null;
    }
  }
  return el;
}

/** Play a one-shot SFX.
 *
 *  Reliability notes:
 *   - We always `pause()` + reset `currentTime = 0` before `play()`.
 *     Without the pause, a still-pending `play()` Promise from a
 *     prior fire (e.g. two rapid correct answers) leaves the element
 *     in an interrupted state and the new play can fail silently.
 *   - The cloned-element overlap path was DROPPED. On iOS Safari each
 *     fresh element needs its own user-gesture unlock, and clones
 *     fired from a tap-handler tick after the gesture frame
 *     occasionally don't qualify — the player'd hear the SFX
 *     intermittently. Two correct answers within ~1 sec is rare
 *     enough that cutting the previous chime short is acceptable;
 *     the cached element played from a button click is on the gesture
 *     fast-path and reliable.
 *   - `play()` can still reject (autoplay policy, audio session
 *     contention with TTS/dialogue audio, format issues). We surface
 *     the error to the dev console — `[sfx]` prefixed — so a future
 *     "sometimes it doesn't play" bug isn't invisible.
 */
export function playSfx(url: string): void {
  const el = getCached(url);
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.catch((err: unknown) => {
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[sfx] play rejected:', url, err);
        }
      });
    }
  } catch (err) {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[sfx] play threw:', url, err);
    }
  }
}

/** Asset URLs centralised here so the call sites stay literal-free
 *  and a future asset rename is a one-line change. */
export const SFX = {
  CORRECT: '/assets/audio/perfect.mp3',
} as const;
