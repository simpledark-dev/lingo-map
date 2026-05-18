/**
 * NPC persona pool for the social hub.
 *
 * The lifecycle module rolls a persona for each new guest. Personas
 * are non-unique (the same persona can spawn multiple times in a
 * session, with different runtime ids) — name + sprite key matter
 * more for player recognisability than for uniqueness.
 *
 * `personality` tags will eventually influence which dialogue
 * variations the NPC prefers and which interactions they're likely
 * to start at a POI. For V1 they're just metadata; the dialogue
 * runner reads them as hints but the trees themselves don't branch
 * on personality yet.
 */

export type Personality =
  | 'warm'      // patient, friendly; tolerates clumsy responses
  | 'curious'  // asks more open-ended questions
  | 'tired'    // shorter fuse, less tolerant of rude responses
  | 'cheerful'; // upbeat, gives bigger tips on success

export interface Persona {
  /** Stable persona id — different from the runtime NPC id. */
  personaId: string;
  /** First name. Surnames intentionally omitted to keep the cast
   *  approachable; matches the casual "social hub" tone. */
  name: string;
  /** Sprite key — reuses the existing Modern-Interiors character
   *  set. The renderer probes for `<key>-down` for walk frames; if
   *  that's missing it falls back to the static sprite (still
   *  works, just no walk animation). */
  spriteKey: string;
  personality: Personality;
}

export const PERSONAS: ReadonlyArray<Persona> = [
  { personaId: 'maya', name: 'Maya', spriteKey: 'me-char-04', personality: 'warm' },
  { personaId: 'theo', name: 'Théo', spriteKey: 'me-char-05', personality: 'curious' },
  { personaId: 'ines', name: 'Inès', spriteKey: 'me-char-06', personality: 'cheerful' },
  { personaId: 'leon', name: 'Léon', spriteKey: 'me-char-07', personality: 'tired' },
  { personaId: 'sami', name: 'Sami', spriteKey: 'me-char-08', personality: 'warm' },
  { personaId: 'rin', name: 'Rin', spriteKey: 'me-char-09', personality: 'curious' },
  { personaId: 'omar', name: 'Omar', spriteKey: 'me-char-10', personality: 'cheerful' },
  { personaId: 'noor', name: 'Noor', spriteKey: 'me-char-11', personality: 'tired' },
];

/** Pick a persona at random. The lifecycle module then composes a
 *  unique runtime id (e.g. `guest-${seq}`) so the same persona can
 *  visit the hub multiple times in one session — Maya can be the
 *  guest at slot 1 and slot 3 simultaneously with different runtime
 *  ids; they're treated as different *visits*. Good for a small
 *  persona pool feeling lively. */
export function pickRandomPersona(): Persona {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}
