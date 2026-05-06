'use client';

/**
 * Intro cutscene — Phase 1 of the opening flow. Shown ONCE at game
 * start; the `INTRO_CUTSCENE_SEEN` flag suppresses re-renders on
 * subsequent loads. After the player completes this scene, the
 * cutscene flag is set, names are saved to `profile`, and the
 * tutorial quest auto-starts (see GameCanvas's mount effect).
 *
 * This is a self-contained overlay — it does not run inside the
 * game's normal dialogue / map system. The simplification is
 * deliberate: the opening doesn't need branching paths or
 * persistence-per-line, just a linear typewriter sequence with a
 * couple of inline name inputs. Building it on top of the
 * production dialogue infra would have meant teaching that infra
 * about input fields + skip buttons + cutscene-only state, all
 * just to ship one scene.
 *
 * The character art is the player's down-facing sprite (and child's
 * down-facing sprite) scaled up — placeholder until pixel-art
 * portraits land. We render them via a `<Sprite>` helper that
 * pulls from `/assets/me-char-atlas.webp` directly so this
 * component doesn't have to bootstrap a PixiJS app for two images.
 */

import { useCallback, useEffect, useState } from 'react';
import { setProfile } from '../data/profile';
import { setFlag, FLAGS } from '../data/eventFlags';
import { t } from '../data/i18n';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

interface IntroCutsceneProps {
  /** Sprite atlas keys for the parent + child portraits. The
   *  cutscene scales these up for the dialogue panel. The runtime
   *  also uses these for the in-world player + child NPC, but the
   *  cutscene doesn't need to know that. */
  parentSpriteKey?: string;
  childSpriteKey?: string;
  /** Fires after the player typed both names AND advanced past the
   *  final scene. GameCanvas's handler should set the flag, save
   *  the profile (already done by this component), and start the
   *  intro quest. */
  onComplete: () => void;
}

/** Sub-types that drive the linear scene runner. Each scene either
 *  shows dialogue lines OR a name-input prompt. */
type LineScene = {
  kind: 'lines';
  show: 'parent' | 'child' | 'both' | 'none';
  /** Lines for this scene. Pulled one at a time, tap-to-advance.
   *  Pass `(profile)` if you need to interpolate names — but most
   *  scenes are static strings. */
  lines: Array<string | ((p: { you: string; child: string }) => string)>;
};

type InputScene = {
  kind: 'input';
  show: 'parent' | 'child' | 'both' | 'none';
  /** Prompt rendered above the input field. */
  prompt: string;
  /** Which name we're capturing on this scene. */
  field: 'you' | 'child';
};

type Scene = LineScene | InputScene;

/** Build the scene list at render time so each render reads the
 *  active locale via t(). Module-level const wouldn't pick up
 *  the language switch from the locale picker. */
function getScenes(): Scene[] {
  return [
    // 1.1 Arrival — establishes WHO (small family), WHERE FROM
    // (a place far enough that they had to take a multi-day
    // bus), WHY (deliberately vague "old life" / "had to leave"
    // so players project their own backstory), and NOW (just
    // arrived). Practical exposition (rent, job plan, the lie)
    // is deferred to the apartment scene where the player can
    // see the room those words refer to.
    {
      kind: 'lines',
      show: 'both',
      lines: [
        t('cutscene.narratorArrival'),
        t('cutscene.busJourney'),
        t('cutscene.oldLifeInBags'),
        t('cutscene.weMadeIt'),
        t('cutscene.papaWhatNow'),
      ],
    },
    {
      kind: 'input',
      show: 'parent',
      prompt: t('cutscene.parentNamePrompt'),
      field: 'you',
    },
    {
      kind: 'lines',
      show: 'both',
      lines: [
        ({ you }) => t('cutscene.iAmAndThis', { you }),
      ],
    },
    {
      kind: 'input',
      show: 'child',
      prompt: t('cutscene.childNamePrompt'),
      field: 'child',
    },
    {
      kind: 'lines',
      show: 'both',
      lines: [
        ({ child }) => t('cutscene.thisIsMyEverything', { child }),
      ],
    },
    {
      kind: 'lines',
      show: 'both',
      lines: [
        t('cutscene.rentedAPlace'),
        t('cutscene.letsGoInside'),
      ],
    },
  ];
}

