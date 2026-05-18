"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PixiApp } from "../renderer/PixiApp";
import type { GameEvent } from "../core/GameBridge";
import { SOCIAL_HUB_POIS, slotToWorld } from "../data/socialHub/pois";
import {
  getInteractionById,
  pickInteractionForPoi,
} from "../data/socialHub/interactions";
import {
  finaliseLeavers,
  applyOutcome,
  tickGuestArrivals,
  tickIdleWandering,
  trySpawnGuest,
} from "../core/socialHub/lifecycle";
import {
  SocialHubState,
  createInitialState,
} from "../core/socialHub/state";
import {
  ActiveDialogue,
  advancePastReply,
  currentNode,
  openDialogue,
  pickChoice,
} from "../core/socialHub/dialogue";
import { getUiTheme } from "./uiThemes";

// ──────────────────────────────────────────────────────────────
// SocialHubScene
//
// Mounted by GameCanvas when `currentMapId === 'social-hub'`. Owns
// the entire experiment runtime:
//   – spawn / arrival / wander tick (interval-driven)
//   – marker placement for NPCs waiting on the player
//   – bridge subscription that opens dialogues when a marked NPC
//     is tapped
//   – the dialogue panel itself (reuses styles from existing
//     overlays but renders option buttons inline)
//   – the HUD chrome: tip jar, review log
// ──────────────────────────────────────────────────────────────

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;
const TILE = 16;

interface Props {
  pixiAppRef: React.MutableRefObject<PixiApp | null>;
}

