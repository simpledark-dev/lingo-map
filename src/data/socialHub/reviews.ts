/**
 * Review text picked when an NPC leaves the hub.
 *
 * Driven by a satisfaction band rather than a single score so a
 * single bad answer doesn't tank an otherwise-good visit. Bands:
 *
 *   high     ≥ +3 net positive   → warm, glowing review
 *   neutral  −1 … +2             → "it was fine" non-committal
 *   low      ≤ −2                → cold, sometimes harsh
 *
 * Multiple lines per band so the review log doesn't read identically
 * after a few visits. The runner picks one at random when the NPC
 * leaves.
 */

export type ReviewBand = 'high' | 'neutral' | 'low';

export function bandForSatisfaction(score: number): ReviewBand {
  if (score >= 3) return 'high';
  if (score <= -2) return 'low';
  return 'neutral';
}

const REVIEWS_BY_BAND: Record<ReviewBand, string[]> = {
  high: [
    'Friendly staff and a cozy atmosphere. I felt very welcome.',
    'Lovely spot. The owner was warm and helpful.',
    "I'll definitely be back. Such a nice place.",
    'A genuine little hideaway. Highly recommend.',
  ],
  neutral: [
    "It was fine. I'd probably come back.",
    "Nothing special, but the staff weren't unfriendly.",
    'Decent enough place. Could do with a bit more warmth.',
  ],
  low: [
    "The owner was rude. I won't be back.",
    "I didn't feel welcome at all.",
    'Disappointing. I expected more from a place like this.',
  ],
};

export interface ReviewEntry {
  /** Stable id used for de-dup + React keys. */
  id: string;
  /** Persona name + band for the leaderboard / log display. */
  npcName: string;
  band: ReviewBand;
  text: string;
  /** When the review was logged (Date.now()). Used for ordering. */
  at: number;
}

export function makeReviewEntry(
  npcRuntimeId: string,
  npcName: string,
  score: number,
): ReviewEntry {
  const band = bandForSatisfaction(score);
  const lines = REVIEWS_BY_BAND[band];
  const text = lines[Math.floor(Math.random() * lines.length)];
  return {
    id: `${npcRuntimeId}-${Date.now()}`,
    npcName,
    band,
    text,
    at: Date.now(),
  };
}