/** Char-per-tick reveal speed for the typewriter. Same cadence as
 *  the in-game DialogueOverlay so the cutscene feels like it lives
 *  in the same world, not a separate screen. */
const TYPEWRITER_MS_PER_CHAR = 22;

/** How long the cutscene's fade-to-reveal-the-world takes after
 *  the final tap. Long enough to read as a deliberate transition,
 *  short enough not to test the player's patience. */
const CUTSCENE_FADE_OUT_MS = 600;

export default function IntroCutscene({
  // Defaults align with the in-world player + child NPC sprites:
  // me-char-07 is the main character's down-facing frame across the
  // engine, me-char-12 is Mim's. Keeping these in lockstep with
  // pokemon-house-1f's `1f-npc-child.spriteKey` means the cutscene
  // portrait + the in-world NPC visually match.
  parentSpriteKey = 'me-char-07-down',
  childSpriteKey = 'me-char-12-down',
  onComplete,
}: IntroCutsceneProps) {
  const [sceneIndex, setSceneIndex] = useState(0);
  // Index of the currently-revealed line within a `lines` scene.
  const [lineIndex, setLineIndex] = useState(0);
  // Triggered after the final tap: fades the whole overlay to
  // black so the handoff to the apartment doesn't snap. The world
  // is already rendering F1 underneath, so the fade reveals it.
  const [fadingOut, setFadingOut] = useState(false);
  // How many characters of the current line have been "typed". When
  // it equals the line length, the line is fully revealed and the
  // Continue button enables. A tap mid-reveal short-circuits to the
  // full length so the player can fast-forward.
  const [revealedCount, setRevealedCount] = useState(0);
  // Captured names — flushed to `profile` ON COMPLETE so a player
  // who closes the tab mid-cutscene doesn't end up with a half-
  // populated profile.
  const [you, setYou] = useState('');
  const [child, setChild] = useState('');
  // Live input field text (reset between scenes).
  const [inputDraft, setInputDraft] = useState('');

  // SCENES rebuilt per render so t() picks up locale changes.
  const scenes = getScenes();
  const scene = scenes[sceneIndex];
  const isLast = sceneIndex >= scenes.length - 1;

  // Compute the current line's text up front so the typewriter
  // effect + the render path use the same source.
  const currentLineText: string | null =
    scene.kind === 'lines'
      ? (() => {
          const raw = scene.lines[lineIndex];
          return typeof raw === 'string' ? raw : raw({ you, child });
        })()
      : null;

  // Typewriter effect — restarts whenever the line changes. Skipped
  // for input scenes (no body text to reveal). The cleanup pause
  // returns early on unmount so the next line's effect doesn't race
  // a stale interval.
  useEffect(() => {
    if (currentLineText === null) return;
    setRevealedCount(0);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= currentLineText.length) {
        setRevealedCount(currentLineText.length);
        return;
      }
      setRevealedCount(i);
      timer = window.setTimeout(tick, TYPEWRITER_MS_PER_CHAR);
    };
    let timer = window.setTimeout(tick, TYPEWRITER_MS_PER_CHAR);
    return () => {
      window.clearTimeout(timer);
    };
  }, [currentLineText]);

  const advanceLine = useCallback(() => {
    if (scene.kind !== 'lines') return;
    // Mid-reveal: fast-forward instead of advancing. Same affordance
    // as the in-game DialogueOverlay's tap-to-skip-typewriter.
    if (currentLineText !== null && revealedCount < currentLineText.length) {
      setRevealedCount(currentLineText.length);
      return;
    }
    if (lineIndex < scene.lines.length - 1) {
      setLineIndex((i) => i + 1);
      return;
    }
    // Past the last line of this scene — move to the next scene.
    if (isLast) {
      // Final scene complete: persist names + start the fade-out.
      // The intro quest does NOT start here — the apartment
      // monologue (in GameCanvas) starts it on its own dismissal
      // so the quest pulse/dot/marker doesn't pop up while the
      // parent is still mid-thought about the plan. onComplete
      // fires AFTER the fade so the handoff to F1 reveals
      // smoothly instead of snapping.
      setProfile(you.trim(), child.trim());
      setFlag(FLAGS.INTRO_CUTSCENE_SEEN);
      setFadingOut(true);
      window.setTimeout(() => onComplete(), CUTSCENE_FADE_OUT_MS);
      return;
    }
    setSceneIndex((i) => i + 1);
    setLineIndex(0);
  }, [scene, currentLineText, revealedCount, lineIndex, isLast, you, child, onComplete]);

  const submitInput = useCallback(() => {
    if (scene.kind !== 'input') return;
    const cleaned = inputDraft.trim();
    if (!cleaned) return; // Required — Continue button is disabled below
    if (scene.field === 'you') setYou(cleaned);
    else setChild(cleaned);
    setInputDraft('');
    // Move to the next scene.
    setSceneIndex((i) => i + 1);
    setLineIndex(0);
  }, [scene, inputDraft]);

  // Keyboard: Space / Enter advance lines, Enter submits inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (scene.kind === 'input') {
          e.preventDefault();
          submitInput();
        } else {
          advanceLine();
        }
      } else if (e.key === ' ') {
        if (scene.kind === 'lines') {
          e.preventDefault();
          advanceLine();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scene, submitInput, advanceLine]);

  const showParent = scene.show === 'parent' || scene.show === 'both';
  const showChild = scene.show === 'child' || scene.show === 'both';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: `linear-gradient(180deg, ${COLORS.skyTop} 0%, ${COLORS.skyBottom} 100%)`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 24,
        boxSizing: 'border-box',
        // Same monospace as the rest of the cozy UI for consistency.
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        // Smooth handoff to F1 — fade the whole cutscene out on
        // the final tap. The world is already rendering underneath
        // so opacity 0 reveals it without a snap. Pointer events
        // off during fade so a stray tap doesn't trigger something
        // in the now-visible game world.
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${CUTSCENE_FADE_OUT_MS}ms ease-out`,
        pointerEvents: fadingOut ? 'none' : 'auto',
        // Tap-to-advance lives on the WRAPPER for line-mode so any
        // tap on the backdrop progresses the line. Input mode
        // delegates to the form.
      }}
      onClick={() => {
        if (fadingOut) return;
        if (scene.kind === 'lines') advanceLine();
      }}
    >
      {/* Character row — fills the upper space, shrinks on short
          viewports so the dialogue panel always fits. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 80,
          width: '100%',
          maxWidth: 720,
          paddingBottom: 24,
        }}
      >
        <Sprite
          atlasKey={parentSpriteKey}
          visible={showParent}
          label={you || 'You'}
        />
        <Sprite
          atlasKey={childSpriteKey}
          visible={showChild}
          label={child || 'Your child'}
        />
      </div>

      {/* Dialogue panel — fixed at the bottom, takes a tap or input
          submission to progress. Tap-to-advance on the wrapper has
          stopPropagation here so the input-mode form doesn't double-fire. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          background: COLORS.parchment,
          border: `3px solid ${COLORS.cardBorder}`,
          borderRadius: 8,
          boxShadow: `inset 2px 2px 0 0 ${COLORS.parchmentLight}, inset -2px -2px 0 0 ${COLORS.parchmentShadow}, 0 6px 0 0 #2a1a0a`,
          padding: 18,
          color: COLORS.text,
          minHeight: 132,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {scene.kind === 'lines' && (
          <LinesView
            scene={scene}
            lineIndex={lineIndex}
            you={you}
            child={child}
            revealedCount={revealedCount}
            isFullyRevealed={
              currentLineText !== null && revealedCount >= currentLineText.length
            }
            onAdvance={advanceLine}
            isLast={isLast && lineIndex === scene.lines.length - 1}
          />
        )}
        {scene.kind === 'input' && (
          <InputView
            scene={scene}
            value={inputDraft}
            onChange={setInputDraft}
            onSubmit={submitInput}
          />
        )}
      </div>
    </div>
  );
}

