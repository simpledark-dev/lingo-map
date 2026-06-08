/**
 * Office shift definitions — Phase 1 of the V1 "translation job" loop.
 *
 * A *shift* is a bounded work session at the office: the player clocks
 * in with the CEO (the shift manager), serves a FIXED ROSTER of clients
 * by walking up to each one on the office floor, then the shift wraps up
 * with a summary + bonus. Serving a client reuses the existing dialogue
 * → mode-pick → VocabularyTranslateView flow untouched; this module only
 * describes WHO is on the roster.
 *
 * Phase 1 scope (intentionally minimal):
 *   - One hardcoded roster = the three office NPCs already in the map
 *     (Eli/Rina/Yusuf), each locked to one drill mode (read/listen/write)
 *     so a first shift naturally teaches all three input methods.
 *   - No request board, no client variety/domains, no spawning. Those are
 *     later phases.
 *
 * Forward-compat note: the serve loop keys off `npcId` only; `packId` and
 * `mode` are carried here so a future request board can *choose* a roster
 * without the serving code changing — the board just decides which
 * ShiftClientDef[] gets passed to the shift.
 */

export type ShiftMode = 'read' | 'listen' | 'write';

export interface ShiftClientDef {
  /** Map NPC id the player walks up to. Must match an npc in the office
   *  map so markers + interaction resolve to a real sprite. */
  npcId: string;
  /** Display name (matches the map npc's name) — used in the summary. */
  npcName: string;
  /** The vocabulary pack this client is served from. Informational in
   *  Phase 1 (the NPC's own `vocabularyPackId` drives the actual drill);
   *  reserved for the request board. */
  packId: string;
  /** Drill mode this client is served in. Mirrors the NPC's dialogueKind
   *  mode-lock; kept here so the roster is self-describing. */
  mode: ShiftMode;
}

export interface ShiftDef {
  id: string;
  /** Flat bonus paid on top of per-answer earnings when the shift wraps. */
  bonusCents: number;
  clients: ShiftClientDef[];
}

/** The only shift in Phase 1: the three office-floor clients. */
export const OFFICE_SHIFT: ShiftDef = {
  id: 'office-default',
  bonusCents: 100,
  clients: [
    { npcId: 'office-npc-tutor', npcName: 'Eli', packId: 'office-tutor-pack', mode: 'read' },
    { npcId: 'office-npc-listen-tutor', npcName: 'Rina', packId: 'office-listen-tutor-pack', mode: 'listen' },
    { npcId: 'office-npc-write-tutor', npcName: 'Yusuf', packId: 'office-write-tutor-pack', mode: 'write' },
  ],
};

/** Roster for the next shift. Phase 1 always returns the fixed office
 *  roster; Phase 2's board will branch here. */
export function getShiftRoster(): ShiftClientDef[] {
  return OFFICE_SHIFT.clients;
}

export const SHIFT_BONUS_CENTS = OFFICE_SHIFT.bonusCents;
