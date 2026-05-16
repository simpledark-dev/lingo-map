"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PixiApp } from "../renderer/PixiApp";
import type { GameEvent } from "../core/GameBridge";
import {
  CAFE_INTRO_SCRIPT,
  CafeActorId,
  CafeNpcId,
  CafeScriptStep,
  isAcceptedAnswer,
} from "../data/scenes/cafeIntroScript";
import { getPlayerName } from "../data/profile";
import { getUiTheme } from "./uiThemes";

// ──────────────────────────────────────────────────────────────
// Scripted café scene runner.
//
// Mounted by GameCanvas only when the player is on the
// `cafe-intro` map. Owns:
//   – step pointer (`stepIndex` state)
//   – the typed-input overlay that fronts say-steps
//   – quest-marker placement for whatever the player should
//     tap next (approach / chooseSeat steps)
//   – seat teleport on chooseSeat completion
//
// Bridge subscription: cafe-scripted NPCs route here (GameCanvas
// suppresses the default dialogue UI for that dialogueKind). When
// a tap-on-NPC fires that matches the expected actor, we advance.
// ──────────────────────────────────────────────────────────────

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;
const TILE = 16;

// Keyframes + helper classes used by both the say-step panel and
// the approach banner. Lives at module scope so a single <style>
// tag mounted by the parent covers all child renders — children
// don't have to re-mount their own copies.
const SCENE_CSS = `
  @keyframes cafe-bubble-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cafe-blink {
    to { visibility: hidden; }
  }
  .cafe-blink::after {
    content: '▌';
    margin-left: 2px;
    animation: cafe-blink 0.9s steps(2, start) infinite;
    color: ${COLORS.accentGoldDark};
  }
`;

/** Find the two table objects on the map (left + right by x). The
 *  TABLES are the source of truth for where the seats are — when the
 *  player moves them in the editor, the seat markers and the
 *  customer's sit-down teleport both follow automatically.
 *
 *  Falls back to whatever's in `map.objects` if the count is wrong
 *  (e.g. user deleted one) — caller handles missing entries. */
function findTablePositions(pixiApp: PixiApp): {
  a?: { x: number; y: number };
  b?: { x: number; y: number };
} {
  const map = pixiApp.getMapData();
  if (!map) return {};
  const tables = map.objects
    .filter((o) => o.spriteKey === 'dining-table-small')
    .sort((p, q) => p.x - q.x);
  return { a: tables[0], b: tables[1] };
}

/** Type-out a string character-by-character. Returns the currently
 *  revealed prefix, a `done` flag, and a `skip()` that jumps to full
 *  reveal — same pattern as `DialogueOverlay`'s built-in typewriter.
 *  ~40 chars/sec reads as "natural speech pacing" without being so
 *  slow that the player gets impatient. */
