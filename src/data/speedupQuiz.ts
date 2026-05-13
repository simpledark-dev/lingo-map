/**
 * Word picker for the computer-upgrade speed-up mini-quiz.
 *
 * Different goals from the in-NPC quiz picker (`vocabSelection.ts`):
 *   – Pulls from EVERY pack the player has seen, not one specific NPC's
 *     deck. The speed-up is a global review surface — whatever the
 *     player's weakest words are across their whole study history.
 *   – Skips any word with `seenCount === 0`. The speed-up is never a
 *     player's first exposure to a word; they should always be
 *     reviewing something they've at least been quizzed on before.
 *   – Honours the active target language (`getTarget()`). Packs whose
 *     `target` doesn't match are skipped entirely so a French-learner
 *     never sees a Lingo word here.
 *   – Ranks by "weakness" so failing answers come up first.
 *
 * Returns `null` when the player has no seen words in their current
 * target language. Caller (`ComputerUpgradeView`) reads that as "no
 * review pool yet — disable speed-up."
 */
import { getTarget } from './target';
import {
  VOCABULARY_PACKS,
  VocabularyEntry,
  getVocabularyPack,
} from './vocabularyPacks';
import { loadProgress, type WordState } from './vocabSelection';

export interface SpeedupQuestion {
  correct: VocabularyEntry;
  options: VocabularyEntry[];
}

interface SeenWord {
  entry: VocabularyEntry;
  state: WordState;
}

/** Higher score = weaker (more in need of review). Inputs:
 *    – `inWrongQueue`: the strongest signal — currently flagged as
 *      a struggle word by the per-pack picker.
 *    – wrong/total ratio: the long-term miss rate.
 *    – raw wrong count: tie-breaker so a word missed 5/10 outranks
 *      one missed 1/2 despite the same ratio.
 *  All three components are bounded so a single dominant axis can't
 *  starve the others. */
function weaknessScore(state: WordState): number {
  const total = state.correctCount + state.wrongCount;
  const ratio = total > 0 ? state.wrongCount / total : 0;
  const queueBonus = state.inWrongQueue ? 0.5 : 0;
  const wrongMagnitude = Math.min(state.wrongCount / 10, 1);
  return queueBonus + ratio * 0.4 + wrongMagnitude * 0.1;
}

/** Walk every pack in the registry, keep the variant for the active
 *  target language, and collect entries the player has been exposed
 *  to (`seenCount > 0`). One physical entry can appear in multiple
 *  packs in principle; we de-dup by `entry.target` so the picker
 *  doesn't show the same word twice with different weakness scores. */
function collectSeenWords(): SeenWord[] {
  const target = getTarget();
  const byTarget = new Map<string, SeenWord>();
  for (const packId of Object.keys(VOCABULARY_PACKS)) {
    const pack = getVocabularyPack(packId);
    if (!pack) continue;
    if ((pack.target ?? 'lingo') !== target) continue;
    const progress = loadProgress(packId);
    for (const entry of pack.entries) {
      const state = progress.byWord[entry.target];
      if (!state || state.seenCount <= 0) continue;
      // If we've already seen this exact target word from another
      // pack, keep whichever state is weaker — the player wants the
      // worst review experience surfaced, not the cleaner one.
      const existing = byTarget.get(entry.target);
      if (!existing || weaknessScore(state) > weaknessScore(existing.state)) {
        byTarget.set(entry.target, { entry, state });
      }
    }
  }
  return Array.from(byTarget.values());
}

/** Same target language as the prompt, drawn from the same pool of
 *  *seen* words, falling back to any seen word if same-POS is empty.
 *  Last resort: any pack entry in the active target (only when the
 *  player has fewer than 4 seen words total). */