function LinesView({
  scene,
  lineIndex,
  you,
  child,
  revealedCount,
  isFullyRevealed,
  onAdvance,
  isLast,
}: {
  scene: LineScene;
  lineIndex: number;
  you: string;
  child: string;
  revealedCount: number;
  isFullyRevealed: boolean;
  onAdvance: () => void;
  isLast: boolean;
}) {
  const raw = scene.lines[lineIndex];
  const text = typeof raw === 'string' ? raw : raw({ you, child });
  const isNarration = text.startsWith('~') && text.endsWith('~');
  const stripped = isNarration ? text.replace(/^~\s*/, '').replace(/\s*~$/, '') : text;
  // Slice the line by revealed-count rather than full length. The
  // sliced index applies to `text`, not `stripped`, so we apply
  // identical strip rules after the slice for narration lines.
  const slicedRaw = text.slice(0, revealedCount);
  const sliced = isNarration
    ? slicedRaw.replace(/^~\s*/, '').replace(/\s*~$/, '')
    : slicedRaw;
  void stripped;
  return (
    <>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          minHeight: 60,
          color: isNarration ? COLORS.hintText : COLORS.text,
          fontStyle: isNarration ? 'italic' : 'normal',
          textAlign: isNarration ? 'center' : 'left',
        }}
      >
        {sliced}
        {/* Blinking caret while typing — drops out the moment the
            line is fully revealed so the static text reads cleanly. */}
        {!isFullyRevealed && (
          <span style={{ opacity: 0.6, marginLeft: 1 }}>▍</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: COLORS.hintText, letterSpacing: 1, textTransform: 'uppercase' }}>
          {isFullyRevealed ? t('cutscene.tapOrEnter') : t('cutscene.tapToSkip')}
        </div>
        {/* Continue button only shows once the line is fully revealed.
            During the typewriter pass, tap-on-backdrop already
            fast-forwards (advanceLine) so a separate "Skip" button
            was a duplicated affordance — same logic we removed from
            the in-game DialogueOverlay. */}
        {isFullyRevealed && (
          <button
            type="button"
            onClick={onAdvance}
            style={{
              background: COLORS.accentGold,
              color: '#fdf6e0',
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: 'pointer',
            }}
          >
            {isLast ? t('cutscene.begin') : t('cutscene.next')}
          </button>
        )}
      </div>
    </>
  );
}

