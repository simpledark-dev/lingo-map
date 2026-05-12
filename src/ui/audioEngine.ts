/**
 * Web Audio playback engine, shared by speakVocabWord and playSfx.
 *
 * Why we moved off HTMLAudioElement for these two paths:
 *   – iOS Safari (and especially the standalone PWA) treats every
 *     HTMLAudioElement as competing for a single audio session.
 *     Two clips trying to play in close succession (perfect.mp3
 *     chime fires while the word recording is still mid-playback,
 *     or the round-change auto-speak overlaps a prior fire) would
 *     reliably drop one of them — silently, no error event, no
 *     promise rejection. The user's symptom: "tap several times,
 *     finally works" and "perfect.mp3 sometimes doesn't play."
 *   – Web Audio's AudioBufferSourceNode model has no shared session.
 *     Each `start()` on a source plays independently of every other
 *     source on the same context, so a chime fires correctly while
 *     a word recording is still ringing out, and a mid-flight word
 *     speak can be cleanly cut off by re-playing the same URL.
 *
 * Sequencing rules:
 *   – Same URL re-played: prior source is `stop()`'d so a "hear
 *     again" tap cleanly replaces the previous one.
 *   – Different URLs: free overlap. perfect.mp3 over a word audio
 *     is fine — that's the correct UX for instant feedback.
 *
 * Unlock model: AudioContexts start `suspended` on iOS until a user
 * gesture resumes them. We arm a one-shot capture-phase listener
 * (touchstart/click/keydown) on first engine use that resumes the
 * context. Subsequent plays — including non-gesture ones from a
 * round-change useEffect — work because the context stays running
 * once unlocked.
 *
 * Decode-on-first-play, cached forever after. The MP3 bytes are
 * already on disk via the SW cache, so the cost is just decode (one
 * time) + AudioBuffer storage in memory. ~30KB per number recording
 * decoded — negligible.
 */

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const activeSources = new Map<string, AudioBufferSourceNode>();
let unlockHooked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    type AudioCtxCtor = typeof AudioContext;
    const W = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
    hookUnlock();
  }
  return ctx;
}

/** Resume the context on the next user gesture. iOS requires this —
 *  without it the context sits suspended and every play is a no-op.
 *  Once unlocked, the context stays running for the rest of the page
 *  lifetime (or until the OS chooses to suspend it again, in which
 *  case the next gesture re-resumes via the normal play path's own
 *  `ensureUnlocked` call). */
function hookUnlock(): void {
  if (unlockHooked) return;
  unlockHooked = true;
  const handler = () => {
    const c = ctx;
    if (c && c.state === 'suspended') {
      c.resume().catch(() => { /* swallow — next try will retry */ });
    }
  };
  window.addEventListener('touchstart', handler, { capture: true });
  window.addEventListener('click', handler, { capture: true });
  window.addEventListener('keydown', handler, { capture: true });
}

async function ensureUnlocked(c: AudioContext): Promise<boolean> {
  if (c.state === 'running') return true;
  try {
    await c.resume();
  } catch {
    return false;
  }
  // Cast through string — TS narrows c.state from the early-return
  // check above and doesn't model resume() changing it.
  return (c.state as string) === 'running';
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return null;
  const cached = buffers.get(url);
  if (cached) return cached;
  const inflight = loading.get(url);
  if (inflight) return inflight;
  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const decoded = await c.decodeAudioData(arr);
      buffers.set(url, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      loading.delete(url);
    }
  })();
  loading.set(url, p);
  return p;
}

/** Fetch + decode `urls` and stash the resulting AudioBuffers, so
 *  the first `playAudioUrl(url)` for any of them is instant (no
 *  network roundtrip, no `decodeAudioData` cost on the trigger
 *  frame). Safe to call before any user gesture — `decodeAudioData`
 *  works on a suspended context. Failures are swallowed per-URL so
 *  one missing/broken file doesn't take down the rest. */
export function preloadAudio(urls: readonly string[]): Promise<void> {
  return Promise.all(urls.map((u) => loadBuffer(u))).then(() => undefined);
}

/** Play `url` via Web Audio. Returns true on success, false if the
 *  engine is unavailable, the context can't unlock (no user gesture
 *  yet), or the bytes can't be decoded. Callers fall back to TTS or
 *  silently absorb the failure depending on context. */
export async function playAudioUrl(url: string): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  const unlocked = await ensureUnlocked(c);
  if (!unlocked) return false;
  const buf = await loadBuffer(url);
  if (!buf) return false;
  // Stop any active source for this URL — "hear again" should cut
  // off the previous fire of the SAME word, but a different word
  // (or a different SFX) is allowed to overlap freely.
  const prior = activeSources.get(url);
  if (prior) {
    try { prior.stop(); } catch { /* already stopped/ended */ }
  }
  const source = c.createBufferSource();
  source.buffer = buf;
  source.connect(c.destination);
  source.onended = () => {
    if (activeSources.get(url) === source) activeSources.delete(url);
  };
  activeSources.set(url, source);
  try {
    source.start(0);
    return true;
  } catch {
    activeSources.delete(url);
    return false;
  }
}
