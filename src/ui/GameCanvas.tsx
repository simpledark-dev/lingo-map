"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { normalizeObjectMultiplier } from "../core/MapStress";
import { loadMap, registerMap } from "../core/MapLoader";
import { PixiApp } from "../renderer/PixiApp";
import { DialogueState, MapData, GameState } from "../core/types";
import { GameEvent } from "../core/GameBridge";
import DialogueOverlay from "./DialogueOverlay";
import CafeIntroScene from "./CafeIntroScene";
import SocialHubScene from "./SocialHubScene";
import VocabularyListView from "./VocabularyListView";
import VocabularyTranslateView from "./VocabularyTranslateView";
import ShopView from "./ShopView";
import ComputerUpgradeView from "./ComputerUpgradeView";
import { getVocabularyPack } from "../data/vocabularyPacks";
import {
  useWalletBalance,
  useLifetimeEarnings,
  formatBalance,
  getBalance,
  getLifetimeEarnings,
  addBalance,
  getRewardPerCorrect,
  PENALTY_PER_WRONG,
  PENALTY_PER_IDK,
} from "../data/wallet";
import { hasItem, consumeItem, useInventory } from "../data/inventory";
import { getItem, getItemName } from "../data/items";
import { useEnergy, getMaxEnergy, restoreEnergy } from "../data/energy";
import {
  borrowFromTheo,
  repayMax,
  getDebt,
  useDebt,
  canBorrow,
  BORROW_INCREMENT_CENTS,
  MAX_DEBT_CENTS,
} from "../data/debt";
import {
  startQuest,
  completeQuest,
  getQuestStatus,
  useQuestStatuses,
  subscribeQuestTransitions,
  setQuestVisibilityDeferred,
  getQuestDef,
  type QuestTransition,
  FIRST_PAYCHECK_THRESHOLD_CENTS,
  SECOND_PAYCHECK_PHASE_CENTS,
  THIRD_PAYCHECK_PHASE_CENTS,
  FIRST_PAYCHECK_BONUS_CENTS,
} from "../data/quests";
import { getQuestEarnings, useQuestEarnings } from "../data/questEarnings";
import QuestToast from "./QuestToast";
import QuestLog from "./QuestLog";
import InventoryView from "./InventoryView";
import IntroCutscene from "./IntroCutscene";
import WelcomeScreen from "./WelcomeScreen";
import LocalePickerScreen from "./LocalePickerScreen";
import { hasPickedLocale, markLocalePicked, setLocale, useLocale, t } from "../data/i18n";
import {
  hasPickedTarget,
  markTargetPicked,
  setTarget,
  type TargetLanguage,
} from "../data/target";
import TargetPickerScreen from "./TargetPickerScreen";
import QuestHud from "./QuestHud";
import SettingsView from "./SettingsView";
import WordStatsView from "./WordStatsView";
import { hasFlag, setFlag, FLAGS } from "../data/eventFlags";
import { getPlayerName, getChildName, setProfile } from "../data/profile";
import Minimap from "./Minimap";
import VirtualDPad from "./VirtualDPad";
import { APP_VERSION } from "../version";
// import { playSfx, SFX } from "./sfx";
import { preloadSfx, setSfxEnabled, setTapMoveSfxEnabled } from "./sfx";
import EnergyCostBurst from "./EnergyCostBurst";
import { getUiTheme } from "./uiThemes";
import { clearWorldSave, loadWorldSave } from "../data/worldSave";
import { resetAllGameData } from "../data/reset";
import {
  getMusicEnabled,
  getMarkerLabelStyle,
  getTapMoveSoundEnabled,
  getVirtualDPadEnabled,
  setMarkerLabelStyle as persistMarkerLabelStyle,
  setMusicEnabled as persistMusicEnabled,
  setTapMoveSoundEnabled as persistTapMoveSoundEnabled,
  setVirtualDPadEnabled as persistVirtualDPadEnabled,
} from "../data/settings";
import { getComputerUpgradeLevel, useComputerUpgradeLevel } from "../data/computerUpgrade";
import { useUpgradeTimer } from "../data/computerUpgradeTimer";
import type { MarkerLabelStyleId } from "../data/markerLabelStyles";

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;
const HUD = UI_THEME.hud;

// Dialogue builders + apartment script were extracted to a sibling
// module so they can be unit-tested without spinning up the canvas.
// Re-exported here so existing imports keep working until callers
// migrate.
import {
  buildChildSandwichDialogue,
  buildLenderDialogue,
  buildCeoIntroDialogue,
  buildOfficeTutorDialogue,
  buildListenTutorDialogue,
  buildWriteTutorDialogue,
  APARTMENT_DIALOGUE,
} from './dialogueBuilders';

/** Quests whose objective is "go talk to NPC X". The marker driver
 * floats a red chevron over the named NPC whenever the quest is
 * active and the player is on the NPC's map. NPC lookup is by
 * `name` so the table stays robust against id renames in map JSON.
 * Cross-map cases (player needs to enter the NPC's map first) stay
 * in the bespoke building-marker blocks — only "you're in the right
 * room, here's the person" is generalized through this table. */
const QUEST_TALK_TARGETS: ReadonlyArray<{
  questId: string;
  npcName: string;
  mapId: string;
}> = [
  { questId: "intro-translator-job", npcName: "CEO", mapId: "office" },
  { questId: "first-paycheck", npcName: "Eli", mapId: "office" },
  { questId: "second-paycheck", npcName: "Rina", mapId: "office" },
  { questId: "third-paycheck", npcName: "Yusuf", mapId: "office" },
  { questId: "child-sandwich", npcName: "Mim", mapId: "pokemon-house-1f" },
  { questId: "tutorial-borrow", npcName: "Theo", mapId: "pokemon" },
  { questId: "tutorial-buy-food", npcName: "Shopkeeper", mapId: "grocer-1f" },
];

type ViewportSize = { width: number; height: number };

function readViewportSize(): ViewportSize | null {
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  const doc = document.documentElement;
  const width = Math.round(
    Math.max(vv?.width ?? 0, window.innerWidth || 0, doc.clientWidth || 0),
  );
  const height = Math.round(
    Math.max(vv?.height ?? 0, window.innerHeight || 0, doc.clientHeight || 0),
  );
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}


function readInitialObjectMultiplier(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(
    window.location.search
      ? new URLSearchParams(window.location.search).get("objects")
      : null,
  );
  return normalizeObjectMultiplier(value);
}

/** Apply boot-time URL parameters to the language settings. Runs
 *  AT MOST ONCE per page load (guarded by `urlParamsApplied`) and
 *  is intentionally called from the picker useState initializers
 *  so the gates evaluate AFTER the params have been written —
 *  prevents a one-frame flash of the picker before the URL takes
 *  effect.
 *
 *  Supported params:
 *    `?native=en|vi`              — pre-pick the native locale.
 *    `?target=lingo|french|english` — pre-pick the target language.
 *  Both also trip `markLocalePicked` / `markTargetPicked` so the
 *  pickers skip on this AND every subsequent load (localStorage
 *  persists even after the link is closed). */
