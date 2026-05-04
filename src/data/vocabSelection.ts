/**
 * Word-selection logic shared by VocabularyPracticeView and
 * VocabularyTranslateView.
 *
 * The model:
 *   – Per-word "memory state": how often the player's seen the word,
 *     their current correct-in-a-row streak, whether the word is in
 *     the wrong-queue.
 *   – A wrong-queue (FIFO, cap 10) that the picker prefers when
 *     non-empty. Probability of pulling from the queue scales with
 *     queue size:
 *       1-2 in queue → 50%
 *       3-4 in queue → 70%
 *       5+ in queue  → 90%
 *   – A graduation rule: 5 correct in a row removes the word from
 *     the queue. Any wrong answer resets the streak to 0.
 *   – A recency buffer (last 10 prompts) so the same word can't
 *     come back-to-back unless we deliberately pulled it from the
 *     queue (queue overrides recency, otherwise the queue would be
 *     starved when its words are also in the recent buffer).
 *   – Distractors: 2 from the same part-of-speech as the target,
 *     1 from any other POS — forces real recognition without
 *     making every choice feel adversarial.
 *
 * Persistence: localStorage, keyed `vocab-progress:<packId>`.
 * Per-pack so progress on Cleo's deck doesn't bleed into Saba's
 * numbers drill. Storage failure is non-fatal — the picker just
 * runs against an in-memory blank progress for the session.
 */
import type { VocabularyEntry, VocabularyPack } from './vocabularyPacks';

export interface WordState {
  seenCount: number;
  streak: number;
  inWrongQueue: boolean;
  /** Lifetime correct count for this word. Distinct from `streak`
   *  because `streak` resets on a wrong answer; `correctCount`
   *  monotonically grows with every correct pick. Drives the
   *  per-word stats view's "Most correct" / "Worst ratio" sorts. */
  correctCount: number;
  /** Lifetime wrong count, including IDK admissions (those go to
   *  the wrong-queue too, so they count as misses for the stats
   *  view's purposes). */
  wrongCount: number;
}

export interface VocabProgress {
  /** Per-target memory state. Words the player hasn't seen yet are
   *  absent from this map; the picker treats `undefined` as a fresh
   *  zeroed state. */
  byWord: Record<string, WordState>;
  /** Wrong-queue in FIFO order. Capped at 10 — when full, the oldest
   *  entry is dropped (and its `inWrongQueue` flag cleared) to make
   *  room. Order matters only for the FIFO eviction; picks within
   *  the queue are random. */
  wrongQueue: string[];
  /** Last N prompts shown, oldest first. Used to bias new picks
   *  away from recent prompts — keeps conversations feeling varied. */
  recentUsed: string[];
  /** Hysteresis flag for queue-saturation mode. When the queue
   *  reaches QUEUE_ONLY_ENTER_AT (5), this flips on and the picker
   *  stops sampling new words entirely — every pick comes from the
   *  queue until enough graduate that the queue shrinks back to
   *  QUEUE_ONLY_EXIT_AT (3). Without this, the player could be
   *  pulled away from a backlog of struggling words by random
   *  fresh introductions and the queue would never drain. */
  queueOnlyMode: boolean;
}

const WRONG_QUEUE_CAP = 10;
const RECENT_BUFFER_SIZE = 10;
const GRADUATION_STREAK = 5;
/** Queue size that flips queueOnlyMode ON. The player has 5 active
 *  weak words; further new vocab would just dilute review. */
const QUEUE_ONLY_ENTER_AT = 5;
/** Queue size that flips queueOnlyMode OFF. Has to be < ENTER_AT to
 *  give hysteresis — without a gap the mode would flicker on every
 *  graduate-then-miss cycle. Threshold is "≤ 3" per the design. */
const QUEUE_ONLY_EXIT_AT = 3;

const STORAGE_PREFIX = 'vocab-progress:';

export function createInitialProgress(): VocabProgress {
  return { byWord: {}, wrongQueue: [], recentUsed: [], queueOnlyMode: false };
}

/** Read the saved progress for a pack from localStorage, or return
 *  a fresh empty progress if there's nothing there / the read fails
 *  / the parsed shape doesn't match. */
