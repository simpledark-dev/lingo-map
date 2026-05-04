'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { normalizeObjectMultiplier } from '../core/MapStress';
import { loadMap, registerMap } from '../core/MapLoader';
import { PixiApp } from '../renderer/PixiApp';
import { DialogueState, MapData, GameState } from '../core/types';
import { GameEvent } from '../core/GameBridge';
import DialogueOverlay from './DialogueOverlay';
import VocabularyListView from './VocabularyListView';
import VocabularyTranslateView from './VocabularyTranslateView';
import ShopView from './ShopView';
import { getVocabularyPack } from '../data/vocabularyPacks';
import { useWalletBalance, formatBalance, getBalance } from '../data/wallet';
import { hasItem, consumeItem, useInventory } from '../data/inventory';
import { getItem } from '../data/items';
import { useEnergy, getMaxEnergy } from '../data/energy';
import {
  borrowFromTheo,
  repayMax,
  getDebt,
  useDebt,
  canBorrow,
  BORROW_INCREMENT_CENTS,
  MAX_DEBT_CENTS,
} from '../data/debt';
import { startQuest, completeQuest, getQuestStatus, useQuestStatuses } from '../data/quests';
import QuestToast from './QuestToast';
import QuestLog from './QuestLog';
import InventoryView from './InventoryView';
import IntroCutscene from './IntroCutscene';
import IntroHintBanner from './IntroHintBanner';
import SettingsView from './SettingsView';
import WordStatsView from './WordStatsView';
import { hasFlag, FLAGS } from '../data/eventFlags';
import { getPlayerName, clearProfile } from '../data/profile';
import { clearFlag } from '../data/eventFlags';
import Minimap from './Minimap';
import VirtualDPad from './VirtualDPad';
import { APP_VERSION } from '../version';
import { getUiTheme } from './uiThemes';
import { clearWorldSave, loadWorldSave } from '../data/worldSave';
import { getMusicEnabled, setMusicEnabled as persistMusicEnabled } from '../data/settings';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;
const HUD = UI_THEME.hud;

type ViewportSize = { width: number; height: number };