let urlParamsApplied = false;
function applyLanguageUrlParamsOnce(): void {
  if (urlParamsApplied) return;
  if (typeof window === "undefined") return;
  urlParamsApplied = true;
  const params = new URLSearchParams(window.location.search);
  const native = params.get("native");
  if (native === "en" || native === "vi") {
    setLocale(native);
    markLocalePicked();
  }
  const target = params.get("target");
  if (target === "lingo" || target === "french" || target === "english") {
    setTarget(target as TargetLanguage);
    markTargetPicked();
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement))
    return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const [soundOn, setSoundOn] = useState(getMusicEnabled);
  const soundOnRef = useRef(soundOn);
  const [virtualDPadEnabled, setVirtualDPadEnabledState] = useState(
    getVirtualDPadEnabled,
  );
  const [tapMoveSoundEnabled, setTapMoveSoundEnabledState] = useState(
    getTapMoveSoundEnabled,
  );
  const [markerLabelStyle, setMarkerLabelStyleState] = useState(
    getMarkerLabelStyle,
  );
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  // While a dialogue is on screen, hold any new-quest pulse / quest-
  // toast that fires from a completeQuest or startQuest happening
  // inside the dialogue handler. The QuestHud and QuestToast resume
  // the moment the player dismisses the dialogue — gives an NPC's
  // wrap-up line ("Thank you, dad!") room to land before the next
  // "📜 NEW QUEST" beat overlaps it.
  //
  // Asymmetric timing: opening a dialogue silences instantly so a
  // toast that hasn't yet started its slide-in cancels mid-flight.
  // Closing a dialogue waits 400ms before flushing — the dialogue
  // overlay needs time to visually clear before the toast slides
  // down from the top, otherwise the two animations collide and
  // the player's eye doesn't have a moment to pivot. The 400ms beat
  // also reads as an intentional "and now…" pause rather than a
  // chained side effect.
  useEffect(() => {
    if (dialogue !== null) {
      setQuestVisibilityDeferred(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setQuestVisibilityDeferred(false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dialogue]);
  /** When the player picks "Let me look them over first" from a
   *  translator-offer dialogue, we capture the pack id + the NPC's
   *  name here and render `VocabularyListView` over the world. The
   *  dialogue closes; the list takes over until the player closes
   *  it via the back button or the dim background. */
  const [vocabularyView, setVocabularyView] = useState<{
    packId: string;
    npcName: string;
    /** Snapshot of the offer dialogue we came FROM. Closing the
     *  word-list pops this back so the player lands on the
     *  Help / View / Decline menu again instead of a silent close
     *  (which made the player feel like the game forgot why they
     *  came). Null when the view was opened from a non-offer
     *  flow — closing then just exits the view. */
    returnDialogue: DialogueState | null;
  } | null>(null);
  /** Same shape, but for the for-money translation work session. The
   *  player gets here by accepting the offer (option 1) then picking
   *  one of the mode buttons. `mode` distinguishes the recognition
   *  surface — `read` shows the target word as text, `listen` hides
   *  it and the player has to identify by audio alone. Same picker,
   *  same wallet, same wrong-queue underneath. */
  const [translateView, setTranslateView] = useState<{
    packId: string;
    npcName: string;
    mode: "read" | "listen" | "write";
  } | null>(null);
  const translationModeReturnDialogueRef = useRef<DialogueState | null>(null);
  /** Shop modal state — opened when the player selects "Browse" on
   *  a shopkeeper's offer dialogue. Carries only the display name;
   *  the catalog lives in `src/data/items.ts` and is shared across
   *  every shop. Null = closed. */
  const [shopView, setShopView] = useState<{ shopName: string } | null>(null);
  /** Computer upgrade modal — opened from the apartment computer's
   *  object dialogue. Null/false means the world can resume unless
   *  some other overlay is active. */
  const [computerUpgradeOpen, setComputerUpgradeOpen] = useState(false);
  /** Quest log modal — opened via the HUD scroll button. */
  const [questLogOpen, setQuestLogOpen] = useState(false);
  const [questLogFocusId, setQuestLogFocusId] = useState<string | null>(null);
  /** True when a quest has started since the player last opened the
   *  log. Drives a pulse on the quest button so a chained start
   *  (catch-up effect auto-firing the next quest right after the
   *  previous one completes) doesn't slip past unnoticed. Persisted
   *  so a reload doesn't silently swallow the cue. */
  const [questHasUnread, setQuestHasUnread] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem('lingo-quest:has-unread') === '1'; } catch { return false; }
  });
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
    if (typeof window === "undefined") return false;
    // Dev replay: `?intro=replay` wipes the cutscene flag + names so
    // the cutscene fires again on this load. Strictly for testing —
    // not surfaced in normal UI. Done in the state initializer so
    // the flag check below sees the cleared state.
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "replay") {
      // Full wipe so the replay test mirrors a brand-new save —
      // otherwise leftover quest state from prior runs leaks
      // through (e.g. child-sandwich already active triggers a
      // marker on Mim during the apartment monologue, which is
      // jarring and incorrect for a player who hasn't done the
      // first paycheck yet).
      resetAllGameData();
    }
    return !hasFlag(FLAGS.INTRO_CUTSCENE_SEEN);
  });
  // Brand splash before the cutscene on a fresh save. Same gating
  // as the cutscene so a returning player who's already been
  // branded doesn't sit through it again. Welcome's fade-out
  // overlaps cutscene's mount (see `welcomeFading` below) so the
  // user never sees the canvas peek through.
  const [welcomeActive, setWelcomeActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !hasFlag(FLAGS.INTRO_CUTSCENE_SEEN);
  });
  // Flips true the moment the welcome splash starts fading out.
  // The cutscene mounts on this signal — its sky-gradient backdrop
  // sits behind the still-visible-but-fading splash, so the
  // 360ms cross-fade reveals the cutscene's gradient instead of
  // the F1 room briefly flashing through.
  const [welcomeFading, setWelcomeFading] = useState(false);
  // Locale picker — shown between welcome → cutscene on a fresh
  // save (no `lingo-locale:picked` flag yet). Mounted on its own
  // overlay layer so the cutscene only mounts after the player
  // has explicitly chosen English or Vietnamese. Returning
  // players who've already picked skip this screen entirely.
  //
  // Calls `applyLanguageUrlParamsOnce` BEFORE reading `hasPickedLocale`
  // so a link like `?native=vi` skips the picker on this same render
  // (no one-frame flash). Same trick for the target picker initializer
  // below — both share the same idempotent one-shot helper.
  const [localePickerActive, setLocalePickerActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    applyLanguageUrlParamsOnce();
    return !hasPickedLocale();
  });
  // Target-language picker — same shape as the locale picker but
  // chooses what the player is LEARNING (lingo / french / english).
  // Mounted after the locale picker so the player picks native
  // first, then target. The target picker's option list filters
  // out the locale they just picked to prevent native===target.
  const [targetPickerActive, setTargetPickerActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    applyLanguageUrlParamsOnce();
    return !hasPickedTarget();
  });
  // useLocale subscription forces a re-render of the whole
  // GameCanvas tree whenever the player flips the language —
  // every t() call inside child components reads the latest
  // locale on the new render.
  useLocale();
  // True during the 1.2s gap between cutscene-end and the
  // apartment monologue mounting. Without this, mobile players
  // can tap on Mim (who's spawned right next to them) before the
  // monologue fires, kicking off downstream interactions out of
  // order. Folded into worldPausedByOverlay below so all input is
  // gated for the duration.
  //
  // PRE-ARMED at mount when we already know the apartment dialogue
  // is going to fire on this load — i.e., the player has seen the
  // cutscene before but never reached the apartment monologue.
  // Without pre-arming, there's a startup window between engine
  // boot and the apartment-trigger effect running where the world
  // is unpaused; a queued tap on Mim during that window fires her
  // dialogue before the monologue mounts. The trigger effect's
  // setTimeout will clear this flag when the dialogue actually
  // appears.
  const [introGapActive, setIntroGapActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return hasFlag(FLAGS.INTRO_CUTSCENE_SEEN) && !hasFlag(FLAGS.INTRO_APARTMENT_SEEN);
  });
  const [minimapData, setMinimapData] = useState<{
    map: MapData;
    state: GameState;
  } | null>(null);
  const [currentMapId, setCurrentMapId] = useState("outdoor");
  // Door-transition fade-to-black. Toggled true when a door fires;
  // toggled back false on `sceneChange` (i.e., the new scene has loaded).
  const [transitionFade, setTransitionFade] = useState(false);
  const [objectMultiplier] = useState(readInitialObjectMultiplier);
  const [viewportSize, setViewportSize] = useState<ViewportSize | null>(
    readViewportSize,
  );
  // `loading` covers the boot window: from mount until pixiApp.init()
  // resolves (assets loaded, first scene mounted). `loadingVisible` is
  // a delayed sibling so we can fade out instead of popping — once
  // loading flips false we wait for the CSS transition before
  // unmounting the overlay.
  const [loading, setLoading] = useState(true);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const walletBalance = useWalletBalance();
  // Drives the first-paycheck marker handoff (Saba → CEO once the
  // earnings threshold is hit). Reading the hook here forces the
  // marker effect below to re-run whenever earnings change.
  const lifetimeEarnings = useLifetimeEarnings();
  const debt = useDebt();
  const questStatuses = useQuestStatuses();
  // Per-quest earnings counters drive the office tutorial chain's
  // auto-complete (see questEarnings.ts). Hook-subscribed here so
  // the chain useEffect re-runs the moment a translate session
  // banks another correct answer for the right mode — that's the
  // ONLY thing that should advance the chain past read → listen
  // → write.
  const secondPaycheckEarnings = useQuestEarnings('second-paycheck');
  const thirdPaycheckEarnings = useQuestEarnings('third-paycheck');
  // Computer upgrade level — drives the auto-complete check for
  // the `upgrade-computer` quest. Hook-subscribed here so the
  // chain useEffect re-runs the moment the player buys an upgrade.
  const computerLevel = useComputerUpgradeLevel();
  const computerUpgradeTimer = useUpgradeTimer();
  const firstPaycheckTargetToastShownRef = useRef(false);
  const [questToastEvent, setQuestToastEvent] = useState<QuestTransition | null>(null);

  // Pulse-the-quest-button driver. Listens for `started` transitions
  // and flips the unread flag; the QuestLog open handler clears it.
  // Refresh-safe via localStorage.
  useEffect(() => {
    return subscribeQuestTransitions((event) => {
      if (event.kind !== 'started') return;
      setQuestHasUnread(true);
      try { localStorage.setItem('lingo-quest:has-unread', '1'); } catch {}
    });
  }, []);

  // Warm the SFX cache once on mount — fetch + decodeAudioData every
  // entry in `SFX` so the first time the player triggers a chime
  // there's no network or decode cost. On Vercel the round-trip to
  // the CDN was adding a noticeable delay to the first "correct
  // answer" sound; on local dev the files are sub-ms so the lag
  // was invisible. Fire-and-forget: any per-file failure is silently
  // swallowed inside `preloadAudio`.
  useEffect(() => {
    void preloadSfx();
  }, []);

  useEffect(() => {
    const firstPaycheckActive = questStatuses["first-paycheck"] === "active";
    if (!firstPaycheckActive) {
      firstPaycheckTargetToastShownRef.current = false;
      return;
    }
    if (
      lifetimeEarnings >= FIRST_PAYCHECK_THRESHOLD_CENTS &&
      !firstPaycheckTargetToastShownRef.current
    ) {
      firstPaycheckTargetToastShownRef.current = true;
      const def = getQuestDef("first-paycheck");
      if (def) {
        setQuestToastEvent({ kind: "target-reached", def });
      }
    }
  }, [questStatuses, lifetimeEarnings]);

  const openQuestLog = useCallback((questId?: string) => {
    setQuestLogFocusId(questId ?? null);
    setQuestLogOpen(true);
    setQuestHasUnread(false);
    try { localStorage.setItem('lingo-quest:has-unread', '0'); } catch {}
  }, []);
  const worldPausedByOverlay = Boolean(
    dialogue ||
    // Welcome splash and the intro cutscene render fullscreen
    // OVER the canvas, but during their fade-out passes pointer
    // events leak through to the canvas underneath. On mobile
    // (Safari + PWA), a single tap near Mim during the fade
    // would set `_interact = true` in InputAdapter, the engine
    // would fire her dialogue mid-transition, and the apartment
    // monologue would land on top of an already-open Mim
    // conversation. Pausing the engine for the duration of these
    // overlays makes input gating identical to dialogue overlays.
    welcomeActive ||
    localePickerActive ||
    targetPickerActive ||
    cutsceneActive ||
    introGapActive ||
    vocabularyView ||
    translateView ||
    shopView ||
    computerUpgradeOpen ||
    questLogOpen ||
    inventoryOpen ||
    settingsOpen ||
    wordStatsOpen ||
    minimapData,
  );
  const questHudLiftedForModal = Boolean(
    vocabularyView ||
    translateView ||
    shopView ||
    computerUpgradeOpen ||
    questLogOpen ||
    inventoryOpen ||
    settingsOpen ||
    wordStatsOpen ||
    minimapData,
  );
  // Catch-up auto-starts: a save written before a quest's chain
  // was wired (or a player who completed a parent quest in a
  // previous version) ends up with downstream quests stuck at
  // 'inactive'. We re-fire `startQuest` for every chain whose
  // precondition is now met. `startQuest` is idempotent — it
  // no-ops once the quest is active or completed — so this is
  // safe to run on every render that quest statuses change.
  useEffect(() => {
    if (
      questStatuses["intro-translator-job"] === "completed" &&
      !questStatuses["first-paycheck"]
    ) {
      startQuest("first-paycheck");
    }
    // first-paycheck → second-paycheck → third-paycheck. Each
    // tutor introduces a new translate mode and the chain enforces
    // strict ordering: a quest only auto-completes once the player
    // has banked $2 of work IN ITS OWN MODE (listen for second,
    // write for third), tracked via a per-quest earnings counter
    // updated only by VocabularyTranslateView when the session's
    // mode matches. This means dev cheats, read-mode grinding, or
    // any other lifetime gain CANNOT close out second / third —
    // the player must actually do listen sessions on Rina and
    // write sessions on Yusuf, in order.
    //
    // Auto-complete + auto-start for the office tutorial chain
    // (second / third paycheck) are gated on
    // `!translateView && !dialogue`:
    //   - while a session is open, threshold-crossing must NOT
    //     start the next quest behind the live UI;
    //   - while a dialogue is open (e.g. the NPC's post-session
    //     thank-you set in `handleCloseTranslateView`), the chain
    //     waits so the new-quest toast + HUD row don't pop on top
    //     of the wrap-up line.
    // The first-paycheck → second-paycheck START step is also
    // gated on dialogue because the CEO claim flow itself opens
    // a dialogue — we want the "New Quest: Listen & Translate"
    // beat to land after the CEO line closes, not during it.
    const officeChainGate = !translateView && !dialogue;
    if (
      officeChainGate &&
      questStatuses["first-paycheck"] === "completed" &&
      !questStatuses["second-paycheck"]
    ) {
      startQuest("second-paycheck");
    }
    if (
      officeChainGate &&
      questStatuses["second-paycheck"] === "active" &&
      getQuestEarnings("second-paycheck") >= SECOND_PAYCHECK_PHASE_CENTS
    ) {
      completeQuest("second-paycheck");
    }
    if (
      officeChainGate &&
      questStatuses["second-paycheck"] === "completed" &&
      !questStatuses["third-paycheck"]
    ) {
      startQuest("third-paycheck");
    }
    if (
      officeChainGate &&
      questStatuses["third-paycheck"] === "active" &&
      getQuestEarnings("third-paycheck") >= THIRD_PAYCHECK_PHASE_CENTS
    ) {
      completeQuest("third-paycheck");
    }
    // After the office tutorial chain completes (Eli → Rina →
    // Yusuf), the home thread picks up: Mim asks for bread.
    // Previously chained off `first-paycheck`, which meant the
    // bread quest popped up right after Eli's job — before
    // the player had even met Rina or Yusuf. Gating on the LAST
    // tutorial keeps the office arc self-contained.
    if (
      questStatuses["third-paycheck"] === "completed" &&
      !questStatuses["child-sandwich"]
    ) {
      startQuest("child-sandwich");
    }
    // child-sandwich → upgrade-computer. Same gating discipline as
    // the office tutorial chain: don't auto-start the next quest
    // while a dialogue or modal is open (e.g. Mim's "thanks dad"
    // line that closes child-sandwich, or the upgrade modal
    // itself), and don't auto-COMPLETE the quest mid-modal — let
    // the player close the upgrade modal first so the toast
    // doesn't fire behind it. Auto-complete fires when the player
    // has reached level 1 (i.e. bought ANY upgrade past broken).
    const upgradeChainGate = !computerUpgradeOpen && !dialogue;
    if (
      upgradeChainGate &&
      questStatuses["child-sandwich"] === "completed" &&
      !questStatuses["upgrade-computer"]
    ) {
      startQuest("upgrade-computer");
    }
    if (
      upgradeChainGate &&
      questStatuses["upgrade-computer"] === "active" &&
      computerLevel >= 1
    ) {
      completeQuest("upgrade-computer");
    }
    // Bread → tutorial chain (borrow → buy → eat). Each step
    // teaches one piece of the survival loop. Completion of each
    // step is fired from the relevant action handler so the
    // start-of-next-step toast lands exactly when the player
    // performs the just-taught action.
    if (
      questStatuses["child-sandwich"] === "completed" &&
      !questStatuses["tutorial-borrow"]
    ) {
      startQuest("tutorial-borrow");
    }
    if (
      questStatuses["tutorial-borrow"] === "completed" &&
      !questStatuses["tutorial-buy-food"]
    ) {
      startQuest("tutorial-buy-food");
    }
    if (
      questStatuses["tutorial-buy-food"] === "completed" &&
      !questStatuses["tutorial-eat"]
    ) {
      startQuest("tutorial-eat");
    }
    // secondPaycheckEarnings / thirdPaycheckEarnings are referenced
    // implicitly via getQuestEarnings() inside the body — listing
    // them in deps forces the effect to re-run when their counters
    // increment, so auto-complete fires the same render the
    // threshold is crossed.
  }, [questStatuses, lifetimeEarnings, secondPaycheckEarnings, thirdPaycheckEarnings, translateView, dialogue, computerLevel, computerUpgradeOpen]);
  const energy = useEnergy();
  const energyMax = getMaxEnergy();
  const inventory = useInventory();
  // Visible inventory rows, sorted alphabetically by item name for
  // a stable order across renders. Filtered to known catalog ids so
  // a stale localStorage entry from a removed item doesn't render
  // as a "?" chip.
  const inventoryRows = Object.entries(inventory)
    .flatMap(([id, count]) => {
      const def = getItem(id);
      return def ? [{ id, count, def, name: getItemName(id) }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const syncViewportSize = useCallback(() => {
    const next = readViewportSize();
    if (!next) return null;
    setViewportSize((prev) =>
      prev && prev.width === next.width && prev.height === next.height
        ? prev
        : next,
    );
    return next;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
      timers = [120, 360, 800].map((delay) =>
        window.setTimeout(applySize, delay),
      );
    };

    scheduleSizeSync();
    window.addEventListener("resize", scheduleSizeSync);
    window.addEventListener("orientationchange", scheduleSizeSync);
    window.addEventListener("pageshow", scheduleSizeSync);
    window.visualViewport?.addEventListener("resize", scheduleSizeSync);
    window.visualViewport?.addEventListener("scroll", scheduleSizeSync);
    window.screen.orientation?.addEventListener?.("change", scheduleSizeSync);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("resize", scheduleSizeSync);
      window.removeEventListener("orientationchange", scheduleSizeSync);
      window.removeEventListener("pageshow", scheduleSizeSync);
      window.visualViewport?.removeEventListener("resize", scheduleSizeSync);
      window.visualViewport?.removeEventListener("scroll", scheduleSizeSync);
      window.screen.orientation?.removeEventListener?.(
        "change",
        scheduleSizeSync,
      );
    };
  }, [syncViewportSize]);

  useEffect(() => {
    if (!viewportSize) return;
    const resizePixi = () => pixiAppRef.current?.resize();
    const frame = window.requestAnimationFrame(resizePixi);
    const timers = [120, 360].map((delay) =>
      window.setTimeout(resizePixi, delay),
    );
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
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      pixiAppRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (objectMultiplier <= 1) {
      url.searchParams.delete("objects");
    } else {
      url.searchParams.set("objects", String(objectMultiplier));
    }
    window.history.replaceState({}, "", url);
  }, [objectMultiplier]);

  const handleToggleSound = useCallback(() => {
    const nextSoundOn = !soundOn;
    pixiAppRef.current?.setMusicEnabled(nextSoundOn);
    soundOnRef.current = nextSoundOn;
    setSoundOn(nextSoundOn);
    persistMusicEnabled(nextSoundOn);
  }, [soundOn]);

  const handleVirtualDPadEnabledChange = useCallback((enabled: boolean) => {
    setVirtualDPadEnabledState(enabled);
    persistVirtualDPadEnabled(enabled);
    if (!enabled) {
      pixiAppRef.current?.setVirtualDirection(null);
    }
  }, []);

  const handleTapMoveSoundEnabledChange = useCallback((enabled: boolean) => {
    setTapMoveSoundEnabledState(enabled);
    persistTapMoveSoundEnabled(enabled);
    // Push to the module-level flag in sfx.ts so InputAdapter's
    // `playTapSfx()` calls (which fire from outside React) honour
    // the new value immediately.
    setTapMoveSfxEnabled(enabled);
  }, []);

  // Push the persisted tap-sound preference into the sfx module on
  // mount so the very first tap-to-move honours the saved value
  // (the InputAdapter's `playTapSfx` reads the module-level flag).
  useEffect(() => {
    setTapMoveSfxEnabled(tapMoveSoundEnabled);
  }, [tapMoveSoundEnabled]);

  const handleMarkerLabelStyleChange = useCallback((style: MarkerLabelStyleId) => {
    setMarkerLabelStyleState(style);
    persistMarkerLabelStyle(style);
  }, []);

  useEffect(() => {
    const app = pixiAppRef.current;
    if (app && app.isMusicEnabled() !== soundOn) {
      app.setMusicEnabled(soundOn);
    }
    soundOnRef.current = soundOn;
    // Mirror the music-toggle into the SFX-enabled flag so the
    // audio icon also mutes click cues (tap-to-move, perfect chime,
    // etc.). Runs on mount too, so the persisted setting is
    // honoured before the player's first tap.
    setSfxEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCheatKey = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTextEntryTarget(e.target)
      )
        return;
      if (e.code === "KeyO") {
        e.preventDefault();
        addBalance(500);
      } else if (e.code === "KeyP") {
        e.preventDefault();
        restoreEnergy(10);
      }
    };
    window.addEventListener("keydown", handleCheatKey);
    return () => window.removeEventListener("keydown", handleCheatKey);
  }, []);

  // useLayoutEffect (not useEffect) so the engine sees the new
  // pause value BEFORE the next paint / rAF, rather than after.
  // The Pixi ticker runs in rAF; with plain useEffect there's a
  // race where the ticker can fire one tick with the stale value
  // between React commit and effect execution, processing a
  // queued input that was meant to be paused.
  //
  // The ref mirror is read by the init effect's `.then` callback
  // to push the CURRENT pause state into the engine the moment
  // it's ready — without it, a load that boots into a paused
  // state (intro flow on stale-state reload) starts the engine
  // with worldPausedByUI=false until something else changes the
  // overlay state, which leaves a window where arrows / taps
  // bypass the pause.
  const worldPausedByOverlayRef = useRef(worldPausedByOverlay);
  useLayoutEffect(() => {
    worldPausedByOverlayRef.current = worldPausedByOverlay;
    pixiAppRef.current?.setWorldPausedByUI(worldPausedByOverlay);
  }, [worldPausedByOverlay]);

  useEffect(() => {
    if (!containerRef.current || pixiAppRef.current) return;

    let cancelled = false;
    // Loading screen has a hard minimum display window so the
    // brand + tagline get a real read even when the boot is
    // already cached. Without this, returning players see the
    // splash for ~200ms and the messaging never lands.
    const MIN_LOADING_MS = 1000;
    const loadingStartedAt = performance.now();
    // Determine start map — default to pokemon, allow ?map=<id> override.
    // The intro cutscene runs as a fullscreen overlay; while it's
    // up the world boots in parallel BEHIND it (so the loading
    // screen drops normally), but we boot DIRECTLY into the post-
    // cutscene scene so the player never sees a flash of outdoor
    // before being teleported inside.
    let startMapId = "pokemon";
    let startSpawnId: string | undefined;
    let startWorldState = null as ReturnType<typeof loadWorldSave>;
    if (cutsceneActive) {
      startMapId = "pokemon-house-1f";
      startSpawnId = "intro-start";
    }
    let explicitMapOverride = false;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const mapParam = params.get("map");
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
    // Tiles/objects/buildings/dimensions come from disk. Triggers and spawnPoints
    // stay compiled; NPC behavior also stays compiled, but placement can come from
    // disk so edited room layouts can move NPCs without stale JSON wiping quest logic.
    const applyOverride = (mapData: {
      id?: string;
      width?: number;
      height?: number;
      tileSize?: number;
      tiles?: unknown;
      objects?: unknown[];
      buildings?: unknown[];
      npcs?: unknown[];
      layers?: unknown[];
    }) => {
      // Either `layers` (current editor) or `tiles` (legacy mirror) is enough
      // content to override. `normalizeMapData` in registerMap handles
      // filling in whichever is missing.
      const hasContent =
        Array.isArray(mapData.layers) || Array.isArray(mapData.tiles);
      if (
        !mapData?.id ||
        !hasContent ||
        typeof mapData.width !== "number" ||
        typeof mapData.height !== "number"
      )
        return;
      let compiled: ReturnType<typeof loadMap> | null = null;
      try {
        compiled = loadMap(mapData.id);
      } catch {
        /* map not in registry */
      }

      // For legacy disk saves (no `layers` field) the editor used not to
      // serialise `transition`, so we re-attach it from the compiled map by
      // matching spriteKey. New-format saves (with `layers`) come from an
      // editor that DOES write `transition` explicitly — re-attaching there
      // would override the user's intent (e.g., duplicating a door entity
      // and unchecking "Acts as a door" on the duplicate; the duplicate
      // shares the original's spriteKey and would silently get its door
      // back). So only run the back-compat re-attach for legacy saves.
      const isLegacySave = !Array.isArray(mapData.layers);
      const transitionsBySpriteKey = new Map<
        string,
        { targetMapId: string; targetSpawnId: string; incomingSpawnId?: string }
      >();
      if (isLegacySave) {
        compiled?.objects.forEach(
          (o: {
            spriteKey: string;
            transition?: {
              targetMapId: string;
              targetSpawnId: string;
              incomingSpawnId?: string;
            };
          }) => {
            if (o.transition)
              transitionsBySpriteKey.set(o.spriteKey, o.transition);
          },
        );
      }
      const diskObjects = (mapData.objects ?? []) as MapData["objects"];
      const objects: MapData["objects"] = diskObjects.map((o) => {
        const obj = o as { spriteKey?: string; transition?: unknown };
        if (isLegacySave && obj.spriteKey && !obj.transition) {
          const t = transitionsBySpriteKey.get(obj.spriteKey);
          if (t) return { ...o, transition: t };
        }
        return o;
      });
      const diskNpcs = Array.isArray(mapData.npcs)
        ? (mapData.npcs as Partial<MapData["npcs"][number]>[])
        : [];
      const diskNpcById = new Map(
        diskNpcs
          .filter((npc): npc is Partial<MapData["npcs"][number]> & { id: string } =>
            typeof npc.id === "string",
          )
          .map((npc) => [npc.id, npc]),
      );
      const npcs: MapData["npcs"] = compiled?.npcs
        ? compiled.npcs.map((npc) => {
            const diskNpc = diskNpcById.get(npc.id);
            if (!diskNpc) return npc;
            return {
              ...npc,
              x: typeof diskNpc.x === "number" ? diskNpc.x : npc.x,
              y: typeof diskNpc.y === "number" ? diskNpc.y : npc.y,
              spriteKey:
                typeof diskNpc.spriteKey === "string"
                  ? diskNpc.spriteKey
                  : npc.spriteKey,
              anchor: diskNpc.anchor ?? npc.anchor,
              sortY:
                typeof diskNpc.sortY === "number" ? diskNpc.sortY : npc.sortY,
              collisionBox: diskNpc.collisionBox ?? npc.collisionBox,
            };
          })
        : (diskNpcs as MapData["npcs"]);

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
        buildings:
          (mapData.buildings as MapData["buildings"] | undefined) ?? [],
        npcs,
        triggers: compiled?.triggers ?? [],
        spawnPoints: compiled?.spawnPoints ?? [
          { id: "default", x: 0, y: 0, facing: "down" },
        ],
        // Engine-only map metadata (not produced by the editor) comes from the
        // compiled map so interior view caps etc. aren't lost on override.
        maxViewTiles: compiled?.maxViewTiles,
        // Editor-managed layer list — fall back to compiled layers, then to
        // implicit defaults via `getLayers()` when neither is set.
        layers:
          (mapData.layers as MapData["layers"] | undefined) ?? compiled?.layers,
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
      if (
        process.env.NODE_ENV !== "production" &&
        typeof window !== "undefined"
      ) {
        (window as unknown as { __pixi: PixiApp }).__pixi = pixiApp;
      }
      unsubscribe = pixiApp.bridge.subscribe((event: GameEvent) => {
        if (cancelled) return;
        switch (event.type) {
          case "dialogueStart":
          case "dialogueAdvance":
            // Quest-NPC interception: when the engine flags a dialogue
            // with `dialogueKind`, rewrite its lines + options here so
            // they reflect inventory + event-flag state at interaction
            // time. Keeps the engine layer pure (no localStorage reads
            // in src/core).
            if (event.dialogue.dialogueKind === "cafe-scripted" || event.dialogue.dialogueKind === "social-hub") {
              // Scripted scenes (CafeIntroScene / SocialHubScene)
              // own their own dialogue surface — close the engine-
              // side dialogue immediately so the default overlay
              // doesn't flash for a frame. The scene's own bridge
              // subscriber handles the rest.
              setDialogue(null);
              pixiAppRef.current?.commandQueue.push({ type: "CLOSE_DIALOGUE" });
            } else if (event.dialogue.dialogueKind === "child-sandwich") {
              setDialogue(buildChildSandwichDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === "lender") {
              setDialogue(buildLenderDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === "ceo-intro") {
              setDialogue(buildCeoIntroDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === "office-tutor") {
              setDialogue(buildOfficeTutorDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === "office-tutor-listen") {
              setDialogue(buildListenTutorDialogue(event.dialogue));
            } else if (event.dialogue.dialogueKind === "office-tutor-write") {
              setDialogue(buildWriteTutorDialogue(event.dialogue));
            } else if (
              event.dialogue.vocabularyPackId &&
              getQuestStatus("intro-translator-job") !== "completed"
            ) {
              // Translator-job offer suppressed until the player has
              // actually been hired — strangers don't pitch jobs to
              // someone who isn't a translator yet. Fall back to the
              // NPC's generic small-talk line so the interaction
              // still has SOMETHING to read.
              const fallback =
                pixiAppRef.current?.getNpcFallbackLine(event.dialogue.npcId) ??
                t('dialogue.fallback.hiThere');
              setDialogue({
                npcId: event.dialogue.npcId,
                npcName: event.dialogue.npcName,
                lines: [fallback],
                currentLine: 0,
              });
            } else {
              setDialogue(event.dialogue);
            }
            break;
          case "dialogueEnd":
            setDialogue(null);
            break;
          case "sceneTransitionStart":
            // Map-transition sound intentionally disabled.
            // playSfx(SFX.SWITCH_MAP);
            setTransitionFade(true);
            break;
          case "sceneChange":
            setCurrentMapId(event.mapId);
            // Brief delay before fading back in so the new scene has a
            // tick to render its first frame under the still-opaque
            // overlay — otherwise the fade-in reveals one frame of the
            // PREVIOUS scene before the renderer redraws.
            window.setTimeout(() => {
              if (!cancelled) setTransitionFade(false);
            }, 40);
            break;
          case "lockedTransition":
            // Edge-of-map district arrow whose target isn't built yet.
            // Surface a no-NPC placeholder dialogue so the player knows
            // the arrow is intentional, not a bug. Reuses the dialogue
            // overlay infra rather than introducing a separate "system
            // notice" UI component.
            setDialogue({
              npcId: "locked-district",
              npcName: "",
              lines: [t('lockedDistrict.message', { title: event.title })],
              currentLine: 0,
            });
            break;
          case "openComputerUpgrade":
            // Player tapped the computer while a timer is running →
            // skip the Study/Upgrade/Leave dialogue and jump straight
            // into the upgrade view (where they can watch the bar tick
            // or click "Finish" if it's ready).
            setComputerUpgradeOpen(true);
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
      return fetch("/api/maps")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.maps) return { ok: false, appliedAll: false };
          for (const id of Object.keys(data.maps)) applyOverride(data.maps[id]);
          return { ok: true, appliedAll: true };
        })
        .catch(() => ({ ok: false, appliedAll: false }));
    };
    const isValidMapData = (
      d: unknown,
    ): d is {
      id: string;
      width: number;
      height: number;
      layers?: unknown[];
    } => {
      if (!d || typeof d !== "object") return false;
      const m = d as {
        id?: unknown;
        width?: unknown;
        height?: unknown;
        error?: unknown;
      };
      return (
        typeof m.id === "string" &&
        typeof m.width === "number" &&
        typeof m.height === "number" &&
        !m.error
      );
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
          // The world-pause useLayoutEffect ran on the FIRST render
          // with pixiAppRef.current still null (engine not yet
          // initialised), so the engine boots with its default
          // worldPausedByUI=false even when React's overlay state
          // says it should be paused (e.g., introGapActive
          // pre-armed for stale-state intro replays). Push the
          // current value here, the first moment the engine is
          // actually wired up, so arrow keys + taps don't slip
          // through the pre-paint window.
          pixiAppRef.current?.setWorldPausedByUI(
            worldPausedByOverlayRef.current,
          );
          // First scene mounted — drop the loading overlay, but
          // honour the minimum display window so the brand
          // messaging gets a real read even on warm-cache boots.
          const elapsed = performance.now() - loadingStartedAt;
          const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
          window.setTimeout(() => {
            if (cancelled) return;
            // `loading` flips immediately to start the fade;
            // `loadingVisible` unmounts after the CSS transition
            // completes.
            setLoading(false);
            window.setTimeout(() => {
              if (!cancelled) setLoadingVisible(false);
            }, 400);
          }, remaining);
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
              try {
                window.dispatchEvent(new Event("resize"));
              } catch {
                /* ignore */
              }
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

  // Quest / wayfinding marker driver. Two kinds of arrows live on
  // this layer:
  //   - Story-critical (red): the office during the intro tutorial.
  //   - Wayfinding (yellow): doormats inside interiors, so the
  //     player never has to hunt for the way out.
  // Both run through the same `setQuestMarkers` API; the renderer
  // doesn't care about their semantics, only their world position.
  useEffect(() => {
    const app = pixiAppRef.current;
    if (!app) return;
    // No quest markers while the intro apartment dialogue is on
    // screen — the player can't act on them yet, and the quest
    // pointing at Mim while she's the one talking is jarring.
    if (dialogue?.npcId === "intro-apartment") {
      app.setQuestMarkers([]);
      return;
    }
    // Scripted scenes (e.g. `cafe-intro`, `social-hub`) own the
    // marker layer themselves — bail out so this effect doesn't
    // clobber the scene runner's markers on unrelated state changes.
    if (currentMapId === "cafe-intro" || currentMapId === "social-hub") {
      return;
    }

    type ObjLike = {
      id: string;
      x: number;
      y: number;
      spriteKey?: string;
      collisionBox?: { offsetY: number };
      transition?: {
        incomingSpawnId?: string;
        targetMapId?: string;
        targetSpawnId?: string;
        triggerBox?: { offsetX: number; offsetY: number; width: number; height: number };
      };
    };

    /** Walk the loaded map's layered AND legacy object lists into a
     *  flat array. The editor writes new saves to `layers`, but
     *  some older overrides still surface entities through the
     *  legacy `objects` mirror — we want both. */
    const collectObjects = (mapId: string): ObjLike[] => {
      let map;
      try {
        map = loadMap(mapId);
      } catch {
        return [];
      }
      const out: ObjLike[] = [];
      const layers = (
        map as unknown as { layers?: Array<{ objects?: ObjLike[] }> }
      ).layers;
      if (Array.isArray(layers)) {
        for (const l of layers)
          if (Array.isArray(l.objects)) out.push(...l.objects);
      }
      const objs = (map as unknown as { objects?: ObjLike[] }).objects;
      if (Array.isArray(objs)) out.push(...objs);
      return out;
    };

    type Marker = {
      id: string;
      x: number;
      y: number;
      spriteKey: string;
      label?: string;
      followNpcId?: string;
    };
    const markers = new Map<string, Marker>();
    const addMarker = (marker: Marker) => {
      markers.set(marker.id, marker);
    };

    const markerLabelForTransition = (
      mapId: string,
      transition: ObjLike["transition"],
    ): string | null => {
      if (!transition?.targetMapId) return null;
      if (mapId === "pokemon") {
        if (transition.targetMapId === "office") return t('mapMarker.office');
        if (transition.targetMapId === "grocer-1f") return t('mapMarker.mart');
        if (transition.targetMapId === "pokemon-house-1f") return t('mapMarker.home');
        return null;
      }
      if (transition.targetMapId === "pokemon") return t('mapMarker.exit');
      if (transition.targetMapId === "pokemon-house-2f") return t('mapMarker.upstairs');
      if (transition.targetMapId === "pokemon-house-1f") return t('mapMarker.downstairs');
      return null;
    };

    const markerYForLocation = (mapId: string, obj: ObjLike): number => {
      if (mapId === "pokemon") {
        const top = obj.y + (obj.collisionBox?.offsetY ?? -64);
        return top + 60;
      }
      return obj.y - 20;
    };

    const markerXForLocation = (obj: ObjLike): number => {
      const triggerBox = obj.transition?.triggerBox;
      if (!triggerBox) return obj.x;
      return obj.x + triggerBox.offsetX + triggerBox.width / 2;
    };

    // ── Always-on location markers ──
    // Any transition that points to a named location gets a subtle
    // yellow arrow + label, even when no quest currently targets it.
    // Quest-critical markers below reuse the same ids and replace
    // these with red variants when needed.
    collectObjects(currentMapId)
      .filter((o) => !!o.transition)
      .forEach((obj) => {
        const label = markerLabelForTransition(currentMapId, obj.transition);
        if (!label) return;
        addMarker({
          id: `location-${currentMapId}-${obj.id}`,
          x: markerXForLocation(obj),
          y: markerYForLocation(currentMapId, obj),
          spriteKey: "edge-arrow-south",
          label,
        });
      });

    // ── Story-critical: office building marker ──
    // Fires whenever the active intro / first-paycheck step
    // requires the player to be inside the office — that's the
    // entire intro quest (apply with CEO) and the entire
    // first-paycheck quest (Eli's customer sessions, plus the CEO
    // claim once threshold is met). Once the player is INSIDE,
    // the per-NPC marker logic further down picks the right
    // target (CEO / Eli) for each state. Same chevron sprite +
    // "Office" label so a player coming back from a break
    // recognises it as "head this way" without re-reading the log.
    const introActive = questStatuses["intro-translator-job"] === "active";
    const paycheckActive = questStatuses["first-paycheck"] === "active";
    const paycheckReadyToClaim =
      paycheckActive &&
      getLifetimeEarnings() >= FIRST_PAYCHECK_THRESHOLD_CENTS;
    // Mode-tutorial quests (second / third paycheck) also live in
    // the office, so the outdoor "Office" chevron should keep
    // pointing there until the player has finished the whole
    // tutorial chain.
    const modeQuestActive =
      questStatuses["second-paycheck"] === "active" ||
      questStatuses["third-paycheck"] === "active";
    if ((introActive || paycheckActive || modeQuestActive) && currentMapId === "pokemon") {
      const office = collectObjects("pokemon").find(
        (o) => o.transition?.incomingSpawnId === "outdoor-office",
      );
      if (office) {
        addMarker({
          id: `location-${currentMapId}-${office.id}`,
          x: markerXForLocation(office),
          y: markerYForLocation(currentMapId, office),
          spriteKey: "edge-arrow-south-red",
          label: paycheckReadyToClaim
            ? t('mapMarker.collectPaycheck')
            : t('mapMarker.office'),
        });
      }
    }

    // ── upgrade-computer wayfinding ──
    // Outdoor: chevron over the home door while the explicit quest
    // points there. Indoors: once the intro apartment dialogue has
    // landed, keep a red exclamation on the broken computer until
    // the player starts the first upgrade timer.
    const upgradeComputerActive =
      questStatuses["upgrade-computer"] === "active";
    if (upgradeComputerActive && currentMapId === "pokemon") {
      const home = collectObjects("pokemon").find(
        (o) => o.transition?.incomingSpawnId === "outdoor-houseA-door",
      );
      if (home) {
        addMarker({
          id: `location-${currentMapId}-${home.id}`,
          x: markerXForLocation(home),
          y: markerYForLocation(currentMapId, home),
          spriteKey: "edge-arrow-south-red",
          label: t('mapMarker.home'),
        });
      }
    }
    const shouldFlagBrokenComputer =
      hasFlag(FLAGS.INTRO_APARTMENT_SEEN) &&
      computerLevel === 0 &&
      !computerUpgradeTimer;
    if (shouldFlagBrokenComputer && currentMapId === "pokemon-house-1f") {
      const computer = collectObjects("pokemon-house-1f").find(
        (o) => o.spriteKey === "computer-desk",
      );
      if (computer) {
        addMarker({
          id: `location-${currentMapId}-${computer.id}`,
          x: markerXForLocation(computer),
          y: markerYForLocation(currentMapId, computer) - 20,
          spriteKey: "ui:exclamation-red",
        });
      }
    }

    // ── "Go talk to X" markers ──
    // Whenever an active quest's objective is to speak with a
    // specific NPC, float a red chevron over them so the player
    // never has to guess who. Only fires when the player is on
    // the NPC's map; cross-map wayfinding (e.g. the office
    // building marker on the outdoor map during the intro) is
    // handled by bespoke blocks above.
    //
    // followNpcId makes the renderer re-anchor the marker each
    // frame so wandering NPCs don't outrun their chevron. (x, y)
    // are interpreted as offsets from the NPC anchor (feet) —
    // -28 floats the chevron above the head sprite.
    for (const target of QUEST_TALK_TARGETS) {
      if (questStatuses[target.questId] !== "active") continue;
      // First-paycheck has TWO talk targets across its lifetime:
      // Eli (in office, repeatable until threshold) — handled by
      // this loop's table entry — and CEO (claim) once threshold
      // is met, handled by the bespoke claim block below.
      if (target.questId === "first-paycheck" && paycheckReadyToClaim) continue;
      if (currentMapId !== target.mapId) continue;
      let map;
      try {
        map = loadMap(target.mapId);
      } catch {
        continue;
      }
      const npc = map.npcs.find((n) => n.name === target.npcName);
      if (!npc) continue;
      addMarker({
        id: `talk-target-${target.questId}`,
        x: 0,
        y: -28,
        // Red exclamation from the Modern Interiors UI atlas. Marks
        // "go talk to this NPC" — distinct from the chevron used
        // for buildings / scene-transition objects below so the
        // player can tell at a glance "a person wants you" vs
        // "this place wants you".
        spriteKey: "ui:exclamation-red",
        followNpcId: npc.id,
      });
    }

    // ── First-paycheck claim: CEO marker once threshold is met ──
    // Special-case override of the QUEST_TALK_TARGETS Eli entry
    // (skipped above when paycheckReadyToClaim is true). The
    // outdoor-map case is covered by the office-building marker
    // higher up; this one floats over the CEO when the player is
    // already inside the office.
    if (paycheckReadyToClaim && currentMapId === "office") {
      let officeMap;
      try {
        officeMap = loadMap("office");
      } catch {
        officeMap = null;
      }
      const ceoNpc = officeMap?.npcs.find((n) => n.name === "CEO");
      if (ceoNpc) {
        addMarker({
          id: "paycheck-ceo",
          x: 0,
          y: -28,
          // Same red-exclamation as the regular talk-target loop.
          // No caption — the icon over CEO's head is enough; the
          // "Collect paycheck" copy stays in the quest log.
          spriteKey: "ui:exclamation-red",
          followNpcId: ceoNpc.id,
        });
      }
    }

    app.setQuestMarkers([...markers.values()]);
    return () => {
      app.setQuestMarkers([]);
    };
  }, [
    currentMapId,
    questStatuses,
    dialogue,
    lifetimeEarnings,
    markerLabelStyle,
    computerLevel,
    computerUpgradeTimer,
  ]);

  // Intro apartment back-and-forth — auto-fires the FIRST time
  // the player lands in F1 after the cutscene. Holds the practical
  // exposition (rent timer, translator-job plan, the lie) that
  // used to live in the cutscene; saying it inside the room those
  // words refer to makes it land. One-shot via INTRO_APARTMENT_SEEN
  // flag. The intro quest is NOT yet active at this point — it
  // gets started when the player taps past the final line (see
  // handleAdvanceDialogue's intro-apartment branch), so the quest
  // pulse / dot / marker don't appear while the parent + child
  // are still talking.
  //
  // Lines alternate parent ↔ child via APARTMENT_DIALOGUE; each
  // tap rebuilds the dialogue with the next speaker's name and
  // line. Mim is rotated to face the parent on trigger and back
  // to face-down on close.
  useEffect(() => {
    if (cutsceneActive || welcomeActive) return;
    if (currentMapId !== "pokemon-house-1f") return;
    if (!hasFlag(FLAGS.INTRO_CUTSCENE_SEEN)) return;
    if (hasFlag(FLAGS.INTRO_APARTMENT_SEEN)) return;
    // Beat between cutscene-end and dialogue-start so the player
    // sees the apartment as a *room they're now in*, not as the
    // cutscene's parchment panel getting new copy. Without this
    // the dialogue feels like a continuation of the cutscene.
    // `introGapActive` pauses the world during this delay so a
    // mobile tap can't sneak past and trigger Mim before the
    // monologue mounts.
    setIntroGapActive(true);
    const t = window.setTimeout(() => {
      const childName = getChildName() ?? "kiddo";
      const parentName = getPlayerName() ?? "";
      const lines = APARTMENT_DIALOGUE.map((s) =>
        s.text({ parent: parentName, child: childName }),
      );
      const speakers = APARTMENT_DIALOGUE.map((s) => s.speaker);
      const firstName = speakers[0] === "parent" ? parentName : childName;
      setDialogue({
        npcId: "intro-apartment",
        npcName: firstName,
        lines,
        currentLine: 0,
      });
      // Mim faces the parent (player spawned at intro-start facing
      // 'left'; she's to the player's left, so she faces 'right').
      pixiAppRef.current?.setNpcFacing("1f-npc-child", "right");
      // Flag set at trigger time so a refresh mid-monologue doesn't
      // replay it. Edge case — player can re-read the plan via the
      // quest objective in the log if they miss it.
      setFlag(FLAGS.INTRO_APARTMENT_SEEN);
      setIntroGapActive(false);
    }, 1200);
    return () => {
      window.clearTimeout(t);
      setIntroGapActive(false);
    };
  }, [currentMapId, cutsceneActive, welcomeActive]);

  const handleAdvanceDialogue = useCallback(() => {
    // Locked-district dialogues are React-only — the engine never
    // knew they opened, so its ADVANCE_DIALOGUE command would no-op.
    // Dismiss directly here. Any future synthetic / engine-bypass
    // dialogue should branch on its npcId the same way.
    if (dialogue?.npcId === "locked-district") {
      setDialogue(null);
      return;
    }
    // Generic React-only / synthetic dialogue path — same problem as
    // locked-district above. Walk the lines locally, then close.
    // Marked via `clientOnly: true` when the dialogue was opened by
    // React without an engine-side dialogueStart event (e.g. the
    // post-session NPC thank-yous from `handleCloseTranslateView`).
    if (dialogue?.clientOnly) {
      if (dialogue.currentLine < dialogue.lines.length - 1) {
        setDialogue({ ...dialogue, currentLine: dialogue.currentLine + 1 });
        return;
      }
      setDialogue(null);
      return;
    }
    // Intro apartment back-and-forth is React-managed — walk
    // currentLine locally and swap npcName as the speaker changes.
    // On the final tap, close, start the intro quest (deferred
    // from cutscene-end so the quest UI doesn't pop while the
    // parent + child are still talking), and pivot both characters
    // to face-down so the player isn't left staring sideways.
    if (dialogue?.npcId === "intro-apartment") {
      if (dialogue.currentLine < dialogue.lines.length - 1) {
        const nextIndex = dialogue.currentLine + 1;
        const nextSpeaker = APARTMENT_DIALOGUE[nextIndex].speaker;
        const parentName = getPlayerName() ?? "";
        const childName = getChildName() ?? "kiddo";
        setDialogue({
          ...dialogue,
          currentLine: nextIndex,
          npcName: nextSpeaker === "parent" ? parentName : childName,
        });
        return;
      }
      setDialogue(null);
      // Engine doesn't know about this dialogue, but pushing
      // CLOSE_DIALOGUE still calls clearTransientInput with
      // suppressInteractUntilRelease — important on mobile, where
      // the same tap that closes the box can otherwise leak into
      // an _interact on Mim (still nearby) and immediately reopen
      // a new dialogue.
      pixiAppRef.current?.commandQueue.push({ type: "CLOSE_DIALOGUE" });
      pixiAppRef.current?.setPlayerFacing("down");
      pixiAppRef.current?.setNpcFacing("1f-npc-child", "down");
      startQuest("intro-translator-job");
      return;
    }
    // CEO multi-stage dialogues are React-managed — the engine
    // doesn't know about Stage 2 / Stage 3 line counts because the
    // option handler swapped them in client-side. Walk currentLine
    // locally; only fall through to ENGINE_ADVANCE when we run
    // out of lines AND the dialogue is single-stage / engine-owned.
    if (dialogue?.dialogueKind === "ceo-intro") {
      if (dialogue.currentLine < dialogue.lines.length - 1) {
        setDialogue({ ...dialogue, currentLine: dialogue.currentLine + 1 });
        return;
      }
      // Past the last line of the active stage — close. Stage
      // transitions are option-driven (ceo-apply / fluency picks),
      // so reaching the end of a stage with no options means the
      // wrap-up monologue is over. Inline the close-everywhere
      // logic here because the helper is declared further below
      // and a forward ref triggers TS use-before-decl.
      setDialogue(null);
      pixiAppRef.current?.commandQueue.push({ type: "CLOSE_DIALOGUE" });
      return;
    }
    const app = pixiAppRef.current;
    if (!app) return;
    app.commandQueue.push({ type: "ADVANCE_DIALOGUE" });
  }, [dialogue]);

  const closeDialogueEverywhere = useCallback(() => {
    setDialogue(null);
    pixiAppRef.current?.commandQueue.push({ type: "CLOSE_DIALOGUE" });
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
  const handleSelectDialogueOption = useCallback(
    (optionId: string) => {
      if (!dialogue) return;
      const packId = dialogue.vocabularyPackId;

      if (optionId === "view" && packId) {
        // Snapshot the current offer dialogue (Help / View / Decline)
        // so closing the list returns the player to the same menu —
        // otherwise tapping ✕ feels like the conversation evaporated.
        // Reset `currentLine` to 0 AND set `skipTypewriter` so the
        // restored dialogue lands fully revealed: the player already
        // read the offer line, replaying the typing pass would feel
        // like the game forgot the conversation just happened.
        setVocabularyView({
          packId,
          npcName: dialogue.npcName,
          returnDialogue: { ...dialogue, currentLine: 0, skipTypewriter: true },
        });
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "decline") {
        closeDialogueEverywhere();
        return;
      }
      // Shopkeeper routes — Browse pops the shop modal, Maybe later
      // closes the dialogue cleanly.
      if (optionId === "shop-browse") {
        const shopName = dialogue.npcName || t('shop.defaultName');
        setShopView({ shopName });
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "shop-leave") {
        closeDialogueEverywhere();
        return;
      }
      // Apartment computer routes — Study swaps the object menu for
      // a one-line result, Upgrade opens the modal, Leave closes.
      if (optionId === "computer-study") {
        const canStudy = getComputerUpgradeLevel() > 0;
        const studyDialogue: DialogueState = {
          npcId: "object-computer-study",
          npcName: t("computer.name"),
          lines: [
            canStudy
              ? t("computer.study.ready")
              : t("computer.study.broken"),
          ],
          currentLine: 0,
        };
        setDialogue(studyDialogue);
        pixiAppRef.current?.commandQueue.push({
          type: "SET_DIALOGUE",
          dialogue: studyDialogue,
        });
        return;
      }
      if (optionId === "computer-upgrade") {
        setComputerUpgradeOpen(true);
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "computer-leave") {
        closeDialogueEverywhere();
        return;
      }
      // Child quest routes — give-bread consumes the item,
      // sets CHILD_FED, and pushes a thank-you reply (single line, no
      // options). Decline just closes; the dialogue can be reopened
      // later to give the bread. Inventory and flags are read
      // fresh each branch so the click reflects current state, not a
      // stale snapshot from when the menu rendered.
      if (optionId === "child-give-bread") {
        if (consumeItem("bread", 1) || consumeItem("sandwich", 1)) {
          completeQuest("child-sandwich");
          setDialogue({
            npcId: dialogue.npcId,
            npcName: dialogue.npcName,
            lines: [t('dialogue.mim.thanksNow')],
            currentLine: 0,
          });
        } else {
          // The Give option is offered regardless of inventory now;
          // tapping it without bread means Mim catches the
          // bluff. Stay in the dialogue (no auto-close) so the
          // player can reread before walking away.
          setDialogue({
            npcId: dialogue.npcId,
            npcName: dialogue.npcName,
            lines: [t('dialogue.mim.noBread')],
            currentLine: 0,
          });
        }
        return;
      }
      if (optionId === "child-decline") {
        closeDialogueEverywhere();
        return;
      }
      // Theo's lender flow — Borrow adds $5 to balance + debt, Repay
      // pays as much as possible (min(balance, debt)), Leave just
      // closes. After each mutation we re-render Theo's dialogue
      // from fresh state so the ledger line and button-disabled
      // states stay accurate without closing-and-reopening.
      if (optionId === "lender-borrow") {
        borrowFromTheo();
        // Tutorial: a successful borrow during the borrow-quest
        // closes it. Toast fires from `completeQuest` and the catch-
        // up chain immediately starts `tutorial-buy-food`.
        if (getQuestStatus("tutorial-borrow") === "active") {
          completeQuest("tutorial-borrow");
        }
        // Close on a confirmation line instead of re-showing the
        // borrow menu — playtest feedback was that the menu coming
        // straight back made it feel like the player could (or
        // should) immediately borrow again. Re-engaging Theo
        // re-opens the menu with the fresh ledger; this is just
        // about ending the current beat cleanly.
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          lines: [
            t('dialogue.theo.afterBorrow', { amount: formatBalance(BORROW_INCREMENT_CENTS), total: formatBalance(getDebt()) }),
          ],
          currentLine: 0,
        });
        return;
      }
      if (optionId === "lender-repay") {
        const paid = repayMax();
        if (paid > 0 && getDebt() === 0) {
          // Square — show a closing line instead of the menu so the
          // moment lands. Player can re-engage to borrow again.
          setDialogue({
            npcId: dialogue.npcId,
            npcName: dialogue.npcName,
            lines: [
              t('dialogue.theo.squareUp', { amount: formatBalance(paid) }),
            ],
            currentLine: 0,
          });
        } else {
          setDialogue(buildLenderDialogue(dialogue));
        }
        return;
      }
      if (optionId === "lender-leave") {
        closeDialogueEverywhere();
        return;
      }
      // CEO intro — Stage 1 → Stage 2 (fluency).
      if (optionId === "ceo-apply") {
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          dialogueKind: "ceo-intro",
          lines: [
            t('dialogue.ceo.fluencyQuestion'),
          ],
          currentLine: 0,
          options: [
            {
              id: "ceo-intro-confident",
              label: t('dialogue.ceo.option.confident'),
              hint: t('dialogue.ceo.option.confidentHint'),
            },
            {
              id: "ceo-intro-honest",
              label: t('dialogue.ceo.option.honest'),
              hint: t('dialogue.ceo.option.honestHint'),
            },
          ],
        });
        return;
      }
      if (optionId === "ceo-decline-apply") {
        // Walk-away option. Keep the quest active so the player can
        // come back any time and re-greet from Stage 1.
        closeDialogueEverywhere();
        return;
      }

      // CEO intro — Stage 2 → Stage 3 (hired). Confident vs honest
      // changes the opening line of the wrap-up; the rest of the
      // explanation (job mechanics, payout, return-for-bonus pitch)
      // is identical. The intro quest completes here and the
      // first-paycheck quest auto-starts via the catch-up effect.
      // Eli (the in-office first customer) is the FIRST beat of
      // first-paycheck — handled by that quest's marker logic and
      // dialogue gating, not by intro-translator-job.
      if (
        optionId === "ceo-intro-confident" ||
        optionId === "ceo-intro-honest"
      ) {
        const opening =
          optionId === "ceo-intro-confident"
            ? t('dialogue.ceo.hireConfident')
            : t('dialogue.ceo.hireHonest');
        completeQuest("intro-translator-job");
        startQuest("first-paycheck");
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          dialogueKind: "ceo-intro",
          lines: [
            opening,
            t('dialogue.ceo.hireExplain'),
            t('dialogue.ceo.hirePay', {
              reward: `<gain>${formatBalance(getRewardPerCorrect())}</gain>`,
              wrong: `<loss>${formatBalance(PENALTY_PER_WRONG)}</loss>`,
              idk: `<warn>${formatBalance(PENALTY_PER_IDK)}</warn>`,
            }),
            t('dialogue.ceo.hireBonus', { threshold: formatBalance(FIRST_PAYCHECK_THRESHOLD_CENTS) }),
            t('dialogue.ceo.hireOffYouGo'),
          ],
          currentLine: 0,
        });
        return;
      }
      // First-paycheck claim — pays the bonus + completes the quest.
      // Decline lets the player walk away (claim again next visit).
      if (optionId === "ceo-paycheck-claim") {
        addBalance(FIRST_PAYCHECK_BONUS_CENTS);
        completeQuest("first-paycheck");
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          // `dialogueKind: "ceo-intro"` routes this through the CEO
          // branch in `handleAdvanceDialogue` so we walk both lines
          // locally and close via CLOSE_DIALOGUE on the final tap.
          // Without it, the first advance falls through to ENGINE
          // ADVANCE — which clears the engine's 1-line stub and
          // fires `dialogueEnd`, prematurely closing the dialogue
          // before line 2 ("Keep this up…") gets shown.
          dialogueKind: "ceo-intro",
          lines: [
            t('dialogue.ceo.paycheckClaimedL1', { bonus: formatBalance(FIRST_PAYCHECK_BONUS_CENTS) }),
            t('dialogue.ceo.paycheckClaimedL2'),
          ],
          currentLine: 0,
        });
        return;
      }
      if (optionId === "ceo-paycheck-decline") {
        // Use closeDialogueEverywhere — `setDialogue(null)` alone
        // leaves the engine's `activeDialogue` set, which freezes
        // the world-update loop (PixiApp.update bails on
        // `gameState.activeDialogue`). Symptom: player stuck after
        // clicking "Maybe later" until a page refresh.
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "mode-back") {
        const previous = translationModeReturnDialogueRef.current;
        if (previous) {
          setDialogue(previous);
        } else {
          closeDialogueEverywhere();
        }
        return;
      }
      if (optionId === "help" && packId) {
        // Step 2: pick the translation mode. The office tutorial
        // NPCs lock the picker to a single mode (Eli → read, Rina →
        // listen, Yusuf → write) so each NPC introduces ONE option
        // at a time. Lookup is by `dialogueKind`; everyone else
        // (Saba, Pio, future translator NPCs) sees the full
        // four-mode picker. The lock is purely a presentational
        // filter — `mode-read` etc. still go through the same
        // option handlers below.
        const kindToLockedMode: Record<string, 'read' | 'listen' | 'write'> = {
          'office-tutor': 'read',
          'office-tutor-listen': 'listen',
          'office-tutor-write': 'write',
        };
        const lockedMode = dialogue.dialogueKind
          ? kindToLockedMode[dialogue.dialogueKind] ?? null
          : null;
        const allModeOptions = [
          {
            id: "mode-read",
            label: t('dialogue.offer.modeRead'),
            mode: 'read' as const,
          },
          {
            id: "mode-listen",
            label: t('dialogue.offer.modeListen'),
            mode: 'listen' as const,
          },
          {
            id: "mode-write",
            label: t('dialogue.offer.modeWrite'),
            mode: 'write' as const,
          },
          {
            id: "mode-speak",
            label: t('dialogue.offer.modeSpeak'),
            comingSoon: true,
            mode: 'speak' as const,
          },
        ];
        const modeOptions = lockedMode
          ? allModeOptions
              .filter((m) => m.mode === lockedMode)
              .map(({ mode: _mode, ...rest }) => rest)
          : allModeOptions.map(({ mode: _mode, ...rest }) => rest);
        translationModeReturnDialogueRef.current = {
          ...dialogue,
          currentLine: 0,
          skipTypewriter: true,
        };
        // Office tutors get a different prompt line above the
        // mode picker — "This is what I struggle with" reads
        // better than "I need help with one of these" when the
        // picker only has ONE option to begin with.
        const modePromptKey = lockedMode
          ? 'dialogue.officeTutor.modePrompt'
          : 'dialogue.offer.modePrompt';
        setDialogue({
          npcId: dialogue.npcId,
          npcName: dialogue.npcName,
          lines: [t(modePromptKey)],
          currentLine: 0,
          vocabularyPackId: packId,
          vocabularyWordCount: dialogue.vocabularyWordCount,
          options: [
            ...modeOptions,
            {
              id: "mode-back",
              label: t('dialogue.offer.modeBack'),
            },
          ],
        });
        return;
      }
      if (optionId === "mode-read" && packId) {
        setTranslateView({ packId, npcName: dialogue.npcName, mode: "read" });
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "mode-listen" && packId) {
        setTranslateView({ packId, npcName: dialogue.npcName, mode: "listen" });
        closeDialogueEverywhere();
        return;
      }
      if (optionId === "mode-write" && packId) {
        setTranslateView({ packId, npcName: dialogue.npcName, mode: "write" });
        closeDialogueEverywhere();
        return;
      }
      // Fallback for unknown ids — dismiss rather than silently swallow.
      closeDialogueEverywhere();
    },
    [dialogue, closeDialogueEverywhere],
  );

  const handleCloseVocabularyView = useCallback(() => {
    // Pop the offer dialogue back if we came from one. The
    // engine's `gameState.activeDialogue` was cleared via
    // closeDialogueEverywhere on entry, so we re-set ONLY the
    // React side. Tap-to-advance + option-pick on the restored
    // dialogue go through the React-side branches we already
    // have for `view` / `help` / `decline`, which never need the
    // engine to know.
    setVocabularyView((prev) => {
      if (prev?.returnDialogue) {
        setDialogue(prev.returnDialogue);
      }
      return null;
    });
  }, []);

  const handleCloseTranslateView = useCallback(() => {
    // When the session crossed the active office-tutorial quest's
    // earnings threshold, route the player through the NPC's
    // thank-you line BEFORE the chain advances. The chain's
    // auto-complete + auto-start are gated on (!translateView &&
    // !dialogue), so opening this dialogue here keeps the next
    // quest's toast + HUD row from popping until the player has
    // dismissed the wrap-up beat. If the threshold wasn't crossed,
    // session ends silently as before.
    setTranslateView((prev) => {
      if (!prev) return null;
      const { mode, npcName } = prev;
      if (mode === 'listen' &&
          getQuestStatus('second-paycheck') === 'active' &&
          getQuestEarnings('second-paycheck') >= SECOND_PAYCHECK_PHASE_CENTS) {
        setDialogue({
          npcId: 'office-npc-listen-tutor',
          npcName,
          lines: [t('dialogue.listenTutor.thanks')],
          currentLine: 0,
          clientOnly: true,
        });
      } else if (mode === 'write' &&
          getQuestStatus('third-paycheck') === 'active' &&
          getQuestEarnings('third-paycheck') >= THIRD_PAYCHECK_PHASE_CENTS) {
        setDialogue({
          npcId: 'office-npc-write-tutor',
          npcName,
          lines: [t('dialogue.writeTutor.thanks')],
          currentLine: 0,
          clientOnly: true,
        });
      }
      return null;
    });
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

  const handleDPadChange = useCallback(
    (
      dir: { up: boolean; down: boolean; left: boolean; right: boolean } | null,
    ) => {
      pixiAppRef.current?.setVirtualDirection(dir);
    },
    [],
  );

  const btnStyle: React.CSSProperties = {
    ...HUD.iconButtonStyle,
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
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
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        // Suppress browser text-selection / long-press selection /
        // tap-highlight on the game viewport. Without these, users
        // could highlight dialogue text by dragging, get the iOS
        // long-press callout menu (copy/share) on the canvas, or see
        // the Android blue tap-highlight box on every interaction.
        // The pure-prefix versions cover Safari iOS specifically.
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
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
        style={{ position: "absolute", inset: 0 }}
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
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            background: "#1a2a1a",
            color: "rgba(255,255,255,0.85)",
            fontFamily: "monospace",
            opacity: loading ? 1 : 0,
            transition: "opacity 350ms ease-out",
            pointerEvents: loading ? "auto" : "none",
          }}
        >
          <style>{`
            @keyframes lingoMapSpin { to { transform: rotate(360deg); } }
            @keyframes lingoMapPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
            /* Character 7 walk-down cycle: idle → walk1 → idle → walk2.
               Atlas is 512×640 at native scale; at 4× we display 2048×2560
               and the down row sits at y=192 → -768px in 4× space. */
            @keyframes lingoMapWalkDown {
              0%, 24.99%  { background-position:    0px -768px; }
              25%, 49.99% { background-position: -384px -768px; }
              50%, 74.99% { background-position:    0px -768px; }
              75%, 100%   { background-position: -448px -768px; }
            }
          `}</style>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 2,
              animation: "lingoMapPulse 1.4s ease-in-out infinite",
            }}
          >
            {t('loading.title')}
          </div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.5,
              opacity: 0.7,
              fontStyle: "italic",
              marginTop: -8,
              maxWidth: 320,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {t('loading.tagline')}
          </div>
          <div
            aria-hidden
            style={{
              width: 64,
              height: 128,
              backgroundImage: "url(/assets/me-char-atlas.webp)",
              backgroundRepeat: "no-repeat",
              backgroundSize: "2048px 2560px",
              imageRendering: "pixelated",
              animation: "lingoMapWalkDown 0.6s steps(1, end) infinite",
            }}
          />
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.18)",
              borderTopColor: "rgba(255,255,255,0.85)",
              animation: "lingoMapSpin 0.9s linear infinite",
            }}
          />
          <div style={{ fontSize: 11, opacity: 0.55 }}>{t('loading.label')}</div>
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
          position: "absolute",
          inset: 0,
          background: "#000",
          opacity: transitionFade ? 1 : 0,
          transition: transitionFade
            ? "opacity 220ms ease-in"
            : "opacity 180ms ease-out",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Build-version stamp — bumped manually in src/version.ts on
          every commit so a quick glance from the phone confirms whether
          the latest deploy is actually live (vs. the SW serving a
          stale bundle). Bottom-left, low alpha, no pointer events. */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 6,
          fontSize: 10,
          fontFamily: "monospace",
          color: "rgba(255, 235, 90, 0.75)",
          textShadow: "0 0 2px rgba(0,0,0,0.8)",
          pointerEvents: "none",
          zIndex: 10,
          userSelect: "none",
        }}
      >
        v{APP_VERSION}
      </div>

      {/* UI overlay — always on top of canvas */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        {/* Top-left HUD pill row — aligned to the same top edge as
            the top-right icon buttons. Wrapped in a flex container
            so future pills (focus, hunger, whatever) stay a single
            child append. Subscribes via useWalletBalance / useEnergy
            so vocab views don't have to call back up here.
            Suppressed on the `social-hub` experiment — that scene
            tracks tips in its own scene-local state and shouldn't
            mix with the translator-job wallet/energy. */}
        {currentMapId !== "social-hub" && (
        <div style={HUD.statusRowStyle}>
          <div
            style={HUD.statusPlateStyle}
            aria-label={`Balance: ${formatBalance(walletBalance)}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="square"
              strokeLinejoin="miter"
              style={{ color: COLORS.coinGold }}
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
              <path d="M12 18V6"></path>
            </svg>
            <span style={{ minWidth: 46, textAlign: "right" }}>
              {formatBalance(walletBalance)}
            </span>
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
              // `position: relative` anchors the floating EnergyCostBurst
              // child — its `position: absolute` pip floats up from the
              // pill itself instead of escaping to the document body.
              position: 'relative',
              opacity: energy === 0 ? 0.55 : 1,
            }}
            aria-label={t('hud.energyAmount', { current: energy, max: energyMax })}
            title={
              energy === 0
                ? t('hud.outOfEnergyTip')
                : t('hud.energyAmountShort', { current: energy, max: energyMax })
            }
          >
            <span
              style={{
                fontSize: 13,
                lineHeight: 1,
                color: COLORS.energyAccent,
              }}
            >
              ⚡
            </span>
            <span>
              {energy}/{energyMax}
            </span>
            <EnergyCostBurst />
          </div>
        </div>
        )}

        {/* Inventory HUD — sits right under the wallet/energy row,
            one chip per held item with its emoji icon and a ×N
            counter. Tappable: opens the inventory modal where the
            player can eat held food to refill energy. Hides
            entirely when empty so the corner stays clean for new
            players. */}
        {currentMapId !== "social-hub" && inventoryRows.length > 0 && (
          <button
            onClick={() => setInventoryOpen(true)}
            style={HUD.inventoryButtonStyle}
            aria-label={t('hud.inventorySummary', {
              items: inventoryRows
                .map((r) => t('hud.inventoryItemCount', { count: r.count, item: r.name }))
                .join(", "),
            })}
            title={t('hud.openInventory')}
          >
            {inventoryRows.map((row) => (
              // Each chip gets its own outlined pill so neighbouring
              // items don't visually merge into "(apple bread) ×2".
              // The ×N counter renders even at count 1 (always
              // shows what belongs to which icon, no ambiguity).
              <span
                key={row.id}
                style={HUD.inventoryChipStyle}
                title={`${row.name} ×${row.count}`}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>
                  {row.def.icon}
                </span>
                <span style={{ fontSize: 11 }}>×{row.count}</span>
              </span>
            ))}
          </button>
        )}

        {/* Top-right icon group */}
        <div style={HUD.iconGroupStyle}>
          {/* Sound toggle — always visible */}
          <button
            onClick={handleToggleSound}
            style={btnStyle}
            aria-label={
              soundOn ? t('hud.muteMusic') : t('hud.unmuteMusic')
            }
          >
            {soundOn ? (
              // Speaker on
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z"
                  fill="currentColor"
                />
                <path
                  d="M12 6.5a5 5 0 0 1 0 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M14 4a8 8 0 0 1 0 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              </svg>
            ) : (
              // Speaker off (muted X)
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 7.5h2.5L9 4v12l-3.5-3.5H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 7.5Z"
                  fill="currentColor"
                  opacity="0.5"
                />
                <line
                  x1="12"
                  y1="8"
                  x2="17"
                  y2="13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="17"
                  y1="8"
                  x2="12"
                  y2="13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>

          {/* Map button — only on outdoor map */}
          {(currentMapId === "outdoor" || currentMapId === "custom") && (
            <button
              onClick={handleOpenMinimap}
              style={btnStyle}
              aria-label={t('hud.openMinimap')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="2"
                  y="2"
                  width="16"
                  height="16"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="2"
                  y1="10"
                  x2="18"
                  y2="10"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.5"
                />
                <line
                  x1="10"
                  y1="2"
                  x2="10"
                  y2="18"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.5"
                />
                <circle cx="10" cy="10" r="2" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Quest log — opens the modal listing active + completed
              quests. Always visible so the player can re-read the
              objective whenever they want. The dot + pulse share a
              single "unread" semantic: both light up when a quest
              starts and both clear when the player opens the log.
              The QuestHud strip is the persistent "you have active
              quests" signal — duplicating that here would dilute
              the unread cue. */}
          <button
            onClick={() => openQuestLog()}
            style={{
              ...btnStyle,
              position: 'relative',
              animation: questHasUnread
                ? 'lingoMapQuestBtnPulse 1.4s ease-in-out infinite'
                : undefined,
            }}
            aria-label={t('hud.openLog')}
          >
            {questHasUnread && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ff3b30',
                  boxShadow: '0 0 0 1.5px rgba(0,0,0,0.6)',
                }}
              />
            )}
            <style>{`
              @keyframes lingoMapQuestBtnPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.55); transform: scale(1); }
                50%      { box-shadow: 0 0 0 8px rgba(255, 59, 48, 0);     transform: scale(1.08); }
              }
            `}</style>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect
                x="3"
                y="2"
                width="14"
                height="16"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="6"
                y1="6"
                x2="14"
                y2="6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="6"
                y1="10"
                x2="14"
                y2="10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="6"
                y1="14"
                x2="11"
                y2="14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Word stats — chart icon. Sits between the quest log
              and settings since it's progress-data, not destructive. */}
          <button
            onClick={() => setWordStatsOpen(true)}
            style={btnStyle}
            aria-label={t('hud.openWordStats')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="17" x2="17" y2="17" />
              <rect
                x="4"
                y="11"
                width="2.5"
                height="5"
                fill="currentColor"
                stroke="none"
              />
              <rect
                x="8.75"
                y="7"
                width="2.5"
                height="9"
                fill="currentColor"
                stroke="none"
              />
              <rect
                x="13.5"
                y="4"
                width="2.5"
                height="12"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>

          {/* Settings — gear icon. Houses the destructive Reset-game
              action; placed last in the group so it's visually the
              "outermost" affordance. */}
          <button
            onClick={() => setSettingsOpen(true)}
            style={btnStyle}
            aria-label={t('hud.openSettings')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="2.5" />
              <path d="M10 1.5v2.4M10 16.1v2.4M3.5 3.5l1.7 1.7M14.8 14.8l1.7 1.7M1.5 10h2.4M16.1 10h2.4M3.5 16.5l1.7-1.7M14.8 5.2l1.7-1.7" />
            </svg>
          </button>
        </div>

        {dialogue && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 60,
              pointerEvents: "auto",
              touchAction: "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerCancel={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DialogueOverlay
              dialogue={dialogue}
              onAdvance={handleAdvanceDialogue}
              onSelectOption={handleSelectDialogueOption}
            />
          </div>
        )}

        {currentMapId === "cafe-intro" && (
          <CafeIntroScene pixiAppRef={pixiAppRef} />
        )}

        {currentMapId === "social-hub" && (
          <SocialHubScene pixiAppRef={pixiAppRef} />
        )}

        {vocabularyView &&
          (() => {
            const pack = getVocabularyPack(vocabularyView.packId);
            if (!pack) return null;
            return (
              <div style={{ pointerEvents: "auto" }}>
                <VocabularyListView
                  pack={pack}
                  npcName={vocabularyView.npcName}
                  onClose={handleCloseVocabularyView}
                />
              </div>
            );
          })()}

        {translateView &&
          (() => {
            const pack = getVocabularyPack(translateView.packId);
            if (!pack) return null;
            return (
              <div style={{ pointerEvents: "auto" }}>
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
          <div style={{ pointerEvents: "auto" }}>
            <ShopView
              shopName={shopView.shopName}
              onClose={() => setShopView(null)}
            />
          </div>
        )}

        {computerUpgradeOpen && (
          <div style={{ pointerEvents: "auto" }}>
            <ComputerUpgradeView onClose={() => setComputerUpgradeOpen(false)} />
          </div>
        )}

        {questLogOpen && (
          <div style={{ pointerEvents: "auto" }}>
            <QuestLog
              focusQuestId={questLogFocusId}
              onClose={() => {
                setQuestLogOpen(false);
                setQuestLogFocusId(null);
              }}
            />
          </div>
        )}

        {inventoryOpen && (
          <div style={{ pointerEvents: "auto" }}>
            <InventoryView onClose={() => setInventoryOpen(false)} />
          </div>
        )}

        {wordStatsOpen && (
          <div style={{ pointerEvents: "auto" }}>
            <WordStatsView onClose={() => setWordStatsOpen(false)} />
          </div>
        )}

        {settingsOpen && (
          <div style={{ pointerEvents: "auto" }}>
            <SettingsView
              virtualDPadEnabled={virtualDPadEnabled}
              onVirtualDPadEnabledChange={handleVirtualDPadEnabledChange}
              tapMoveSoundEnabled={tapMoveSoundEnabled}
              onTapMoveSoundEnabledChange={handleTapMoveSoundEnabledChange}
              markerLabelStyle={markerLabelStyle}
              onMarkerLabelStyleChange={handleMarkerLabelStyleChange}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        )}

        {/* Quest toast — fixed-positioned at the top, subscribes to
            quest transitions on its own, no props. Always rendered
            so it picks up events from any source (dialogue, future
            world triggers). pointer-events: none on the wrapper so
            it never blocks the canvas. */}
        <QuestToast event={questToastEvent} />

        {/* Persistent ACTIVE-quests strip. Replaces the standalone
            IntroHintBanner since the intro quest's title alone
            already conveys "head to the office." Tap to open the
            full log; auto-hides when no quest is active. Hidden
            on the social-hub experiment — its quests/quest log
            aren't part of that scene's gameplay. */}
        {currentMapId !== "social-hub" && (
          <QuestHud
            liftedForModal={questHudLiftedForModal}
            onOpenLog={openQuestLog}
          />
        )}


        {/* Intro cutscene — full-screen overlay shown once on a
            fresh save (or after a dev reset). Blocks the world
            from booting (see init effect's `cutsceneActive` gate)
            so the canvas can't peek through. On completion: saves
            names to profile, sets the cutscene-seen flag, starts
            the tutorial quest, then flips `cutsceneActive` false
            which kicks off PixiApp boot with the in-house spawn
            override. */}
        {welcomeActive && (
          <div style={{ pointerEvents: "auto" }}>
            <WelcomeScreen
              onFadeStart={() => setWelcomeFading(true)}
              onComplete={() => {
                setWelcomeActive(false);
                setWelcomeFading(false);
              }}
            />
          </div>
        )}
        {/* Locale picker — sits between welcome and cutscene on a
            fresh save. Mount it BEHIND the welcome splash as soon
            as the splash starts fading; otherwise the transparent
            part of the welcome fade reveals the already-booted F1
            room for ~360ms before the picker appears. Keep pointer
            events disabled until welcome fully unmounts. */}
        {localePickerActive && (welcomeFading || !welcomeActive) && (
          <div style={{ pointerEvents: welcomeActive ? "none" : "auto" }}>
            <LocalePickerScreen onComplete={() => setLocalePickerActive(false)} />
          </div>
        )}
        {/* Target-language picker — mounts after the locale picker
            closes, before the cutscene. Same overlay shape so the
            two pickers feel like one boot flow rather than two
            unrelated screens. */}
        {!localePickerActive && targetPickerActive && (welcomeFading || !welcomeActive) && (
          <div style={{ pointerEvents: "auto" }}>
            <TargetPickerScreen onComplete={() => setTargetPickerActive(false)} />
          </div>
        )}
        {cutsceneActive && !localePickerActive && !targetPickerActive && (welcomeFading || !welcomeActive) && (
          <div style={{ pointerEvents: "auto" }}>
            <IntroCutscene
              versionLabel={APP_VERSION}
              onSkipAll={() => {
                // Dev fast-forward: jump straight to post-intro
                // state. Defaults stand in for the names the
                // cutscene would have collected; flags trip the
                // gates that normally fire as part of the apartment
                // monologue's dismiss handler so the player lands
                // exactly where they would have after tapping
                // through the whole opening.
                if (!getPlayerName()) {
                  setProfile("Papa", getChildName() ?? "Mim");
                }
                markLocalePicked();
                markTargetPicked();
                setFlag(FLAGS.INTRO_CUTSCENE_SEEN);
                setFlag(FLAGS.INTRO_APARTMENT_SEEN);
                startQuest("intro-translator-job");
                // Tear down every overlay layer in order:
                // welcome (already off in this branch), locale +
                // target pickers (defensive, in case the user paused
                // on either), cutscene, intro gap. World is already
                // booted with the in-house spawn override.
                setWelcomeActive(false);
                setWelcomeFading(false);
                setLocalePickerActive(false);
                setTargetPickerActive(false);
                setCutsceneActive(false);
                setIntroGapActive(false);
              }}
              onComplete={() => {
                // No teleport needed — the engine already booted with
                // startMapId/startSpawnId pointing inside the house
                // (see init effect's `cutsceneActive` branch). This
                // avoids the brief outdoor-flash that the post-cutscene
                // teleport approach produced.
                //
                // Order matters: flip `introGapActive` true FIRST so
                // the engine's worldPausedByUI=true survives the same
                // batched commit that unmounts the cutscene. Without
                // this, there's a one-frame window where cutscene-end
                // is processed but the apartment trigger effect (which
                // sets introGapActive) hasn't run yet — and a queued
                // tap on mobile fires Mim's dialogue before the pause
                // re-asserts.
                setIntroGapActive(true);
                setCutsceneActive(false);
              }}
            />
          </div>
        )}

        {minimapData && (
          <div style={{ pointerEvents: "auto" }}>
            <Minimap
              mapData={minimapData.map}
              gameState={minimapData.state}
              onClose={handleCloseMinimap}
            />
          </div>
        )}

        {/* Mobile virtual D-pad — auto-hides on desktop. Suppressed
            while a blocking overlay is open so it cannot keep a
            movement input alive behind modal UI. */}
        {virtualDPadEnabled && !worldPausedByOverlay && (
          <VirtualDPad onChange={handleDPadChange} />
        )}
      </div>
    </div>
  );
}