function useTypewriter(text: string, charsPerSec = 40) {
  const [revealed, setRevealed] = useState('');
  const [done, setDone] = useState(true);
  useEffect(() => {
    if (!text) {
      setRevealed('');
      setDone(true);
      return;
    }
    setRevealed('');
    setDone(false);
    let i = 0;
    const intervalMs = Math.max(15, 1000 / charsPerSec);
    const id = window.setInterval(() => {
      i += 1;
      if (i >= text.length) {
        setRevealed(text);
        setDone(true);
        window.clearInterval(id);
      } else {
        setRevealed(text.slice(0, i));
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [text, charsPerSec]);
  const skip = useCallback(() => {
    setRevealed(text);
    setDone(true);
  }, [text]);
  return { revealed, done, skip };
}

interface Props {
  pixiAppRef: React.MutableRefObject<PixiApp | null>;
}

export default function CafeIntroScene({ pixiAppRef }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState("");
  const [errorPulse, setErrorPulse] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Snap the invisible seat NPCs onto the actual table positions
  // each time the scene mounts. The tap-zone hit-test reads NPC
  // positions, so without this sync, dragging the tables in the
  // editor would leave the seat tap-targets stranded at compiled
  // defaults. Runs once after the engine boots — `getMapData`
  // returns null until then.
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    // Try a few times — the engine may not have finished `loadScene`
    // on the very first effect tick.
    let attempts = 0;
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const app = pixiAppRef.current;
      if (!app) return;
      const { a, b } = findTablePositions(app);
      let synced = 0;
      if (a) {
        app.teleportNpc('cafe-seat-a', a.x, a.y);
        synced++;
      }
      if (b) {
        app.teleportNpc('cafe-seat-b', b.x, b.y);
        synced++;
      }
      if (synced < 2 && attempts < 20) {
        attempts++;
        window.setTimeout(sync, 100);
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [pixiAppRef]);
  // Mirror of `stepIndex` for the bridge subscriber — the
  // subscription closure captures the index it was created with;
  // a ref lets it read the latest value without re-subscribing.
  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const step: CafeScriptStep | undefined = CAFE_INTRO_SCRIPT[stepIndex];
  const done = !step;

  const advance = useCallback(() => {
    setInput("");
    setStepIndex((i) => Math.min(i + 1, CAFE_INTRO_SCRIPT.length));
  }, []);

  // ── Quest markers — keep the arrow above whoever the player
  // is meant to tap right now. say-steps clear the marker
  // (the active conversation is its own visible signal).
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    if (!step) {
      app.setQuestMarkers([]);
      return;
    }
    if (step.kind === 'approach') {
      app.setQuestMarkers([
        {
          id: `cafe-marker-${step.actor}`,
          x: 0,
          y: 0,
          spriteKey: 'ui:exclamation-red',
          followNpcId: step.actor,
        },
      ]);
    } else if (step.kind === 'chooseSeat') {
      // Seat markers anchor to the live table positions, not to
      // the seat NPCs — the player's mental model is "I'm picking
      // which TABLE the customer sits at," and tables are what
      // they actually see on the map. The sync effect above keeps
      // the seat NPC tap-targets aligned with the tables.
      const { a, b } = findTablePositions(app);
      const markers: Parameters<typeof app.setQuestMarkers>[0] = [];
      if (a) {
        markers.push({
          id: 'cafe-marker-seat-a',
          x: a.x,
          y: a.y - TILE,
          spriteKey: 'ui:exclamation-red',
        });
      }
      if (b) {
        markers.push({
          id: 'cafe-marker-seat-b',
          x: b.x,
          y: b.y - TILE,
          spriteKey: 'ui:exclamation-red',
        });
      }
      app.setQuestMarkers(markers);
    } else {
      // say step — no marker; the input panel is the focal point.
      app.setQuestMarkers([]);
    }
    return () => {
      // Cleared on unmount via the explicit empty call above when
      // `done`; intermediate transitions re-set on the next render.
    };
  }, [step, pixiAppRef]);

  // Clear markers when the scene unmounts (player leaves the map).
  useEffect(() => {
    const app = pixiAppRef.current;
    return () => {
      app?.setQuestMarkers([]);
    };
  }, [pixiAppRef]);

  // ── Bridge subscription: react to NPC taps. ───────────────
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const unsub = app.bridge.subscribe((event: GameEvent) => {
      if (event.type !== 'dialogueStart' && event.type !== 'dialogueAdvance') return;
      if (event.dialogue.dialogueKind !== 'cafe-scripted') return;
      const npcId = event.dialogue.npcId as CafeNpcId;
      const current = CAFE_INTRO_SCRIPT[stepIndexRef.current];
      if (!current) return;
      if (current.kind === 'approach' && npcId === current.actor) {
        advance();
        return;
      }
      if (current.kind === 'chooseSeat' && (npcId === 'cafe-seat-a' || npcId === 'cafe-seat-b')) {
        // Snap the customer onto whichever TABLE was chosen — same
        // live lookup the marker placement uses, so wherever the
        // tables are in the editor is where the customer ends up.
        const { a, b } = findTablePositions(app);
        const pos = npcId === 'cafe-seat-a' ? a : b;
        if (pos) app.teleportNpc('cafe-customer', pos.x, pos.y, 'up');
        advance();
        return;
      }
      // Tapping the same NPC mid-`say` cluster is harmless — the
      // overlay's already open. Tapping the wrong NPC during a say
      // step is also a no-op (we don't want to lose progress).
    });
    return unsub;
  }, [pixiAppRef, advance]);

  const handleSubmit = useCallback(() => {
    if (!step || step.kind !== 'say') return;
    if (isAcceptedAnswer(step, input)) {
      advance();
    } else {
      setErrorPulse((n) => n + 1);
      // Pulse animation is keyed on this counter; input stays so
      // the player can edit, not start from scratch.
    }
  }, [step, input, advance]);

  // ── Render ────────────────────────────────────────────────
  if (done) {
    return (
      <div style={bannerStyle('top')}>
        <div style={{ fontWeight: 800, color: COLORS.text }}>
          Scene complete.
        </div>
        <div style={{ fontSize: 12, color: COLORS.hintText, marginTop: 4 }}>
          (Linear V1 — branching outcomes come later.)
        </div>
      </div>
    );
  }

  const body =
    step.kind === 'approach' || step.kind === 'chooseSeat' ? (
      <ApproachBanner step={step} />
    ) : (
      <SayStepPanel
        step={step}
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        onSubmit={handleSubmit}
        errorPulse={errorPulse}
      />
    );

  return (
    <>
      <style>{SCENE_CSS}</style>
      {body}
    </>
  );
}