function readViewportSize(): ViewportSize | null {
  if (typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  const doc = document.documentElement;
  const width = Math.round(Math.max(
    vv?.width ?? 0,
    window.innerWidth || 0,
    doc.clientWidth || 0,
  ));
  const height = Math.round(Math.max(
    vv?.height ?? 0,
    window.innerHeight || 0,
    doc.clientHeight || 0,
  ));
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Compose the child NPC's dialogue based on the current quest's
 *  status + inventory. Slice 2 promotes the previous flag-driven
 *  state machine to the quest module — same four branches:
 *    1. Quest inactive → Mim asks; we `startQuest` so future
 *       visits skip the ask AND the toast fires.
 *    2. Active, no sandwich → Mim nags, no options.
 *    3. Active, has sandwich → "Give it" option appears. (The
 *       option handler is what actually completes the quest, so a
 *       player who opens this dialogue and walks away keeps the
 *       quest active rather than auto-finishing it on view.)
 *    4. Completed → casual thank-you line. */
function buildChildSandwichDialogue(stub: DialogueState): DialogueState {
  const status = getQuestStatus('child-sandwich');
  const introStatus = getQuestStatus('intro-translator-job');
  const haveSandwich = hasItem('sandwich');
  // Intro override: while the tutorial quest is active, Mim sends
  // the player off with a "good luck" line and DOES NOT start her
  // own quest yet. Avoids two competing toasts on the very first
  // session and keeps the player pointed at the office.
  if (introStatus === 'active' && status === 'inactive') {
    const playerName = getPlayerName() ?? 'dad';
    return {
      ...stub,
      lines: [`Good luck, ${playerName}! I'll wait here. Bring back something tasty?`],
    };
  }
  if (status === 'completed') {
    return {
      ...stub,
      lines: ['Thanks for the sandwich earlier! I love you, dad.'],
    };
  }
  if (status === 'inactive') {
    startQuest('child-sandwich');
    return {
      ...stub,
      lines: ["I'm hungry… can you go to the Mart and grab me a sandwich? Please?"],
    };
  }
  // status === 'active'
  if (haveSandwich) {
    return {
      ...stub,
      lines: ['Did you get my sandwich?'],
      options: [
        { id: 'child-give-sandwich', label: 'Give the sandwich 🥪' },
        { id: 'child-decline', label: 'Not yet' },
      ],
    };
  }
  return {
    ...stub,
    lines: ['Huh? Where? You didn’t buy it…'],
  };
}

/** Compose Theo's dialogue based on current debt + balance.
 *
 *  Three states:
 *    1. No debt, no balance → friendly opener + Borrow option.
 *    2. Outstanding debt → ledger line ("You owe Theo $X.XX") +
 *       Borrow (disabled at cap) + Repay (disabled if balance == 0).
 *    3. Just repaid in full → "we're square" follow-up. Driven by
 *       the option handler, not this builder. */
function buildLenderDialogue(stub: DialogueState): DialogueState {
  const debt = getDebt();
  const balance = getBalance();
  const lines = debt > 0
    ? [`You owe me ${formatBalance(debt)}. Need more, or are you here to pay up?`]
    : ['Need a hand? I can spot you five at a time, up to twenty.'];
  const canPay = debt > 0 && balance > 0;
  const repayAmount = Math.min(balance, debt);
  const options: DialogueState['options'] = [
    {
      id: 'lender-borrow',
      label: `Borrow ${formatBalance(BORROW_INCREMENT_CENTS)}`,
      hint: canBorrow()
        ? `Owed after: ${formatBalance(debt + BORROW_INCREMENT_CENTS)} (cap ${formatBalance(MAX_DEBT_CENTS)})`
        : `You\u2019re maxed out — pay some back first.`,
      disabled: !canBorrow(),
    },
    {
      id: 'lender-repay',
      label: canPay
        ? `Repay ${formatBalance(repayAmount)}`
        : 'Repay',
      hint: canPay
        ? `Pays everything you can right now.`
        : debt === 0
          ? `Nothing to repay.`
          : `You don\u2019t have any cash on you.`,
      disabled: !canPay,
    },
    { id: 'lender-leave', label: 'Maybe later' },
  ];
  return {
    ...stub,
    lines,
    options,
  };
}

/** Compose the CEO's intro dialogue. While the intro tutorial
 *  quest is active, this is a scripted hire scene with two answer
 *  options that both lead to the same outcome (`completeQuest` in
 *  the option handler) — the choice is flavor, not branching. After
 *  the quest is completed, fall through to the engine's static
 *  line so subsequent visits feel like normal NPC chat. */
function buildCeoIntroDialogue(stub: DialogueState): DialogueState {
  const status = getQuestStatus('intro-translator-job');
  if (status !== 'active') {
    // Quest already completed (or somehow skipped) — let the
    // engine's static line stand.
    return stub;
  }
  const playerName = getPlayerName() ?? 'you';
  return {
    ...stub,
    lines: [
      `${playerName}, was it? Sit. Sit.`,
      "Says here you're fluent in our tongue. That right?",
    ],
    options: [
      {
        id: 'ceo-intro-confident',
        label: 'Completely fluent.',
        hint: '(A bold lie.)',
      },
      {
        id: 'ceo-intro-honest',
        label: 'Mostly… working on it.',
        hint: '(Honest enough.)',
      },
    ],
  };
}

function readInitialObjectMultiplier(): number {
  if (typeof window === 'undefined') return 1;
  const value = Number(window.location.search ? new URLSearchParams(window.location.search).get('objects') : null);
  return normalizeObjectMultiplier(value);
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const [soundOn, setSoundOn] = useState(getMusicEnabled);
  const soundOnRef = useRef(soundOn);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  /** When the player picks "Let me look them over first" from a
   *  translator-offer dialogue, we capture the pack id + the NPC's
   *  name here and render `VocabularyListView` over the world. The
   *  dialogue closes; the list takes over until the player closes
   *  it via the back button or the dim background. */
  const [vocabularyView, setVocabularyView] = useState<{ packId: string; npcName: string } | null>(null);
  /** Same shape, but for the for-money translation work session. The
   *  player gets here by accepting the offer (option 1) then picking
   *  one of the mode buttons. `mode` distinguishes the recognition
   *  surface — `read` shows the target word as text, `listen` hides
   *  it and the player has to identify by audio alone. Same picker,
   *  same wallet, same wrong-queue underneath. */
  const [translateView, setTranslateView] = useState<{ packId: string; npcName: string; mode: 'read' | 'listen' | 'write' } | null>(null);
  /** Shop modal state — opened when the player selects "Browse" on
   *  a shopkeeper's offer dialogue. Carries only the display name;
   *  the catalog lives in `src/data/items.ts` and is shared across
   *  every shop. Null = closed. */
  const [shopView, setShopView] = useState<{ shopName: string } | null>(null);
  /** Quest log modal — opened via the HUD scroll button. */
  const [questLogOpen, setQuestLogOpen] = useState(false);
  /** Inventory modal — opens via the HUD bag pill. Lets the player
   *  eat held food items (which restores energy). */
  const [inventoryOpen, setInventoryOpen] = useState(false);
  /** Settings modal — opens via the HUD gear button. Hosts the
   *  Reset-game action; future settings (volume, accessibility,
   *  dev toggles) live here too. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Word-stats modal — opens via the HUD chart button. Aggregates
   *  per-pack progress into a global view with filter pills. */
  const [wordStatsOpen, setWordStatsOpen] = useState(false);
  /** Intro cutscene state. Active on a fresh save (no cutscene-seen
   *  flag); the cutscene component flips it false on completion.
   *  PixiApp init is gated on this so the world doesn't spin up
   *  behind the cutscene; once the cutscene finishes, the engine
   *  spawns the player at the in-house `intro-start` spawn (see
   *  introOverrideRef below). */
  const [cutsceneActive, setCutsceneActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    // Dev replay: `?intro=replay` wipes the cutscene flag + names so
    // the cutscene fires again on this load. Strictly for testing —
    // not surfaced in normal UI. Done in the state initializer so
    // the flag check below sees the cleared state.
    const params = new URLSearchParams(window.location.search);
    if (params.get('intro') === 'replay') {
      clearFlag(FLAGS.INTRO_CUTSCENE_SEEN);
      clearProfile();
      clearWorldSave();
    }
    return !hasFlag(FLAGS.INTRO_CUTSCENE_SEEN);
  });
  const [minimapData, setMinimapData] = useState<{ map: MapData; state: GameState } | null>(null);
  const [currentMapId, setCurrentMapId] = useState('outdoor');
  // Door-transition fade-to-black. Toggled true when a door fires;
  // toggled back false on `sceneChange` (i.e., the new scene has loaded).
  const [transitionFade, setTransitionFade] = useState(false);
  const [objectMultiplier] = useState(readInitialObjectMultiplier);
  const [viewportSize, setViewportSize] = useState<ViewportSize | null>(readViewportSize);
  // `loading` covers the boot window: from mount until pixiApp.init()
  // resolves (assets loaded, first scene mounted). `loadingVisible` is
  // a delayed sibling so we can fade out instead of popping — once
  // loading flips false we wait for the CSS transition before
  // unmounting the overlay.
  const [loading, setLoading] = useState(true);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const walletBalance = useWalletBalance();
  const debt = useDebt();
  const questStatuses = useQuestStatuses();
  const energy = useEnergy();
  const energyMax = getMaxEnergy();
  const inventory = useInventory();
  // Visible inventory rows, sorted alphabetically by item name for
  // a stable order across renders. Filtered to known catalog ids so
  // a stale localStorage entry from a removed item doesn't render
  // as a "?" chip.
  const inventoryRows = Object.entries(inventory)
    .map(([id, count]) => ({ id, count, def: getItem(id) }))
    .filter((r): r is { id: string; count: number; def: NonNullable<ReturnType<typeof getItem>> } => !!r.def)
    .sort((a, b) => a.def.name.localeCompare(b.def.name));

  const syncViewportSize = useCallback(() => {
    const next = readViewportSize();
    if (!next) return null;
    setViewportSize((prev) => (
      prev && prev.width === next.width && prev.height === next.height
        ? prev
        : next
    ));
    return next;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    let timers: number[] = [];

    const applySize = () => {
      frame = 0;
      syncViewportSize();
    };

    const scheduleSizeSync = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applySize);

      // iOS standalone/PWA mode can report intermediate viewport sizes
      // during orientation changes. Sample a few delayed ticks so the
      // fixed game container and Pixi renderer settle on the final size.
      for (const timer of timers) window.clearTimeout(timer);
      timers = [120, 360, 800].map((delay) => window.setTimeout(applySize, delay));
    };

    scheduleSizeSync();
    window.addEventListener('resize', scheduleSizeSync);
    window.addEventListener('orientationchange', scheduleSizeSync);
    window.addEventListener('pageshow', scheduleSizeSync);
    window.visualViewport?.addEventListener('resize', scheduleSizeSync);
    window.visualViewport?.addEventListener('scroll', scheduleSizeSync);
    window.screen.orientation?.addEventListener?.('change', scheduleSizeSync);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener('resize', scheduleSizeSync);
      window.removeEventListener('orientationchange', scheduleSizeSync);
      window.removeEventListener('pageshow', scheduleSizeSync);
      window.visualViewport?.removeEventListener('resize', scheduleSizeSync);
      window.visualViewport?.removeEventListener('scroll', scheduleSizeSync);
      window.screen.orientation?.removeEventListener?.('change', scheduleSizeSync);
    };
  }, [syncViewportSize]);

  useEffect(() => {
    if (!viewportSize) return;
    const resizePixi = () => pixiAppRef.current?.resize();
    const frame = window.requestAnimationFrame(resizePixi);
    const timers = [120, 360].map((delay) => window.setTimeout(resizePixi, delay));
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [viewportSize]);

  // Pixi 8's `resizeTo: container` only listens to window.resize,
  // NOT to the container element itself. On iOS Safari the visible
  // viewport (and thus our 100dvh outer + its inset:0 child) grows
  // when the URL bar auto-collapses, but no window.resize event
  // fires — so Pixi stays pinned to its init-time height while the
  // CSS container is taller, leaving body bg showing through as a
  // black strip at the bottom (BL-14 again, more subtle than the
  // pixel-sizing variant). A ResizeObserver on the container
  // catches the dvh-driven changes that window.resize misses.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      pixiAppRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (objectMultiplier <= 1) {
      url.searchParams.delete('objects');
    } else {
      url.searchParams.set('objects', String(objectMultiplier));
    }
    window.history.replaceState({}, '', url);
  }, [objectMultiplier]);

  const handleToggleSound = useCallback(() => {
    const nextSoundOn = !soundOn;
    pixiAppRef.current?.setMusicEnabled(nextSoundOn);
    soundOnRef.current = nextSoundOn;
    setSoundOn(nextSoundOn);
    persistMusicEnabled(nextSoundOn);
  }, [soundOn]);

  useEffect(() => {
    const app = pixiAppRef.current;
    if (app && app.isMusicEnabled() !== soundOn) {
      app.setMusicEnabled(soundOn);
    }
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (!containerRef.current || pixiAppRef.current) return;

    let cancelled = false;
    // Determine start map — default to pokemon, allow ?map=<id> override.
    // The intro cutscene runs as a fullscreen overlay; while it's
    // up the world boots in parallel BEHIND it (so the loading
    // screen drops normally), but we boot DIRECTLY into the post-
    // cutscene scene so the player never sees a flash of outdoor
    // before being teleported inside.
    let startMapId = 'pokemon';
    let startSpawnId: string | undefined;
    let startWorldState = null as ReturnType<typeof loadWorldSave>;
    if (cutsceneActive) {
      startMapId = 'pokemon-house-1f';
      startSpawnId = 'intro-start';
    }
    let explicitMapOverride = false;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mapParam = params.get('map');
      if (mapParam) {
        // Explicit ?map= URL override beats the intro spawn — useful
        // for jumping straight into a non-intro map during dev.
        explicitMapOverride = true;
        startMapId = mapParam;
        startSpawnId = undefined;
      }
    }
    if (!cutsceneActive && !explicitMapOverride) {
      const saved = loadWorldSave();
      if (saved) {
        try {
          loadMap(saved.mapId);
          startWorldState = saved;
          startMapId = saved.mapId;
          startSpawnId = undefined;
        } catch {
          clearWorldSave();
        }
      }
    }

    // Fetch disk-persisted map edits, register them as overrides, then start the game.
    // We only take the edited parts (tiles/objects/buildings/dimensions) — triggers,
    // spawnPoints and NPCs always come from the compiled map so gameplay logic
    // isn't broken by a stale version.
    const applyOverride = (mapData: { id?: string; width?: number; height?: number; tileSize?: number; tiles?: unknown; objects?: unknown[]; buildings?: unknown[]; layers?: unknown[] }) => {
      // Either `layers` (current editor) or `tiles` (legacy mirror) is enough
      // content to override. `normalizeMapData` in registerMap handles
      // filling in whichever is missing.
      const hasContent = Array.isArray(mapData.layers) || Array.isArray(mapData.tiles);
      if (!mapData?.id || !hasContent || typeof mapData.width !== 'number' || typeof mapData.height !== 'number') return;
      let compiled: ReturnType<typeof loadMap> | null = null;
      try { compiled = loadMap(mapData.id); } catch { /* map not in registry */ }

      // For legacy disk saves (no `layers` field) the editor used not to
      // serialise `transition`, so we re-attach it from the compiled map by
      // matching spriteKey. New-format saves (with `layers`) come from an
      // editor that DOES write `transition` explicitly — re-attaching there
      // would override the user's intent (e.g., duplicating a door entity
      // and unchecking "Acts as a door" on the duplicate; the duplicate
      // shares the original's spriteKey and would silently get its door
      // back). So only run the back-compat re-attach for legacy saves.
      const isLegacySave = !Array.isArray(mapData.layers);
      const transitionsBySpriteKey = new Map<string, { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string }>();
      if (isLegacySave) {
        compiled?.objects.forEach((o: { spriteKey: string; transition?: { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string } }) => {
          if (o.transition) transitionsBySpriteKey.set(o.spriteKey, o.transition);
        });
      }
      const diskObjects = (mapData.objects ?? []) as MapData['objects'];
      const objects: MapData['objects'] = diskObjects.map(o => {
        const obj = o as { spriteKey?: string; transition?: unknown };
        if (isLegacySave && obj.spriteKey && !obj.transition) {
          const t = transitionsBySpriteKey.get(obj.spriteKey);
          if (t) return { ...o, transition: t };
        }
        return o;
      });

      registerMap(mapData.id, {
        id: mapData.id,
        width: mapData.width,
        height: mapData.height,
        tileSize: mapData.tileSize ?? compiled?.tileSize ?? 16,
        // `tiles` and `objects` may be omitted in newer saves where
        // `layers` is the sole content store; normalizeMapData inside
        // registerMap fills them in from the layers list. Pass empty
        // arrays here as a safe placeholder.
        tiles: (mapData.tiles as string[][] | undefined) ?? [],
        objects,
        buildings: (mapData.buildings as MapData['buildings'] | undefined) ?? [],
        npcs: compiled?.npcs ?? [],
        triggers: compiled?.triggers ?? [],
        spawnPoints: compiled?.spawnPoints ?? [{ id: 'default', x: 0, y: 0, facing: 'down' }],
        // Engine-only map metadata (not produced by the editor) comes from the
        // compiled map so interior view caps etc. aren't lost on override.
        maxViewTiles: compiled?.maxViewTiles,
        // Editor-managed layer list — fall back to compiled layers, then to
        // implicit defaults via `getLayers()` when neither is set.
        layers: (mapData.layers as MapData['layers'] | undefined) ?? compiled?.layers,
      });
    };

    let unsubscribe: (() => void) | null = null;

    // Returns a Promise that resolves after `pixiApp.init()` finishes
    // (i.e., the first scene is fully mounted and the ticker is
    // running). Earlier this fire-and-forgot the init promise; the
    // 500ms background fetch chained off `.finally()` of the start-map
    // fetch could then race ahead and compete for bandwidth WHILE init
    // was still awaiting `loadAssets`. Returning the promise lets the
    // caller schedule the background fetch only AFTER first paint.
    const startGame = (): Promise<void> => {
      if (cancelled || !containerRef.current) return Promise.resolve();
      const pixiApp = new PixiApp({
        objectMultiplier,
        musicEnabled: soundOnRef.current,
        startMapId,
        startSpawnId,
        startWorldState,
      });
      pixiAppRef.current = pixiApp;
      // Dev-only: expose the app on window for ad-hoc debugging from
      // the browser console (`__pixi.bridge`, `__pixi.gameState`,
      // etc.). Stripped from prod builds.
      if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        (window as unknown as { __pixi: PixiApp }).__pixi = pixiApp;
      }
      unsubscribe = pixiApp.bridge.subscribe((event: GameEvent) => {
        if (cancelled) return;
        switch (event.type) {
          case 'dialogueStart':
          case 'dialogueAdvance':
            // Quest-NPC interception: when the engine flags a dialogue
            // with `dialogueKind`, rewrite its lines + options here so
            // they reflect inventory + event-flag state at interaction
            // time. Keeps the engine layer pure (no localStorage reads
            // in src/core).
            if (event.dialogue.dialogueKind === 'child-sandwich') {
              setDialogue(buildChildSandwichDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === 'lender') {
              setDialogue(buildLenderDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === 'ceo-intro') {
              setDialogue(buildCeoIntroDialogue(event.dialogue));
            } else {
              setDialogue(event.dialogue);
            }
            break;
          case 'dialogueEnd':
            setDialogue(null);
            break;
          case 'sceneTransitionStart':
            setTransitionFade(true);
            break;
          case 'sceneChange':
            setCurrentMapId(event.mapId);
            // Brief delay before fading back in so the new scene has a
            // tick to render its first frame under the still-opaque
            // overlay — otherwise the fade-in reveals one frame of the
            // PREVIOUS scene before the renderer redraws.
            window.setTimeout(() => {
              if (!cancelled) setTransitionFade(false);
            }, 40);
            break;
          case 'lockedTransition':
            // Edge-of-map district arrow whose target isn't built yet.
            // Surface a no-NPC placeholder dialogue so the player knows
            // the arrow is intentional, not a bug. Reuses the dialogue
            // overlay infra rather than introducing a separate "system
            // notice" UI component.
            setDialogue({
              npcId: 'locked-district',
              npcName: '',
              lines: [
                `You must reach ${event.title} to visit this district.`,
              ],
              currentLine: 0,
            });
            break;
        }
      });
      return pixiApp.init(containerRef.current).catch((err) => {
        if (!cancelled) console.error(err);
      });
    };

    // Cold-start override loading:
    //   Primary: fetch ONLY the start map (~390 KB, vs 440 KB for the
    //   all-maps endpoint). Saves a small chunk off the boot critical
    //   path.
    //
    //   Fallback: if the per-id fetch fails for ANY reason (mobile
    //   network blip, SW returning stale 503, malformed response),
    //   fall back to /api/maps so the user doesn't end up rendering
    //   the compiled-scaffold fallback (which is missing all their
    //   edits — sidewalks, buildings, NPCs).
    //
    //   Background: if the primary path succeeded, kick off /api/maps
    //   500 ms after first paint to grab interior-map overrides. If
    //   the fallback ran, all maps are already applied — skip.
    const fetchAllMaps = (): Promise<{ ok: boolean; appliedAll: boolean }> => {
      return fetch('/api/maps')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled || !data?.maps) return { ok: false, appliedAll: false };
          for (const id of Object.keys(data.maps)) applyOverride(data.maps[id]);
          return { ok: true, appliedAll: true };
        })
        .catch(() => ({ ok: false, appliedAll: false }));
    };
    const isValidMapData = (d: unknown): d is { id: string; width: number; height: number; layers?: unknown[] } => {
      if (!d || typeof d !== 'object') return false;
      const m = d as { id?: unknown; width?: unknown; height?: unknown; error?: unknown };
      return typeof m.id === 'string' && typeof m.width === 'number' && typeof m.height === 'number' && !m.error;
    };
    const loadStartMapOverride = async (): Promise<{ appliedAll: boolean }> => {
      // Primary path
      try {
        const r = await fetch(`/api/maps/${encodeURIComponent(startMapId)}`);
        if (r.ok) {
          const data = await r.json();
          if (isValidMapData(data)) {
            applyOverride(data);
            return { appliedAll: false };
          }
        }
      } catch {
        // fall through to the all-maps fallback
      }
      // Fallback path — pull every map. Reliable but heavier.
      const result = await fetchAllMaps();
      return { appliedAll: result.appliedAll };
    };
    loadStartMapOverride()
      .catch(() => ({ appliedAll: false }))
      .then(({ appliedAll }) => {
        startGame().then(() => {
          if (cancelled) return;
          // First scene mounted — drop the loading overlay. `loading`
          // flips immediately to start the fade; `loadingVisible`
          // unmounts after the CSS transition completes.
          setLoading(false);
          window.setTimeout(() => {
            if (!cancelled) setLoadingVisible(false);
          }, 400);
          // BL-14: on iOS Safari portrait, the URL bar can collapse
          // shortly after init resolves (visualViewport grows but no
          // window.resize fires). The earlier mount-time resize timers
          // all fired during init and bailed on `!initialized`. Re-fire
          // a few viewport + resize ticks here so both the React fixed
          // container and Pixi catch up to whatever the visible viewport
          // is after the loading overlay disappears.
          [0, 120, 360, 800, 1400].forEach((delay) => {
            window.setTimeout(() => {
              if (cancelled) return;
              syncViewportSize();
              // Belt-and-suspenders: dispatch a synthetic window
              // resize so Pixi's own `resizeTo: container` listener
              // also re-reads the container, in case our explicit
              // pixiApp.resize() somehow no-ops on iOS. This is the
              // programmatic equivalent of a device rotation —
              // which was the only known workaround before.
              try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
              window.requestAnimationFrame(() => {
                if (!cancelled) pixiAppRef.current?.resize();
              });
            }, delay);
          });
          // If the primary path applied just the start map, we still
          // need interior overrides — fire the background fetch. If
          // the fallback ran, /api/maps already covered everything
          // (start map AND interiors); skip the duplicate fetch.
          if (!appliedAll) window.setTimeout(fetchAllMaps, 500);
        });
      });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy();
        pixiAppRef.current = null;
      }
    };
  }, [objectMultiplier, syncViewportSize]);

  // Quest marker driver — runs whenever the player changes scene
  // or the intro quest's status flips. Scans the active map for
  // the entity that opens the Office (its `incomingSpawnId` is the
  // contract — `outdoor-office`) and parks a bobbing arrow above
  // its collision-box top. Cleared as soon as the player leaves
  // `pokemon` or the quest hits `completed`.
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const introActive = questStatuses['intro-translator-job'] === 'active';
    if (!introActive || currentMapId !== 'pokemon') {
      app.setQuestMarkers([]);
      return;
    }
    let map;
    try { map = loadMap('pokemon'); } catch { map = null; }
    if (!map) {
      app.setQuestMarkers([]);
      return;
    }
    type ObjLike = { id: string; x: number; y: number; collisionBox?: { offsetY: number }; transition?: { incomingSpawnId?: string } };
    // Search both the legacy `objects` field AND any object-layers,
    // since the editor's runtime override now writes layered data.
    const candidates: ObjLike[] = [];
    const layers = (map as unknown as { layers?: Array<{ kind?: string; objects?: ObjLike[] }> }).layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        if (Array.isArray(layer.objects)) candidates.push(...layer.objects);
      }
    }
    if (Array.isArray((map as unknown as { objects?: ObjLike[] }).objects)) {
      candidates.push(...((map as unknown as { objects: ObjLike[] }).objects));
    }
    const officeEntity = candidates.find(
      (o) => o.transition?.incomingSpawnId === 'outdoor-office',
    );
    if (!officeEntity) {
      app.setQuestMarkers([]);
      return;
    }
    // Anchor marker above the building's collision-box top, with
    // a small gap so the chevron doesn't overlap the roofline.
    const top = officeEntity.y + (officeEntity.collisionBox?.offsetY ?? -64);
    app.setQuestMarkers([
      {
        id: 'intro-office',
        x: officeEntity.x,
        y: top + 60,
        spriteKey: 'edge-arrow-south',
      },
    ]);
    return () => { app.setQuestMarkers([]); };
  }, [currentMapId, questStatuses]);

  const handleAdvanceDialogue = useCallback(() => {
    // Locked-district dialogues are React-only — the engine never
    // knew they opened, so its ADVANCE_DIALOGUE command would no-op.
    // Dismiss directly here. Any future synthetic / engine-bypass
    // dialogue should branch on its npcId the same way.
    if (dialogue?.npcId === 'locked-district') {
      setDialogue(null);
      return;
    }
    const app = pixiAppRef.current;
    if (!app) return;
    app.commandQueue.push({ type: 'ADVANCE_DIALOGUE' });
  }, [dialogue]);

  const closeDialogueEverywhere = useCallback(() => {
    setDialogue(null);
    pixiAppRef.current?.commandQueue.push({ type: 'CLOSE_DIALOGUE' });
  }, []);

  /** Route the dialogue's option-button clicks. The DialogueOverlay
   *  reports the option id; here we decide what to actually do.
   *
   *  Two-step flow for the translator job:
   *   - 'help'    → push a follow-up dialogue letting the player pick
   *                 a translation mode (only the text-recognition mode
   *                 is enabled for v1; the others render with a SOON
   *                 badge and a `disabled` flag).
   *   - 'mode-read' → start the for-money translation session.
   *   - 'view'    → close dialogue, pop the vocabulary list (mock
   *                 practice flow).
   *   - 'decline' → close dialogue, end the conversation cleanly.
   *
   *  Anything we don't recognise just dismisses the dialogue so the
   *  player isn't stuck on a button we forgot to wire. */
  const handleSelectDialogueOption = useCallback((optionId: string) => {
    if (!dialogue) return;
    const packId = dialogue.vocabularyPackId;

    if (optionId === 'view' && packId) {
      setVocabularyView({ packId, npcName: dialogue.npcName });
      closeDialogueEverywhere();
      return;
    }
    if (optionId === 'decline') {
      closeDialogueEverywhere();
      return;
    }
    // Shopkeeper routes — Browse pops the shop modal, Maybe later
    // closes the dialogue cleanly.
    if (optionId === 'shop-browse') {
      const shopName = dialogue.npcName || 'Shop';
      setShopView({ shopName });
      closeDialogueEverywhere();
      return;
    }
    if (optionId === 'shop-leave') {
      closeDialogueEverywhere();
      return;
    }
    // Child quest routes — give-the-sandwich consumes the item,
    // sets CHILD_FED, and pushes a thank-you reply (single line, no
    // options). Decline just closes; the dialogue can be reopened
    // later to give the sandwich. Inventory and flags are read
    // fresh each branch so the click reflects current state, not a
    // stale snapshot from when the menu rendered.
    if (optionId === 'child-give-sandwich') {
      if (consumeItem('sandwich', 1)) {
        completeQuest('child-sandwich');
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          lines: ['Yes! Thank you, dad!'],
          currentLine: 0,
        });
      } else {
        // Lost the sandwich between menu render and click (shouldn't
        // happen in normal play, but guard so we never crash).
        closeDialogueEverywhere();
      }
      return;
    }
    if (optionId === 'child-decline') {
      closeDialogueEverywhere();
      return;
    }
    // Theo's lender flow — Borrow adds $5 to balance + debt, Repay
    // pays as much as possible (min(balance, debt)), Leave just
    // closes. After each mutation we re-render Theo's dialogue
    // from fresh state so the ledger line and button-disabled
    // states stay accurate without closing-and-reopening.
    if (optionId === 'lender-borrow') {
      borrowFromTheo();
      setDialogue(buildLenderDialogue(dialogue));
      return;
    }
    if (optionId === 'lender-repay') {
      const paid = repayMax();
      if (paid > 0 && getDebt() === 0) {
        // Square — show a closing line instead of the menu so the
        // moment lands. Player can re-engage to borrow again.
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          lines: [`Paid in full — we're square. ${formatBalance(paid)} settled.`],
          currentLine: 0,
        });
      } else {
        setDialogue(buildLenderDialogue(dialogue));
      }
      return;
    }
    if (optionId === 'lender-leave') {
      closeDialogueEverywhere();
      return;
    }
    // CEO's intro hire flow — both options complete the tutorial
    // quest, with mildly different parting lines for flavor. The
    // quest-complete toast fires automatically on `completeQuest`,
    // so the player sees the closer dialogue + the toast banner
    // back-to-back.
    if (optionId === 'ceo-intro-confident' || optionId === 'ceo-intro-honest') {
      const closer =
        optionId === 'ceo-intro-confident'
          ? "Confidence. Good. Don't make me regret this."
          : "Mostly's enough. Honest answer too. Start today.";
      completeQuest('intro-translator-job');
      setDialogue({
        npcId: dialogue.npcId,
        npcName: dialogue.npcName,
        lines: [
          closer,
          "Way it works: people in town need help with words. You translate. They pay. I get a cut. Off you go.",
        ],
        currentLine: 0,
      });
      return;
    }
    if (optionId === 'help' && packId) {
      // Step 2: pick the translation mode. Only `mode-read` is wired
      // up — the other three render disabled with a "SOON" badge so
      // the player can see the full menu coming.
      setDialogue({
        npcId: dialogue.npcId,
        npcName: dialogue.npcName,
        lines: ['Great! How would you like to translate them?'],
        currentLine: 0,
        vocabularyPackId: packId,
        vocabularyWordCount: dialogue.vocabularyWordCount,
        options: [
          {
            id: 'mode-read',
            label: '1. Read & translate',
            hint: 'See each word in writing, pick its meaning.',
          },
          {
            id: 'mode-listen',
            label: '2. Listen & translate',
            hint: 'Hear each word spoken, pick its meaning.',
          },
          {
            id: 'mode-write',
            label: '3. Write from meaning',
            hint: 'See the meaning, type the word.',
          },
          {
            id: 'mode-speak',
            label: '4. Speak from meaning',
            hint: 'See the meaning, say the word out loud.',
            comingSoon: true,
          },
        ],
      });
      return;
    }
    if (optionId === 'mode-read' && packId) {
      setTranslateView({ packId, npcName: dialogue.npcName, mode: 'read' });
      closeDialogueEverywhere();
      return;
    }
    if (optionId === 'mode-listen' && packId) {
      setTranslateView({ packId, npcName: dialogue.npcName, mode: 'listen' });
      closeDialogueEverywhere();
      return;
    }
    if (optionId === 'mode-write' && packId) {
      setTranslateView({ packId, npcName: dialogue.npcName, mode: 'write' });
      closeDialogueEverywhere();
      return;
    }
    // Fallback for unknown ids — dismiss rather than silently swallow.
    closeDialogueEverywhere();
  }, [dialogue, closeDialogueEverywhere]);

  const handleCloseVocabularyView = useCallback(() => {
    setVocabularyView(null);
  }, []);

  const handleCloseTranslateView = useCallback(() => {
    setTranslateView(null);
  }, []);

  const handleOpenMinimap = useCallback(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    const map = app.getMapData();
    const state = app.getGameState();
    if (map && state) {
      setMinimapData({ map, state });
    }
  }, []);

  const handleCloseMinimap = useCallback(() => {
    setMinimapData(null);
  }, []);

  const handleDPadChange = useCallback((dir: { up: boolean; down: boolean; left: boolean; right: boolean } | null) => {
    pixiAppRef.current?.setVirtualDirection(dir);
  }, []);

  const btnStyle: React.CSSProperties = {
    ...HUD.iconButtonStyle,
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        inset: 0,
        // Trust CSS for the outer container — `100dvh` is the dynamic
        // viewport height that updates correctly across iOS URL-bar
        // collapse / status-bar resizing without us having to chase
        // visualViewport from JS. The earlier `${viewportSize.height}px`
        // approach raced iOS at boot and could leave a too-short
        // container for the first paint (BL-14: black strip at the
        // bottom on first portrait load that only cleared after a
        // rotation). The viewportSize state still exists below — used
        // only as a change-trigger to call pixiApp.resize() so Pixi's
        // internal buffer follows the container.
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        // Suppress browser text-selection / long-press selection /
        // tap-highlight on the game viewport. Without these, users
        // could highlight dialogue text by dragging, get the iOS
        // long-press callout menu (copy/share) on the canvas, or see
        // the Android blue tap-highlight box on every interaction.
        // The pure-prefix versions cover Safari iOS specifically.
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* PixiJS canvas mounts here. The inline `<style>` forces the
          canvas DOM child to fill the container regardless of what
          Pixi's autoDensity sizing wrote into canvas.style — that's
          the actual mechanism that hides the iOS "black strip at
          bottom" bug. Pixi's internal screen size may briefly lag
          (we still resize it via the ResizeObserver and the catch-up
          timers), but the canvas pixels are stretched/sampled to
          fill the container so nothing visible drops to body bg.
          For nearest-neighbor pixel art this just means ~1px of
          temporary upscale — invisible compared to a black gap. */}
      <div
        ref={containerRef}
        className="lingo-pixi-host"
        style={{ position: 'absolute', inset: 0 }}
      >
        <style>{`
          .lingo-pixi-host > canvas {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
          }
        `}</style>
      </div>

      {/* Boot loading overlay — sits above the canvas while assets
          load and the first scene mounts. Pixi's first frame can flash
          the renderer's clear colour (a void-black square) before the
          ground layer paints; the overlay hides that flash. Fades out
          once `pixiApp.init()` resolves. */}
      {loadingVisible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            background: '#1a2a1a',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'monospace',
            opacity: loading ? 1 : 0,
            transition: 'opacity 350ms ease-out',
            pointerEvents: loading ? 'auto' : 'none',
          }}
        >
          <style>{`
            @keyframes lingoMapSpin { to { transform: rotate(360deg); } }
            @keyframes lingoMapPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
            /* Character 7 walk-down cycle: idle → walk1 → idle → walk2.
               Atlas is 192×640 at native scale; at 4× we display 768×2560
               and the down row sits at y=192 → -768px in 4× space. */
            @keyframes lingoMapWalkDown {
              0%, 24.99%  { background-position:    0px -768px; }
              25%, 49.99% { background-position:  -64px -768px; }
              50%, 74.99% { background-position:    0px -768px; }
              75%, 100%   { background-position: -128px -768px; }
            }
          `}</style>
          <div style={{ fontSize: 22, letterSpacing: 2, animation: 'lingoMapPulse 1.4s ease-in-out infinite' }}>
            SURVIVE LINGO
          </div>
          <div
            aria-hidden
            style={{
              width: 64,
              height: 128,
              backgroundImage: 'url(/assets/me-char-atlas.webp)',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '768px 2560px',
              imageRendering: 'pixelated',
              animation: 'lingoMapWalkDown 0.6s steps(1, end) infinite',
            }}
          />
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.18)',
              borderTopColor: 'rgba(255,255,255,0.85)',
              animation: 'lingoMapSpin 0.9s linear infinite',
            }}
          />
          <div style={{ fontSize: 11, opacity: 0.55 }}>loading…</div>
        </div>
      )}

      {/* Door-transition fade-to-black. CSS transition does the
          animation; React just toggles the boolean. The 220ms
          out/180ms in pair matches the FADE_OUT_MS in PixiApp so the
          screen is fully black before `loadScene` starts and the
          new scene appears under the overlay before the fade-in
          starts. zIndex sits below the dialogue/UI overlay (zIndex=10)
          but above the canvas (zIndex=0). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: transitionFade ? 1 : 0,
          transition: transitionFade ? 'opacity 220ms ease-in' : 'opacity 180ms ease-out',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />

      {/* Build-version stamp — bumped manually in src/version.ts on
          every commit so a quick glance from the phone confirms whether
          the latest deploy is actually live (vs. the SW serving a
          stale bundle). Bottom-left, low alpha, no pointer events. */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 6,
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'rgba(255, 235, 90, 0.75)',
          textShadow: '0 0 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          zIndex: 10,
          userSelect: 'none',
        }}
      >v{APP_VERSION}</div>

      {/* UI overlay — always on top of canvas */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        {/* Top-left HUD pill row — aligned to the same top edge as
            the top-right icon buttons. Wrapped in a flex container
            so future pills (focus, hunger, whatever) stay a single
            child append. Subscribes via useWalletBalance / useEnergy
            so vocab views don't have to call back up here. */}
        <div
          style={HUD.statusRowStyle}
        >
          <div
            style={HUD.statusPlateStyle}
            aria-label={`Balance: ${formatBalance(walletBalance)}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="square" strokeLinejoin="miter" style={{ color: COLORS.coinGold }}>
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
              <path d="M12 18V6"></path>
            </svg>
            <span style={{ minWidth: 46, textAlign: 'right' }}>{formatBalance(walletBalance)}</span>
          </div>

          {/* Debt pill — appears only while the player owes Theo
              money. Red border + minus-prefixed amount makes the
              negative-money state obvious without making the wallet
              pill itself ambiguous. Hides automatically when debt
              hits 0 (e.g. after Repay) so a debt-free player sees a
              clean wallet. */}
          {debt > 0 && (
            <div
              style={HUD.debtPlateStyle}
              aria-label={`Debt to Theo: ${formatBalance(debt)}`}
              title={`You owe Theo ${formatBalance(debt)}`}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>📜</span>
              <span>-{formatBalance(debt)}</span>
            </div>
          )}

          {/* Energy pill — lights up against the wallet at full,
              dims as it drains. Tinted accent (cyan-ish) keeps it
              visually distinct from the wallet's amber. */}
          <div
            style={{
              ...HUD.energyPlateStyle,
              opacity: energy === 0 ? 0.55 : 1,
            }}
            aria-label={`Energy: ${energy} of ${energyMax}`}
            title={energy === 0 ? 'Out of energy — eat something to keep working.' : `Energy ${energy}/${energyMax}`}
          >
            <span style={{ fontSize: 13, lineHeight: 1, color: COLORS.energyAccent }}>⚡</span>
            <span>{energy}/{energyMax}</span>
          </div>
        </div>

        {/* Inventory HUD — sits right under the wallet/energy row,
            one chip per held item with its emoji icon and a ×N
            counter. Tappable: opens the inventory modal where the
            player can eat held food to refill energy. Hides
            entirely when empty so the corner stays clean for new
            players. */}
        {inventoryRows.length > 0 && (
          <button
            onClick={() => setInventoryOpen(true)}
            style={HUD.inventoryButtonStyle}
            aria-label={`Inventory (tap to open): ${inventoryRows.map((r) => `${r.count} ${r.def.name}`).join(', ')}`}
            title="Open bag"
          >
            {inventoryRows.map((row) => (
              // Each chip gets its own outlined pill so neighbouring
              // items don't visually merge into "(apple sandwich) ×2".
              // The ×N counter renders even at count 1 (always
              // shows what belongs to which icon, no ambiguity).
              <span
                key={row.id}
                style={HUD.inventoryChipStyle}
                title={`${row.def.name} ×${row.count}`}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{row.def.icon}</span>
                <span style={{ fontSize: 11 }}>×{row.count}</span>
              </span>
            ))}
          </button>
        )}

        {/* Top-right icon group */}
        <div
          style={HUD.iconGroupStyle}
        >
          {/* Sound toggle — always visible */}
          <button
            onClick={handleToggleSound}
            style={btnStyle}
            aria-label={soundOn ? 'Mute background music' : 'Unmute background music'}
          >
            {soundOn ? (
              // Speaker on
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z" fill="currentColor" />
                <path d="M12 6.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14 4a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            ) : (
              // Speaker off (muted X)
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z" fill="currentColor" opacity="0.5" />
                <line x1="12" y1="8" x2="17" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="17" y1="8" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* Map button — only on outdoor map */}
          {(currentMapId === 'outdoor' || currentMapId === 'custom') && (
            <button
              onClick={handleOpenMinimap}
              style={btnStyle}
              aria-label="Open map"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <circle cx="10" cy="10" r="2" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Quest log — opens the modal listing active + completed
              quests. Always visible so the player can re-read the
              objective whenever they want. */}
          <button
            onClick={() => setQuestLogOpen(true)}
            style={btnStyle}
            aria-label="Open quest log"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="2" width="14" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="6" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Word stats — chart icon. Sits between the quest log
              and settings since it's progress-data, not destructive. */}
          <button
            onClick={() => setWordStatsOpen(true)}
            style={btnStyle}
            aria-label="Open word stats"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="17" x2="17" y2="17" />
              <rect x="4" y="11" width="2.5" height="5" fill="currentColor" stroke="none" />
              <rect x="8.75" y="7" width="2.5" height="9" fill="currentColor" stroke="none" />
              <rect x="13.5" y="4" width="2.5" height="12" fill="currentColor" stroke="none" />
            </svg>
          </button>

          {/* Settings — gear icon. Houses the destructive Reset-game
              action; placed last in the group so it's visually the
              "outermost" affordance. */}
          <button
            onClick={() => setSettingsOpen(true)}
            style={btnStyle}
            aria-label="Open settings"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="2.5" />
              <path d="M10 1.5v2.4M10 16.1v2.4M3.5 3.5l1.7 1.7M14.8 14.8l1.7 1.7M1.5 10h2.4M16.1 10h2.4M3.5 16.5l1.7-1.7M14.8 5.2l1.7-1.7" />
            </svg>
          </button>
        </div>

        {dialogue && (
          <div style={{ pointerEvents: 'auto' }}>
            <DialogueOverlay
              dialogue={dialogue}
              onAdvance={handleAdvanceDialogue}
              onSelectOption={handleSelectDialogueOption}
            />
          </div>
        )}

        {vocabularyView && (() => {
          const pack = getVocabularyPack(vocabularyView.packId);
          if (!pack) return null;
          return (
            <div style={{ pointerEvents: 'auto' }}>
              <VocabularyListView
                pack={pack}
                npcName={vocabularyView.npcName}
                onClose={handleCloseVocabularyView}
              />
            </div>
          );
        })()}

        {translateView && (() => {
          const pack = getVocabularyPack(translateView.packId);
          if (!pack) return null;
          return (
            <div style={{ pointerEvents: 'auto' }}>
              <VocabularyTranslateView
                pack={pack}
                npcName={translateView.npcName}
                mode={translateView.mode}
                onClose={handleCloseTranslateView}
              />
            </div>
          );
        })()}

        {shopView && (
          <div style={{ pointerEvents: 'auto' }}>
            <ShopView
              shopName={shopView.shopName}
              onClose={() => setShopView(null)}
            />
          </div>
        )}

        {questLogOpen && (
          <div style={{ pointerEvents: 'auto' }}>
            <QuestLog onClose={() => setQuestLogOpen(false)} />
          </div>
        )}

        {inventoryOpen && (
          <div style={{ pointerEvents: 'auto' }}>
            <InventoryView onClose={() => setInventoryOpen(false)} />
          </div>
        )}

        {wordStatsOpen && (
          <div style={{ pointerEvents: 'auto' }}>
            <WordStatsView onClose={() => setWordStatsOpen(false)} />
          </div>
        )}

        {settingsOpen && (
          <div style={{ pointerEvents: 'auto' }}>
            <SettingsView onClose={() => setSettingsOpen(false)} />
          </div>
        )}

        {/* Quest toast — fixed-positioned at the top, subscribes to
            quest transitions on its own, no props. Always rendered
            so it picks up events from any source (dialogue, future
            world triggers). pointer-events: none on the wrapper so
            it never blocks the canvas. */}
        <QuestToast />

        {/* Phase-2 nav hint — auto-hides once the intro quest is
            completed. Sits just under the HUD pills so it doesn't
            cover the world. */}
        <IntroHintBanner />

        {/* Intro cutscene — full-screen overlay shown once on a
            fresh save (or after a dev reset). Blocks the world
            from booting (see init effect's `cutsceneActive` gate)
            so the canvas can't peek through. On completion: saves
            names to profile, sets the cutscene-seen flag, starts
            the tutorial quest, then flips `cutsceneActive` false
            which kicks off PixiApp boot with the in-house spawn
            override. */}
        {cutsceneActive && (
          <div style={{ pointerEvents: 'auto' }}>
            <IntroCutscene
              onComplete={() => {
                // No teleport needed — the engine already booted with
                // startMapId/startSpawnId pointing inside the house
                // (see init effect's `cutsceneActive` branch). This
                // avoids the brief outdoor-flash that the post-cutscene
                // teleport approach produced.
                setCutsceneActive(false);
              }}
            />
          </div>
        )}

        {minimapData && (
          <div style={{ pointerEvents: 'auto' }}>
            <Minimap
              mapData={minimapData.map}
              gameState={minimapData.state}
              onClose={handleCloseMinimap}
            />
          </div>
        )}

        {/* Mobile virtual D-pad — auto-hides on desktop. Suppressed
            during dialogue so the pad doesn't sit on top of the
            dialogue box and accidentally walk the player while reading. */}
        {!dialogue && !minimapData && (
          <VirtualDPad onChange={handleDPadChange} />
        )}
      </div>
    </div>
  );
}