export default function SocialHubScene({ pixiAppRef }: Props) {
  const [state, setState] = useState<SocialHubState>(createInitialState);
  const [dialogue, setDialogue] = useState<ActiveDialogue | null>(null);
  const [outcomeBanner, setOutcomeBanner] = useState<{
    kind: 'tip' | 'penalty';
    text: string;
  } | null>(null);
  /** Dev: press M to render labels above every POI slot so we can
   *  see where NPCs are aiming. Off by default, persisted to a
   *  ref to survive re-renders of the keydown listener. */
  const [debugShowPois, setDebugShowPois] = useState(false);

  // Refs that the bridge subscription closure can read live without
  // forcing a resubscribe each render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const dialogueRef = useRef(dialogue);
  dialogueRef.current = dialogue;

  // ── Tick loop ─────────────────────────────────────────────
  // One 500ms cadence drives the entire runtime. The engine tick
  // is 60Hz which is way more frequent than this experiment needs;
  // a 500ms beat is plenty for spawn / wander / leave decisions
  // and keeps state updates from thrashing React.
  //
  // IMPORTANT: tick functions emit engine side effects (addNpc,
  // walkNpcTo, etc). We read state from `stateRef.current` and pass
  // a VALUE to `setState` rather than a function updater — that way
  // React StrictMode's pure-updater double-invoke doesn't fire the
  // side effects twice (which would duplicate-add NPCs the engine
  // rejects, leaving React state out of sync with the engine and
  // markers missing).
  useEffect(() => {
    const id = window.setInterval(() => {
      const app = pixiAppRef.current;
      if (!app) return;
      const now = performance.now();
      const current = stateRef.current;
      let next = trySpawnGuest(current, app, now);
      next = tickGuestArrivals(next, app);
      next = tickIdleWandering(next, app, now);
      next = finaliseLeavers(next, app);
      if (next !== current) setState(next);
    }, 500);
    return () => window.clearInterval(id);
  }, [pixiAppRef]);

  // ── 'M' key toggles the POI debug overlay ─────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore key events bubbling up from text inputs (none here
      // yet, but future-proof).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM') {
        setDebugShowPois((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Quest markers ────────────────────────────────────────
  // Re-emit on every state change so the marker layer reflects
  // exactly which NPCs are currently waiting on the player. When
  // `debugShowPois` is on, we also paint a label at every POI slot
  // so the layout is visible at a glance.
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const npcMarkers = Object.values(state.npcsById)
      .filter(
        (g) =>
          g.state === 'waiting_for_welcome' ||
          g.state === 'waiting_for_interaction',
      )
      .map((g) => ({
        id: `social-marker-${g.id}`,
        x: 0,
        // The marker's bottom anchors at `npc.y + offsetY`.
        // `npc.y` is the NPC's feet (anchor.y=1), and the sprite
        // is 32 px tall — so -32 puts the marker's bottom at head
        // level, and the extra -4 leaves a small gap above the head.
        y: -28,
        spriteKey: 'ui:exclamation-red',
        followNpcId: g.id,
      }));
    app.setQuestMarkers(npcMarkers);
    // POI debug labels — no icon, just text at the slot position
    // (and the runtime npc id if the slot is currently claimed).
    // Driven through the dedicated debug-label layer so the
    // bobbing-exclamation marker stays reserved for "needs your
    // attention right now".
    const debugLabels = debugShowPois
      ? SOCIAL_HUB_POIS.flatMap((poi) =>
          poi.slots.map((slot) => {
            const w = slotToWorld(slot);
            return {
              id: `debug-poi-${slot.id}`,
              x: w.x,
              y: w.y - 4,
              text: slot.id,
            };
          }),
        )
      : [];
    app.setDebugLabels(debugLabels);
  }, [state.npcsById, debugShowPois, pixiAppRef]);

  // Clean markers when scene unmounts.
  useEffect(() => {
    const app = pixiAppRef.current;
    return () => {
      app?.setQuestMarkers([]);
      app?.setDebugLabels([]);
    };
  }, [pixiAppRef]);

  // ── Bridge subscription: NPC taps open dialogues ──────────
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const unsub = app.bridge.subscribe((event: GameEvent) => {
      if (event.type !== 'dialogueStart' && event.type !== 'dialogueAdvance') return;
      if (event.dialogue.dialogueKind !== 'social-hub') return;
      const npcId = event.dialogue.npcId;
      const guest = stateRef.current.npcsById[npcId];
      if (!guest) return;
      // Only valid to open a dialogue when the NPC is currently
      // waiting on the player. Tapping while they're walking or
      // idling is a no-op (the marker is off in those states).
      if (
        guest.state !== 'waiting_for_welcome' &&
        guest.state !== 'waiting_for_interaction'
      ) {
        return;
      }
      // Pick the right tree.
      const tree =
        guest.state === 'waiting_for_welcome'
          ? getInteractionById('entrance_welcome')
          : pickInteractionForPoiFromGuest(guest);
      if (!tree) return;
      // Pure value, not updater — keeps the React side in sync
      // with engine even when StrictMode would double-fire.
      const current = stateRef.current;
      setState({
        ...current,
        npcsById: {
          ...current.npcsById,
          [npcId]: { ...current.npcsById[npcId], state: 'in_dialogue' },
        },
      });
      setDialogue(openDialogue(npcId, guest.persona.name, tree));
    });
    return unsub;
  }, [pixiAppRef]);

  // ── Handlers ──────────────────────────────────────────────
  const handlePick = useCallback(
    (choiceIndex: number) => {
      const app = pixiAppRef.current;
      if (!app || !dialogue) return;
      const node = currentNode(dialogue);
      if (!node) return;
      const choice = node.choices[choiceIndex];
      if (!choice) return;
      const result = pickChoice(dialogue, choice);
      if (result.kind === 'terminal') {
        const out = result.outcome;
        const npcId = dialogue.npcId;
        const interactionId = dialogue.tree.id;
        setDialogue(null);
        // applyOutcome has side effects (walkNpcTo, removeNpc on the
        // leave path). Run it once with the current state value and
        // commit the new state — NOT as a function updater, so
        // StrictMode doesn't re-fire the engine calls.
        const nextState = applyOutcome(stateRef.current, app, npcId, out, interactionId);
        setState(nextState);
        // Outcome banner — short, distinct between gain and loss.
        if (out.tipCents) {
          setOutcomeBanner({ kind: 'tip', text: `+$${(out.tipCents / 100).toFixed(2)} tip` });
          window.setTimeout(() => setOutcomeBanner(null), 1600);
        } else if ((out.satisfactionDelta ?? 0) < 0) {
          setOutcomeBanner({ kind: 'penalty', text: 'They didn\'t love that.' });
          window.setTimeout(() => setOutcomeBanner(null), 1600);
        }
        // For non-leave terminals, drop them back to idling at the
        // current slot. `applyOutcome` already does this transition.
        return;
      }
      if (result.kind === 'reply') {
        setDialogue(result.state);
        return;
      }
      // branch
      setDialogue(result.state);
    },
    [dialogue, pixiAppRef],
  );

  const handleContinueReply = useCallback(() => {
    setDialogue((d) => (d ? advancePastReply(d) : d));
  }, []);

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      <Hud
        moneyCents={state.moneyCents}
        guestCount={Object.keys(state.npcsById).length}
        reviews={state.reviews}
        debugShowPois={debugShowPois}
      />
      {outcomeBanner && (
        <div style={outcomeBannerStyle(outcomeBanner.kind)}>{outcomeBanner.text}</div>
      )}
      {dialogue && (
        <DialoguePanel
          dialogue={dialogue}
          onPick={handlePick}
          onContinueReply={handleContinueReply}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function pickInteractionForPoiFromGuest(guest: {
  slotId: string | null;
  doneInteractionIds: string[];
}) {
  if (!guest.slotId) return undefined;
  const poi = SOCIAL_HUB_POIS.find((p) =>
    p.slots.some((s) => s.id === guest.slotId),
  );
  if (!poi) return undefined;
  return pickInteractionForPoi(poi.type, guest.doneInteractionIds);
}

// ──────────────────────────────────────────────────────────────
// HUD: tip jar + guest counter + review log toggle
// ──────────────────────────────────────────────────────────────

interface HudProps {
  moneyCents: number;
  guestCount: number;
  reviews: { id: string; npcName: string; band: 'high' | 'neutral' | 'low'; text: string }[];
  debugShowPois: boolean;
}

function Hud({ moneyCents, guestCount, reviews, debugShowPois }: HudProps) {
  const [reviewsOpen, setReviewsOpen] = useState(false);
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto',
        zIndex: 720,
        fontFamily: 'inherit',
      }}
    >
      {/* Top row: tip jar, guest count, reviews — horizontal so
          the centred bar reads as one HUD bar instead of a column
          stack flying down the middle of the screen. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div
          style={{
            background: COLORS.parchment,
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 14,
            fontWeight: 800,
            color: COLORS.text,
          }}
        >
          💰 ${(moneyCents / 100).toFixed(2)}
        </div>
        <div
          style={{
            background: COLORS.parchmentLight,
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: COLORS.text,
          }}
        >
          Guests: {guestCount}
        </div>
        <button
          onClick={() => setReviewsOpen((o) => !o)}
          style={{
            background: COLORS.accentGold,
            border: `2px solid ${COLORS.accentGoldDark}`,
            color: '#fff',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reviews ({reviews.length})
        </button>
      </div>
      <div
        style={{
          fontSize: 10,
          color: COLORS.hintText,
          fontStyle: 'italic',
          marginTop: 2,
          opacity: debugShowPois ? 1 : 0.6,
        }}
      >
        Press M — POIs {debugShowPois ? 'ON' : 'off'}
      </div>
      {reviewsOpen && (
        <div
          style={{
            background: COLORS.parchment,
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 6,
            padding: 10,
            maxHeight: 320,
            overflowY: 'auto',
            width: 260,
            fontSize: 12,
            color: COLORS.text,
          }}
        >
          {reviews.length === 0 ? (
            <div style={{ color: COLORS.hintText, fontStyle: 'italic' }}>
              No reviews yet.
            </div>
          ) : (
            reviews.map((r) => (
              <div
                key={r.id}
                style={{
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottom: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color:
                      r.band === 'high'
                        ? '#1f5a1f'
                        : r.band === 'low'
                          ? '#5d1f1f'
                          : COLORS.text,
                  }}
                >
                  {r.npcName} — {bandLabel(r.band)}
                </div>
                <div style={{ marginTop: 2 }}>“{r.text}”</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function bandLabel(b: 'high' | 'neutral' | 'low') {
  if (b === 'high') return '★★★';
  if (b === 'low') return '☆';
  return '★★';
}

// ──────────────────────────────────────────────────────────────
// Dialogue panel
// ──────────────────────────────────────────────────────────────

interface DialoguePanelProps {
  dialogue: ActiveDialogue;
  onPick: (choiceIndex: number) => void;
  onContinueReply: () => void;
}

function DialoguePanel({ dialogue, onPick, onContinueReply }: DialoguePanelProps) {
  const node = currentNode(dialogue);
  if (!node) return null;
  const showingReply = dialogue.pendingNpcReply !== null;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        width: 'min(480px, calc(100% - 24px))',
        background: COLORS.parchment,
        border: `2px solid ${COLORS.cardBorder}`,
        borderRadius: 8,
        boxShadow: `0 4px 0 0 ${COLORS.cardBorder}`,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'auto',
        zIndex: 700,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: COLORS.hintText,
          fontWeight: 800,
        }}
      >
        {dialogue.npcName}
      </div>
      <div
        style={{
          fontSize: 15,
          color: COLORS.text,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        “{dialogue.currentNpcLine}”
      </div>
      {showingReply ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onContinueReply}
            style={primaryButtonStyle}
          >
            Continue ▶
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {node.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => onPick(i)}
              style={choiceButtonStyle}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const choiceButtonStyle: React.CSSProperties = {
  textAlign: 'left',
  background: COLORS.parchmentLight,
  border: `2px solid ${COLORS.cardBorder}`,
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
};

const primaryButtonStyle: React.CSSProperties = {
  background: COLORS.accentGold,
  color: '#fff',
  border: `2px solid ${COLORS.accentGoldDark}`,
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ──────────────────────────────────────────────────────────────

function outcomeBannerStyle(kind: 'tip' | 'penalty'): React.CSSProperties {
  return {
    position: 'absolute',
    top: 64,
    left: '50%',
    transform: 'translateX(-50%)',
    background: kind === 'tip' ? 'rgba(58, 138, 58, 0.92)' : 'rgba(168, 59, 59, 0.92)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 16,
    padding: '8px 16px',
    borderRadius: 8,
    boxShadow: '0 3px 0 0 rgba(0,0,0,0.2)',
    pointerEvents: 'none',
    zIndex: 720,
    fontFamily: 'inherit',
  };
}

// Re-export TILE so callers can derive POI marker coords without
// re-importing the constants module — kept here so consumers stay
// terse but the export is intentional.
export const SOCIAL_HUB_TILE = TILE;