function InputView({
  scene,
  value,
  onChange,
  onSubmit,
}: {
  scene: InputScene;
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
}) {
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 20;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
        {scene.prompt}
      </div>
      <input
        type="text"
        autoFocus
        value={value}
        maxLength={20}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          scene.field === 'you'
            ? t('cutscene.parentNamePlaceholder')
            : t('cutscene.childNamePlaceholder')
        }
        style={{
          fontSize: 14,
          padding: '8px 10px',
          border: `2px solid ${COLORS.cardBorder}`,
          borderRadius: 4,
          background: COLORS.parchmentLight,
          color: COLORS.text,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: COLORS.hintText, letterSpacing: 0.5 }}>
          {trimmed.length === 0 ? t('cutscene.typeNameToContinue') : `${trimmed.length}/20`}
        </div>
        <button
          type="submit"
          disabled={!valid}
          style={{
            background: valid ? COLORS.accentGold : COLORS.parchmentShadow,
            color: '#fdf6e0',
            border: `2px solid ${COLORS.cardBorder}`,
            borderRadius: 4,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            cursor: valid ? 'pointer' : 'not-allowed',
            opacity: valid ? 1 : 0.7,
          }}
        >
          {t('cutscene.continue')}
        </button>
      </div>
    </form>
  );
}