interface SayStepPanelProps {
  step: Extract<CafeScriptStep, { kind: 'say' }>;
  input: string;
  setInput: (s: string) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  errorPulse: number;
}

function SayStepPanel({
  step,
  input,
  setInput,
  inputRef,
  onSubmit,
  errorPulse,
}: SayStepPanelProps) {
  // Two visual phases:
  //   1. NPC bubble appears + types its line ("speak phase").
  //   2. Once the NPC finishes, the player bubble pops in below
  //      with the coaching line + input ("input phase").
  // Tap anywhere → skip the typewriter to its end.
  const { revealed, done, skip } = useTypewriter(step.npcLine);
  const inputPhase = step.npcLine ? done : true;
  const playerName = getPlayerName() ?? 'You';

  // Wrong-answer cue: subtle red border tint for a moment. No shake
  // — the user specifically asked for a quieter "try again" signal.
  const [redFlash, setRedFlash] = useState(false);
  useEffect(() => {
    if (errorPulse === 0) return;
    setRedFlash(true);
    const id = window.setTimeout(() => setRedFlash(false), 600);
    return () => window.clearTimeout(id);
  }, [errorPulse]);

  // Auto-focus the input once the player bubble shows. Without the
  // guard, focus fires while the NPC is still speaking and the iOS
  // keyboard pops up too early.
  useEffect(() => {
    if (!inputPhase) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [inputPhase, inputRef]);

  // Chat column — capped width, horizontally centred. Without the
  // cap, bubbles got pinned to opposite screen edges on desktop and
  // read like two unrelated floating panels instead of a conversation
  // thread.
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    bottom: 16,
    transform: 'translateX(-50%)',
    width: 'min(480px, calc(100% - 24px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    pointerEvents: 'none',
    zIndex: 700,
  };

  return (
    <div style={wrapperStyle} onClick={() => { if (!done) skip(); }}>
      {/* NPC bubble — left-aligned, parchment background. */}
      {step.npcLine && (
        <ChatBubble
          align="left"
          name={actorDisplayName(step.actor)}
          tone="npc"
        >
          <span className={!done ? 'cafe-blink' : undefined}>
            “{revealed}”
          </span>
        </ChatBubble>
      )}

      {/* Player bubble — right-aligned, accent background. Appears
          once the NPC is done. */}
      {inputPhase && (
        <ChatBubble
          align="right"
          name={playerName}
          tone="player"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontSize: 12,
                color: COLORS.hintText,
                fontStyle: 'italic',
                lineHeight: 1.35,
              }}
            >
              {step.meaning}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 15,
                flexWrap: 'wrap',
              }}
            >
              {step.prefix && (
                <span style={{ color: COLORS.text }}>{step.prefix}</span>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                placeholder="…"
                style={{
                  flex: '1 1 auto',
                  minWidth: 120,
                  boxSizing: 'border-box',
                  fontSize: 16,
                  padding: '6px 10px',
                  border: `2px solid ${redFlash ? '#a83b3b' : COLORS.cardBorder}`,
                  borderRadius: 6,
                  background: COLORS.parchmentLight,
                  color: COLORS.text,
                  fontFamily: 'inherit',
                  transition: 'border-color 180ms ease-out',
                }}
              />
              {step.suffix && (
                <span style={{ color: COLORS.text }}>{step.suffix}</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmit();
                }}
                style={{
                  background: COLORS.accentGold,
                  color: '#fff',
                  border: `2px solid ${COLORS.accentGoldDark}`,
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Send
              </button>
            </div>
          </div>
        </ChatBubble>
      )}
    </div>
  );
}