export function loadProgress(packId: string): VocabProgress {
  if (typeof window === 'undefined') return createInitialProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + packId);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    if (
      !parsed
      || typeof parsed !== 'object'
      || typeof parsed.byWord !== 'object'
      || !Array.isArray(parsed.wrongQueue)
      || !Array.isArray(parsed.recentUsed)
    ) {
      return createInitialProgress();
    }
    // Default queueOnlyMode for back-compat with progress files
    // saved before this field existed. Same back-fill for
    // correctCount / wrongCount, added when the per-word stats
    // view shipped — pre-existing saves know seenCount + streak
    // but never tracked the lifetime tallies.
    const byWord: Record<string, WordState> = {};
    for (const [target, raw] of Object.entries(parsed.byWord as Record<string, Partial<WordState>>)) {
      const seenCount = typeof raw?.seenCount === 'number' ? raw.seenCount : 0;
      const streak = typeof raw?.streak === 'number' ? raw.streak : 0;
      const inWrongQueue = raw?.inWrongQueue === true;
      const correctCount = typeof raw?.correctCount === 'number' ? raw.correctCount : 0;
      const wrongCount = typeof raw?.wrongCount === 'number' ? raw.wrongCount : 0;
      byWord[target] = { seenCount, streak, inWrongQueue, correctCount, wrongCount };
    }
    return {
      byWord,
      wrongQueue: parsed.wrongQueue,
      recentUsed: parsed.recentUsed,
      queueOnlyMode: parsed.queueOnlyMode === true,
    } as VocabProgress;
  } catch {
    return createInitialProgress();
  }
}

export function saveProgress(packId: string, progress: VocabProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + packId, JSON.stringify(progress));
  } catch {
    // Storage full / blocked / disabled. Silent — picker continues
    // running against the in-memory state for this session.
  }
}

/** Probability that the next pick comes from the wrong-queue, given
 *  how many words are currently in it AND whether queue-only mode is
 *  latched on. Tiered:
 *    queueOnlyMode (queue ≥ 5 sometime in past, hasn't dropped to ≤3) → 1.0
 *    1-2 in queue → 0.5
 *    3-4 in queue → 0.7
 *    5+   in queue → triggers queueOnlyMode anyway, but if somehow the
 *                    flag isn't set we still hit 0.9 here.
 *    empty → 0. */