/** Renders a single 16×32 frame from the me-char atlas as a
 *  CSS-positioned background image. We fetch the atlas JSON once
 *  on first cutscene mount and cache it module-side so subsequent
 *  scenes / re-mounts don't re-fetch.
 *
 *  Why not Pixi: spinning up a Pixi app for two static images in
 *  the cutscene is heavier than the entire cutscene UI. CSS
 *  background-position with `image-rendering: pixelated` keeps
 *  the pixel-art look without dragging in the renderer. */

type AtlasFrame = [number, number, number, number]; // x, y, w, h
type AtlasJson = {
  image: string;
  cellWidth: number;
  cellHeight: number;
  frames: Record<string, AtlasFrame>;
};

let atlasCache: AtlasJson | null = null;
let atlasFetchPromise: Promise<AtlasJson | null> | null = null;
const ATLAS_JSON_URL = '/assets/me-char-atlas.json';
// PNG over WebP — Safari renders PNG more reliably for this case
// and the file is already shipped alongside the WebP.
const ATLAS_IMAGE_URL = '/assets/me-char-atlas.png';

function loadAtlas(): Promise<AtlasJson | null> {
  if (atlasCache) return Promise.resolve(atlasCache);
  if (atlasFetchPromise) return atlasFetchPromise;
  atlasFetchPromise = fetch(ATLAS_JSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && typeof j === 'object' && 'frames' in j) {
        atlasCache = j as AtlasJson;
        return atlasCache;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      atlasFetchPromise = null;
    });
  return atlasFetchPromise;
}

function Sprite({
  atlasKey,
  visible,
  label,
}: {
  atlasKey: string;
  visible: boolean;
  label: string;
}) {
  const [atlas, setAtlas] = useState<AtlasJson | null>(atlasCache);

  useEffect(() => {
    if (atlas) return;
    let cancelled = false;
    loadAtlas().then((a) => {
      if (!cancelled) setAtlas(a);
    });
    return () => {
      cancelled = true;
    };
  }, [atlas]);

  if (!visible) {
    return <div style={{ width: 96, height: 144, opacity: 0 }} aria-hidden />;
  }

  // Slot constants: scale 16×32 → 64×128 (4×) so the placeholder
  // sprite reads at the same physical size as in-game zoomed at
  // ~3-4×, give or take.
  const SCALE = 4;
  const frame = atlas?.frames[atlasKey];
  return (
    <div
      style={{
        width: 96,
        height: 144,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
      }}
    >
      {frame ? (
        // Two-div trick to keep math simple: inner is at native
        // 16×32 with the atlas-positioned background, then scaled
        // up via CSS transform. Outer reserves the post-scale
        // layout box. `image-rendering: pixelated` keeps the look.
        <div
          style={{
            width: frame[2] * SCALE,
            height: frame[3] * SCALE,
            overflow: 'hidden',
          }}
          aria-label={label}
        >
          <div
            style={{
              width: frame[2],
              height: frame[3],
              backgroundImage: `url(${ATLAS_IMAGE_URL})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `-${frame[0]}px -${frame[1]}px`,
              transform: `scale(${SCALE})`,
              transformOrigin: 'top left',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      ) : (
        // Atlas hasn't loaded yet — placeholder block keeps layout
        // stable until the fetch resolves.
        <div
          style={{
            width: 64,
            height: 128,
            background: COLORS.parchmentShadow,
            opacity: 0.4,
          }}
          aria-hidden
        />
      )}
      <div
        style={{
          fontSize: 11,
          color: COLORS.text,
          fontWeight: 700,
          textShadow: `0 1px 0 rgba(255,255,255,0.5)`,
          maxWidth: 96,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
    </div>
  );
}