interface ChatBubbleProps {
  align: 'left' | 'right';
  name: string;
  tone: 'npc' | 'player';
  children: React.ReactNode;
}

function ChatBubble({ align, name, tone, children }: ChatBubbleProps) {
  const isPlayer = tone === 'player';
  return (
    <div
      style={{
        pointerEvents: 'auto',
        alignSelf: align === 'left' ? 'flex-start' : 'flex-end',
        // Cap each bubble to ~85% of the chat column so the
        // opposite side stays visibly empty — that asymmetry is
        // what reads as "two speakers" without extra labels.
        // The player bubble can grow to 100% when needed because
        // the input row inside it benefits from breathing room.
        maxWidth: isPlayer ? '100%' : '85%',
        background: isPlayer ? COLORS.parchmentLight : COLORS.parchment,
        border: `2px solid ${isPlayer ? COLORS.accentGoldDark : COLORS.cardBorder}`,
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: `0 3px 0 0 ${isPlayer ? COLORS.accentGoldDark : COLORS.cardBorder}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        animation: 'cafe-bubble-in 240ms ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: isPlayer ? COLORS.accentGoldDark : COLORS.hintText,
          fontWeight: 800,
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: 16,
          color: COLORS.text,
          fontStyle: isPlayer ? 'normal' : 'italic',
          lineHeight: 1.35,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface ApproachBannerProps {
  step: Extract<CafeScriptStep, { kind: 'approach' | 'chooseSeat' }>;
}

function ApproachBanner({ step }: ApproachBannerProps) {
  const preLine =
    step.kind === 'approach' && step.preNpcLine ? step.preNpcLine : '';
  const preActorName =
    step.kind === 'approach' && step.preActor
      ? actorDisplayName(step.preActor)
      : '';
  // Typewriter the prior NPC's parting line if there is one. The
  // banner hint (where to tap next) only shows once that line is
  // done — same conversational beat-by-beat feel as the say panel.
  const { revealed, done, skip } = useTypewriter(preLine);
  return (
    <div
      style={bannerStyle('top')}
      onClick={() => {
        if (!done) skip();
      }}
    >
      {preLine && (
        <div
          style={{
            fontSize: 13,
            color: COLORS.text,
            fontStyle: 'italic',
            marginBottom: 6,
            lineHeight: 1.35,
            minHeight: 18,
            cursor: !done ? 'pointer' : 'default',
          }}
        >
          {preActorName && (
            <span style={{ fontWeight: 700, fontStyle: 'normal', marginRight: 6 }}>
              {preActorName}:
            </span>
          )}
          “{revealed}”
        </div>
      )}
      {done && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: COLORS.accentGoldDark,
            animation: 'cafe-bubble-in 240ms ease-out',
          }}
        >
          {step.hint}
        </div>
      )}
    </div>
  );
}

function actorDisplayName(actor: CafeActorId): string {
  switch (actor) {
    case 'cafe-customer':
      return 'Léa';
    case 'cafe-worker':
      return 'Théo';
  }
}

function bannerStyle(position: 'top'): React.CSSProperties {
  return {
    position: 'absolute',
    top: position === 'top' ? 16 : undefined,
    left: '50%',
    transform: 'translateX(-50%)',
    background: COLORS.parchment,
    border: `2px solid ${COLORS.cardBorder}`,
    borderRadius: 8,
    padding: '10px 14px',
    boxShadow: `0 3px 0 0 ${COLORS.cardBorder}`,
    fontFamily: 'inherit',
    minWidth: 200,
    maxWidth: 'min(420px, calc(100% - 24px))',
    textAlign: 'center',
    zIndex: 700,
  };
}