function pickDistractors(
  prompt: VocabularyEntry,
  seen: SeenWord[],
): VocabularyEntry[] {
  const others = seen.filter((s) => s.entry.target !== prompt.target);
  const samePos = others.filter((s) => s.entry.pos === prompt.pos);
  const distractorPool = samePos.length >= 3 ? samePos : others;
  const chosen: VocabularyEntry[] = [];
  const used = new Set<string>([prompt.target]);
  // First pass: pick from seen pool with the standard shuffle.
  const shuffled = distractorPool.slice().sort(() => Math.random() - 0.5);
  for (const sw of shuffled) {
    if (chosen.length >= 3) break;
    if (used.has(sw.entry.target)) continue;
    chosen.push(sw.entry);
    used.add(sw.entry.target);
  }
  // Top-up from any pack entry in the active target — only fires when
  // the player has 1-3 seen words total. Keeps the quiz from breaking
  // on a near-empty pool.
  if (chosen.length < 3) {
    const target = getTarget();
    for (const packId of Object.keys(VOCABULARY_PACKS)) {
      const pack = getVocabularyPack(packId);
      if (!pack) continue;
      if ((pack.target ?? 'lingo') !== target) continue;
      for (const entry of pack.entries) {
        if (chosen.length >= 3) break;
        if (used.has(entry.target)) continue;
        chosen.push(entry);
        used.add(entry.target);
      }
      if (chosen.length >= 3) break;
    }
  }
  return chosen;
}

/** Cheap availability check — used by `ComputerUpgradeView` to decide
 *  whether to enable the "Speed Up" button. Bails the moment it finds
 *  the first seen word so a player with a long study history doesn't
 *  pay for a full sort + distractor pick just to discover the answer
 *  is "yes, you have words." Re-reads localStorage so a Settings →
 *  Reset between modal opens is reflected correctly. */
export function hasSeenWords(): boolean {
  const target = getTarget();
  for (const packId of Object.keys(VOCABULARY_PACKS)) {
    const pack = getVocabularyPack(packId);
    if (!pack) continue;
    if ((pack.target ?? 'lingo') !== target) continue;
    const progress = loadProgress(packId);
    for (const entry of pack.entries) {
      const state = progress.byWord[entry.target];
      if (state && state.seenCount > 0) return true;
    }
  }
  return false;
}

/** Build one speed-up question.
 *
 *  Picking strategy: sort all seen words by weakness, then pick from
 *  the top quartile (or top 5, whichever is larger) so it's not always
 *  the single weakest word — gives the player some variety while still
 *  staying inside their struggle zone.
 *
 *  Optional `recentTargets` suppresses words the player just answered
 *  so the same prompt doesn't fire twice in a row. The caller tracks
 *  this across questions in the modal session.
 *
 *  Returns `null` when there are zero seen words for the active target. */
export function pickSpeedupQuestion(
  recentTargets: ReadonlySet<string> = new Set(),
): SpeedupQuestion | null {
  const seen = collectSeenWords();
  if (seen.length === 0) return null;

  const eligible = seen.filter((s) => !recentTargets.has(s.entry.target));
  // If recency excluded everything, fall back to the full seen pool —
  // a small vocabulary will naturally hit this and we'd rather repeat
  // than crash.
  const pool = eligible.length > 0 ? eligible : seen;

  pool.sort((a, b) => weaknessScore(b.state) - weaknessScore(a.state));
  // If the player has any non-zero weakness signal, draw from the
  // weakest top quartile (min 5). Otherwise — typical for a strong
  // player who's answered everything correctly — every entry scores
  // 0 and slicing the head would just expose pack iteration order;
  // open the pick to the full seen pool so it's actually random.
  const topScore = weaknessScore(pool[0].state);
  const head =
    topScore > 0
      ? pool.slice(0, Math.min(Math.max(5, Math.ceil(pool.length / 4)), pool.length))
      : pool;
  const picked = head[Math.floor(Math.random() * head.length)];

  const distractors = pickDistractors(picked.entry, seen);
  const options = [picked.entry, ...distractors];
  // Shuffle so the correct answer doesn't always sit at index 0.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { correct: picked.entry, options };
}