function queuePriority(queueSize: number, queueOnlyMode: boolean): number {
  if (queueSize === 0) return 0;
  if (queueOnlyMode) return 1;
  if (queueSize >= 5) return 0.9;
  if (queueSize >= 3) return 0.7;
  return 0.5;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Filter to entries the pack can actually play audio for. When the
 *  pack declares an `audio` map, missing entries fall back to TTS —
 *  but TTS is unreliable on some setups (stuck Chrome subprocess,
 *  iOS audio-session contention), so a word with no recording can
 *  end up effectively silent for the player. Skip those at selection
 *  time rather than letting the player get stranded mid-round.
 *  Packs with no `audio` map at all (e.g. Mira) rely entirely on TTS
 *  by design, so this filter is a no-op there. */
function playableEntries(pack: VocabularyPack): VocabularyEntry[] {
  if (!pack.audio) return pack.entries;
  return pack.entries.filter((e) => pack.audio?.[e.target]);
}

/** Pick the prompt for the next round.
 *
 *  Order of operations:
 *   1. With `queuePriority(queue.size)` probability, pick a random
 *      word from the wrong-queue. Recency is intentionally ignored
 *      here — the queue's job is forced review.
 *   2. Otherwise, pick from words NOT in the recency buffer.
 *      Among those, prefer the lowest `seenCount` (favours unseen /
 *      less-seen words so the full pack gets exposure over time).
 *      Pick randomly from the bottom quartile of seen-counts so
 *      we're not deterministic when many words are tied at zero.
 *   3. If recency excludes everything (small pack played a lot),
 *      fall back to any non-recent or finally any word — recency is
 *      a hint, not a hard constraint. */
export function pickPromptEntry(
  pack: VocabularyPack,
  progress: VocabProgress,
): VocabularyEntry {
  const playable = playableEntries(pack);
  const playableSet = new Set(playable.map((e) => e.target));
  const queueSize = progress.wrongQueue.length;
  const playableQueue = progress.wrongQueue.filter((t) => playableSet.has(t));
  if (
    playableQueue.length > 0 &&
    Math.random() < queuePriority(queueSize, progress.queueOnlyMode)
  ) {
    const target = playableQueue[Math.floor(Math.random() * playableQueue.length)];
    const entry = playable.find((e) => e.target === target);
    if (entry) return entry;
    // Fall through — shouldn't hit, but keeps us safe if state drifts.
  }

  const recent = new Set(progress.recentUsed);
  const fresh = playable.filter((e) => !recent.has(e.target));
  const pool = fresh.length > 0 ? fresh : playable;

  // Build sorted-by-seenCount list, ascending. Tie-break randomly
  // within each seenCount bucket so we don't always pick the same
  // first-alphabetically word among the unseen.
  const withCounts = pool.map((e) => ({
    entry: e,
    count: progress.byWord[e.target]?.seenCount ?? 0,
  }));
  withCounts.sort((a, b) => a.count - b.count);
  const minCount = withCounts[0].count;
  const candidates = withCounts.filter((x) => x.count === minCount).map((x) => x.entry);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Build the 4 choices (target + 3 distractors) for a round.
 *
 *  Distractor strategy: try for 2 same-POS + 1 other-POS. Same-POS
 *  distractors are the meaningful test ("is this a verb meaning
 *  'to run' or 'to walk'?"); the other-POS distractor gives the
 *  player one obviously-wrong option to rule out, which keeps
 *  4-button quizzes feeling tractable instead of always punishing.
 *
 *  Falls back gracefully on small packs:
 *   – Pack is all-one-POS (e.g. Saba's numbers): all 3 distractors
 *     are same-POS by necessity.
 *   – Pack is too small to fill 3 distinct distractors: we top up
 *     with random non-prompt entries. */
export function buildChoices(
  pack: VocabularyPack,
  prompt: VocabularyEntry,
): VocabularyEntry[] {
  const samePOS = pack.entries.filter(
    (e) => e.pos === prompt.pos && e.target !== prompt.target,
  );
  const otherPOS = pack.entries.filter(
    (e) => e.pos !== prompt.pos && e.target !== prompt.target,
  );

  const samePicks = shuffle(samePOS).slice(0, 2);
  const remaining = 3 - samePicks.length;
  const otherPicks = shuffle(otherPOS).slice(0, remaining);

  const distractors: VocabularyEntry[] = [...samePicks, ...otherPicks];
  while (distractors.length < 3) {
    const candidate = pack.entries[Math.floor(Math.random() * pack.entries.length)];
    if (
      candidate.target !== prompt.target &&
      !distractors.some((d) => d.target === candidate.target)
    ) {
      distractors.push(candidate);
    }
  }

  return shuffle([prompt, ...distractors]);
}

/** Apply the result of one round to the progress object and return
 *  a NEW progress (immutable update so React state diff fires
 *  correctly when the caller stores this in `useState`).
 *
 *  Side effects on the underlying state machine:
 *   – `seenCount` always increments.
 *   – Correct: streak += 1; if streak hits GRADUATION_STREAK and
 *     the word is in the queue, remove it (graduated).
 *   – Wrong: streak resets to 0; if not already in queue, push.
 *     If queue exceeds cap, evict the oldest and clear its flag.
 *   – Always update the recency buffer (rolling window). */
export function recordAnswer(
  progress: VocabProgress,
  target: string,
  correct: boolean,
): VocabProgress {
  const prev = progress.byWord[target];
  const next: WordState = {
    seenCount: (prev?.seenCount ?? 0) + 1,
    streak: correct ? (prev?.streak ?? 0) + 1 : 0,
    inWrongQueue: prev?.inWrongQueue ?? false,
    correctCount: (prev?.correctCount ?? 0) + (correct ? 1 : 0),
    wrongCount: (prev?.wrongCount ?? 0) + (correct ? 0 : 1),
  };

  const byWord: Record<string, WordState> = { ...progress.byWord, [target]: next };
  let wrongQueue = progress.wrongQueue.slice();

  if (correct) {
    if (next.inWrongQueue && next.streak >= GRADUATION_STREAK) {
      next.inWrongQueue = false;
      wrongQueue = wrongQueue.filter((t) => t !== target);
    }
  } else {
    if (!next.inWrongQueue) {
      next.inWrongQueue = true;
      wrongQueue = [...wrongQueue, target];
      if (wrongQueue.length > WRONG_QUEUE_CAP) {
        const evicted = wrongQueue.shift();
        if (evicted && byWord[evicted]) {
          byWord[evicted] = { ...byWord[evicted], inWrongQueue: false };
        }
      }
    }
  }

  byWord[target] = next;

  // Recency: append, trim to last RECENT_BUFFER_SIZE.
  const recentUsed = [...progress.recentUsed, target];
  if (recentUsed.length > RECENT_BUFFER_SIZE) {
    recentUsed.splice(0, recentUsed.length - RECENT_BUFFER_SIZE);
  }

  // Hysteresis update — queue-only mode latches ON at ≥5 weak words
  // and OFF at ≤3. Sizes between 3 and 5 (i.e. exactly 4) keep the
  // current state; that's the band that prevents flicker.
  let queueOnlyMode = progress.queueOnlyMode;
  if (wrongQueue.length >= QUEUE_ONLY_ENTER_AT) {
    queueOnlyMode = true;
  } else if (wrongQueue.length <= QUEUE_ONLY_EXIT_AT) {
    queueOnlyMode = false;
  }

  return { byWord, wrongQueue, recentUsed, queueOnlyMode };
}

/** Track that the player saw a prompt without answering yet — used
 *  by the views to update the recency buffer at round-mount time
 *  even before the player commits to a choice. Without this, a
 *  player who walks away mid-round wouldn't have that prompt added
 *  to recency and could see it again on next open. */
export function recordPromptShown(
  progress: VocabProgress,
  target: string,
): VocabProgress {
  const recentUsed = [...progress.recentUsed.filter((t) => t !== target), target];
  if (recentUsed.length > RECENT_BUFFER_SIZE) {
    recentUsed.splice(0, recentUsed.length - RECENT_BUFFER_SIZE);
  }
  return { ...progress, recentUsed };
}
