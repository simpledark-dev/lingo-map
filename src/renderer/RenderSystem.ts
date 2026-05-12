import {
  Application,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import {
  Direction,
  Entity,
  MapData,
  MapLayer,
  PlayerState,
} from "../core/types";
import { PLAYER_LAYER_ID, PLAYER_SPRITE_PREFIX } from "../core/constants";
import {
  getEffectiveZIndex,
  getLayers,
  getPrimaryTileLayer,
  getTileLayers,
} from "../core/Layers";
import {
  getTexture,
  getTileTexture,
  loadAssets,
  loadPackSingle,
} from "./AssetLoader";
import { getDeskSpriteKey } from "../data/computerUpgrade";
import { getMarkerLabelPreset } from "../data/markerLabelStyles";
import { getMarkerLabelStyle } from "../data/settings";
import { buildTransitionLayer, TRANSITION_ASSET_KEYS } from "./TransitionTiles";
import { buildAutoTileLayer, isAutoTilesetReady } from "./AutoTileset";

// Some spriteKeys in map data are "neutral" — they get resolved to a
// concrete texture at runtime based on game state. Today the only such
// key is `computer-desk`, which swaps to a per-level desk image so the
// room visually reflects the player's upgrade tier without the map
// editor having to know about levels.
function resolveLeveledSpriteKey(spriteKey: string): string {
  if (spriteKey === "computer-desk") return getDeskSpriteKey();
  return spriteKey;
}

function getMarkerLabelTextResolution(): number {
  if (typeof window === "undefined") return 2;
  // Marker captions are tiny world-space Pixi Text textures that get
  // resampled again by camera zoom. Oversampling the source texture keeps
  // them readable at fractional zoom without meaningfully affecting memory
  // because there are only a few labels on screen.
  return Math.max(2, Math.min(4, (window.devicePixelRatio || 1) * 2));
}

// Filter thresholds for the occlusion-fade candidate list. Object
// sprites narrower than `MIN_OCCLUDER_WIDTH` or shorter than
// `MIN_OCCLUDER_HEIGHT` (both at the sprite's rendered scale) can never
// meaningfully hide the player, so they're omitted from the per-frame
// fade scan. Width matches the in-fade `MIN_FADE_WIDTH` so the runtime
// behaviour is consistent with the user's earlier "don't fade thin
// things like lampposts" preference.
const MIN_OCCLUDER_WIDTH = 75;
const MIN_OCCLUDER_HEIGHT = 32;
const IDLE_FRAME_COUNT = 6;
const IDLE_FRAME_DURATION = 0.28; // seconds per frame; slow enough to read as breathing

interface AnimData {
  baseX: number;
  baseY: number;
  phase: number; // random offset so each sprite sways independently
  speed: number; // oscillation speed
  rotAmount: number; // max rotation in radians
  swayAmount: number; // max X sway in pixels
}

export class RenderSystem {
  private app: Application;
  private worldContainer: Container;
  private groundLayer: Container;
  private transitionLayer: Container;
  private autoTileLayer: Container;
  private entityLayer: Container;
  private roofLayer: Container;
  // Sits between autoTileLayer and entityLayer. Holds objects on the
  // 'floor' layer (sidewalks, rugs, doormats — flat decor that never
  // needs to Y-sort with the player). Crucially, this container's
  // children do NOT participate in entityLayer.sortableChildren, so
  // moving 478 sidewalk objects here cuts the dynamic sort cost
  // dramatically.
  private floorContainer: Container;

  private playerSprite: Sprite | null = null;

  // Sprite registries for depth sorting
  private objectSprites = new Map<string, Sprite>();
  private buildingBaseSprites = new Map<string, Sprite>();
  private npcSprites = new Map<string, Sprite>();
  // Subset of objectSprites that could actually occlude the player
  // (sprite is wide AND tall enough to be a meaningful blocker). Built
  // once at scene load; applyOcclusionFade iterates this set instead
  // of all 600+ object sprites every frame. Floor decor like rugs and
  // sidewalks never qualify and are skipped entirely.
  private occludingObjectSprites = new Map<string, Sprite>();

  // Managed roof collection — supports per-roof control for future extensibility
  private roofSprites = new Map<string, Sprite>();
  // Car sprites — managed by CarSystem via setCar/removeCar/clearCars.
  // Live in entityLayer so they Y-sort with the player and props.
  private carSprites = new Map<string, Sprite>();
  // Fallback colored rect drawn when a car's sprite key isn't loaded
  // (e.g., the user hasn't dropped car art into public/assets yet). Same
  // entity-layer slot as the textured version so toggling between fallback
  // and real art is transparent to the rest of the renderer.
  private carFallbacks = new Map<string, Graphics>();
  // Sprite keys we've already warned about, to avoid spamming the console
  // every frame for the same missing texture.
  private warnedMissingCarKeys = new Set<string>();
  // Clip mask matching the current map's tile rect. Applied to every car
  // sprite (and fallback rect) so cars driving past the map edge clip
  // smoothly out of the visible area instead of either popping out or
  // hovering past the world boundary.
  private mapBoundsMask: Graphics | null = null;
  // Optional debug overlay drawing collision boxes for the player, NPCs,
  // cars, and the cars' look-ahead boxes. Toggled via PixiApp's keyboard
  // shortcut. Cleared when disabled.
  private debugCollisionGraphics: Graphics | null = null;
  // Last camera cell (col/row) + zoom we used for the static-layer cull
  // pass. Static layers (ground, transition, autotile, floor, roof) are
  // re-culled only when this changes — otherwise running ~3000 bbox
  // checks every frame on stationary content is wasted work. Dynamic
  // entities (player, NPCs, cars) are still re-culled every frame
  // because they can walk into a stationary camera's viewport.
  private lastStaticCullKey: { col: number; row: number; zoom: number } | null =
    null;
  // RenderTexture holding the entire static map art baked once at
  // scene mount. After the bake, ground/transition/autotile/floor
  // containers are emptied and a single Sprite of this texture renders
  // them all in one draw call. Drops Pixi's static scene-graph cost
  // from thousands of sprites to one.
  private bakedStaticTexture: RenderTexture | null = null;
  // Flipped true in `destroy()`. Lazy-load callbacks for pack-key
  // objects check this before adding sprites — without it, a Promise
  // that resolves after a scene transition would try to attach
  // children to destroyed containers (PixiJS throws on that).
  private destroyed = false;

  // Current map data (needed for sorting)
  private currentMap: MapData | null = null;

  // Animation data — renderer-only, does not affect gameplay
  private treeAnims = new Map<string, AnimData>();
  private npcAnims = new Map<string, AnimData>();
  /** Edge-of-map district arrow bob — `id → { baseY, phase }`. Pure
   *  cosmetic: a 2px sine wave on Y to signal the arrow is tappable.
   *  Registered when an entity with a `edge-arrow-*` spriteKey lands
   *  on the entity layer (NOT the floor layer — that one bakes into
   *  a static texture and won't animate). */
  private arrowAnims = new Map<string, { baseY: number; phase: number }>();
  /** Quest markers — runtime-managed bobbing sprites attached to a
   *  world position (typically above a quest-relevant entity). The
   *  React layer drives lifecycle via setQuestMarkers / clearQuestMarkers
   *  on PixiApp; the renderer just owns the sprite container + the
   *  bob animation. Cleared on every `setMap` so a marker pointing
   *  at the previous scene's coords doesn't bleed into the new one. */
  private questMarkers = new Map<
    string,
    {
      sprite: Sprite;
      label: Text | null;
      /** Constant Y baseline relative to the marker's home X — only
       *  used when `followNpcId` is null. When the marker follows a
       *  moving NPC, baseY is recomputed each frame from the NPC
       *  sprite's current position so the bob still anchors at the
       *  same offset above its head. */
      baseY: number;
      /** Vertical offset of the label above the sprite's top edge.
       *  Captured once at create time so we don't have to re-read
       *  texture height every frame. */
      labelOffset: number;
      phase: number;
      /** When set, the marker tracks the NPC sprite with this id —
       *  position updates each frame from `npcSprites`. The original
       *  (m.x, m.y) at create time is interpreted as the OFFSET from
       *  the NPC's anchor (typically 0, -28 for "above the head"). */
      followNpcId: string | null;
      /** Stored offsets relative to the followed NPC. Applied each
       *  frame as `npcSprite.x + offsetX`, `npcSprite.y + offsetY`. */
      offsetX: number;
      offsetY: number;
      labelBaseY: number;
    }
  >();
  private questMarkerLayer: Container | null = null;
  animationsEnabled = true;

  // Player walk animation state
  private playerWalkTimer = 0;
  private playerWalkFrame = 0; // 0 = idle, 1 = walk1, 2 = walk2
  private playerIdleTimer = 0;
  private playerIdleFrame = 0;
  private playerLastX = 0;
  private playerLastY = 0;
  private readonly WALK_FRAME_DURATION = 0.15; // seconds per frame
  private npcMotion = new Map<
    string,
    { facing: Direction; walking: boolean; walkFrame: 0 | 1 }
  >();

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.groundLayer = new Container();
    this.transitionLayer = new Container();
    this.autoTileLayer = new Container();
    this.floorContainer = new Container();
    this.entityLayer = new Container();
    this.roofLayer = new Container();
    // Quest markers ride above roofs so the floating arrow is
    // never occluded by a building roof or tall decor. Not depth-
    // sorted — markers are world-space but always-on-top.
    this.questMarkerLayer = new Container();

    // Entity layer uses sortableChildren for zIndex-based depth sorting.
    // floorContainer intentionally does NOT — its children are flat
    // sidewalk/rug decor that never Y-sort with the player.
    this.entityLayer.sortableChildren = true;

    this.worldContainer.addChild(this.groundLayer);
    this.worldContainer.addChild(this.transitionLayer);
    this.worldContainer.addChild(this.autoTileLayer);
    this.worldContainer.addChild(this.floorContainer);
    this.worldContainer.addChild(this.entityLayer);
    this.worldContainer.addChild(this.roofLayer);
    this.worldContainer.addChild(this.questMarkerLayer);
    this.app.stage.addChild(this.worldContainer);
  }

  renderTiles(map: MapData): void {
    this.groundLayer.removeChildren();
    this.transitionLayer.removeChildren();
    this.autoTileLayer.removeChildren();

    // Build (or refresh) the map-bounds mask so car sprites clip to the
    // visible tile area. Lazy creation on first scene load; otherwise
    // resize the existing mask to the new map's dimensions.
    //
    // The mask Graphics is added at index 0 of `worldContainer`, so it
    // renders FIRST (behind everything) and gets fully covered by the
    // ground / transition / autotile / entity layers stacked above. The
    // user never sees the white rectangle, but it's still in the scene
    // graph and `renderable = true`, which is what PixiJS v8's prod
    // pipeline needs for the mask buffer to populate correctly. Earlier
    // we tried `renderable = false`, which worked in dev but in prod
    // emptied the mask → every sprite using it as a mask (i.e., every
    // ambient car) became invisible.
    if (!this.mapBoundsMask) {
      this.mapBoundsMask = new Graphics();
      this.worldContainer.addChildAt(this.mapBoundsMask, 0);
    }
    this.mapBoundsMask.clear();
    this.mapBoundsMask
      .rect(0, 0, map.width * map.tileSize, map.height * map.tileSize)
      // Black fill (was white) — the rect doubles as the visible
      // backdrop behind tile sprites. `void` cells have no texture in
      // `spriteManifest`, so `getTileTexture('void')` returns
      // undefined and the cell is skipped at render time. Whatever
      // colour this rect carries shows through those holes. White
      // looked wrong (BL: "space outside the map is white"); black
      // matches what `void` is meant to read as. Mask use for car
      // sprites (`sprite.mask = mapBoundsMask`) cares only about the
      // alpha channel, so the clip shape is unchanged.
      .fill({ color: 0x000000 });

    // Iterate every tile layer in render order, drawing each non-empty cell
    // into the shared ground container. Empty cells let lower layers show
    // through. Game runtime ignores the editor-only `visible` flag.
    const tileLayers = getTileLayers(map);
    for (const layer of tileLayers) {
      for (let row = 0; row < map.height; row++) {
        for (let col = 0; col < map.width; col++) {
          const tileType = layer.tiles[row]?.[col];
          if (!tileType) continue;
          const texture = getTileTexture(tileType, row, col);
          if (!texture) continue;
          const sprite = new Sprite(texture);
          sprite.x = col * map.tileSize;
          sprite.y = row * map.tileSize;
          sprite.width = map.tileSize;
          sprite.height = map.tileSize;
          this.groundLayer.addChild(sprite);
        }
      }
    }

    // Transitions + autotile anchor on the PRIMARY (first) tile layer —
    // typically "Ground". Higher tile layers (e.g. Walls) don't participate.
    const primary = getPrimaryTileLayer(map);
    const primaryGrid = primary?.tiles ?? map.tiles;
    const transitions = buildTransitionLayer(
      { ...map, tiles: primaryGrid },
      false,
    );
    this.transitionLayer.addChild(transitions);
    if (isAutoTilesetReady()) {
      const autoTiles = buildAutoTileLayer(
        primaryGrid,
        map.width,
        map.height,
        map.tileSize,
      );
      this.autoTileLayer.addChild(autoTiles);
    }
  }

  renderObjects(map: MapData): void {
    this.currentMap = map;
    this.entityLayer.removeChildren();
    this.floorContainer.removeChildren();
    this.roofLayer.removeChildren();
    this.objectSprites.clear();
    this.buildingBaseSprites.clear();
    this.npcSprites.clear();
    this.npcMotion.clear();
    this.roofSprites.clear();
    this.occludingObjectSprites.clear();
    this.treeAnims.clear();
    this.npcAnims.clear();
    this.arrowAnims.clear();
    // Quest markers are scene-specific (positioned in world coords
    // of the previous map) — clear on every scene swap and let the
    // React layer re-add for the new scene if a quest still wants
    // them shown.
    this.clearQuestMarkers();

    const layers = getLayers(map);

    // Tree-anim seed walks per sync-loaded tree to give each its own
    // sway phase. Lazy-loaded trees (pack-key trees) don't get an
    // animation entry — current data only puts placeholder 'tree'
    // sprites under sync load anyway, so this is moot in practice.
    const treeSeedRef = { value: 1 };

    // Objects: create sprites for whichever textures are already loaded
    // (sync path), and lazy-load the rest in the background. Late-arrived
    // pack-key sprites land in floorContainer/entityLayer post-bake and
    // simply render live. Order matters less than throughput here —
    // we'd rather have the player-controllable scene visible immediately
    // than block on every me:* PNG before first paint.
    for (const obj of map.objects) {
      const resolvedKey = resolveLeveledSpriteKey(obj.spriteKey);
      const texture = getTexture(resolvedKey);
      if (texture) {
        this.createObjectSprite(obj, texture, layers, treeSeedRef);
      } else if (obj.spriteKey.startsWith("me:")) {
        const targetMap = map;
        loadPackSingle(obj.spriteKey)
          .then((tex) => {
            // Bail if scene changed during the load — we'd otherwise
            // attach this sprite to the wrong map's containers.
            if (this.currentMap !== targetMap) return;
            // Re-check the cache; another path (e.g., editor preload)
            // may have already populated it.
            const final = tex ?? getTexture(obj.spriteKey);
            if (!final) return;
            // Skip if this id already has a sprite (defensive — could
            // happen if the same key loads twice via different paths).
            if (this.objectSprites.has(obj.id)) return;
            this.createObjectSprite(obj, final, layers, treeSeedRef);
          })
          .catch(() => {
            /* AssetLoader logs */
          });
      }
      // Non-pack key with missing texture — nothing to lazy-load,
      // sprite stays absent. Same behaviour as before C4.
    }

    // Building bases
    for (const building of map.buildings) {
      const scale = building.scale ?? 1;
      const baseTexture = getTexture(building.baseSpriteKey);
      if (baseTexture) {
        const sprite = new Sprite(baseTexture);
        sprite.anchor.set(building.anchor.x, building.anchor.y);
        sprite.x = building.x;
        sprite.y = building.y;
        // Buildings always render on the props layer alongside the player so
        // Y-sort lets you walk visually behind them.
        sprite.zIndex = getEffectiveZIndex(
          layers,
          PLAYER_LAYER_ID,
          building.sortY,
        );
        if (scale !== 1) sprite.scale.set(scale);
        this.entityLayer.addChild(sprite);
        this.buildingBaseSprites.set(building.id, sprite);
      }

      // Roof — managed collection for future per-roof control. Skipped if the
      // building is drawn as a single sprite (no separate roof).
      const roofTexture = building.roofSpriteKey
        ? getTexture(building.roofSpriteKey)
        : undefined;
      if (roofTexture) {
        const roofSprite = new Sprite(roofTexture);
        roofSprite.anchor.set(building.anchor.x, 1.0);
        // Position roof so its bottom sits on top of the base sprite. With
        // building.scale applied, the visible base height is baseHeight * scale.
        const baseHeight = baseTexture ? baseTexture.height : 96;
        roofSprite.x = building.x;
        roofSprite.y = building.y - baseHeight * scale;
        if (scale !== 1) roofSprite.scale.set(scale);
        roofSprite.alpha = 1.0; // fully opaque for vertical slice
        this.roofLayer.addChild(roofSprite);
        this.roofSprites.set(building.id, roofSprite);
      }
    }

    // NPCs — always on the props layer alongside the player. NPCs use
    // a local seed independent of trees since their iteration is
    // strictly synchronous; tree-anim seeds shared an LCG with NPCs
    // before but the dependency was incidental, not desirable.
    let npcSeed = treeSeedRef.value;
    for (const npc of map.npcs) {
      // NPC `spriteKey` is treated as a prefix when a directional
      // texture (`<key>-down`) exists — that's the convention for
      // Modern-Interiors `me-char-NN` characters which animate by
      // facing. Otherwise it's a single static texture (legacy NPCs:
      // "npc", "npc-blue"). Default to facing down at scene mount.
      const texture =
        getTexture(`${npc.spriteKey}-down`) ?? getTexture(npc.spriteKey);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(npc.anchor.x, npc.anchor.y);
      sprite.x = npc.x;
      sprite.y = npc.y;
      sprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, npc.sortY);
      this.entityLayer.addChild(sprite);
      this.npcSprites.set(npc.id, sprite);
      this.npcMotion.set(npc.id, {
        facing: "down",
        walking: false,
        walkFrame: 0,
      });

      // NPC idle bob — very subtle vertical movement
      npcSeed = (npcSeed * 1103515245 + 12345) & 0x7fffffff;
      this.npcAnims.set(npc.id, {
        baseX: npc.x,
        baseY: npc.y,
        phase: ((npcSeed % 1000) / 1000) * Math.PI * 2,
        speed: 1.2 + (npcSeed % 400) / 1000, // 1.2–1.6
        rotAmount: 0,
        swayAmount: 0.8, // subtle vertical bob in pixels
      });
    }
  }

  /** Build the sprite for a single object and stash it in the right
   * containers/maps. Used by both the synchronous renderObjects loop
   * and the async lazy-load callback for pack-key objects whose
   * texture wasn't ready at scene mount. Keeping these paths sharing
   * one helper means the occluder filter, layer routing, and tree-anim
   * registration stay consistent regardless of when the sprite arrives. */
  private createObjectSprite(
    obj: Entity,
    texture: Texture,
    layers: MapLayer[],
    treeSeedRef: { value: number },
  ): void {
    // Stale-callback guard — `destroy()` flips this so any in-flight
    // `loadPackSingle` Promise that resolves after the RenderSystem
    // was torn down (scene transition, app teardown) bails before
    // touching destroyed PixiJS containers.
    if (this.destroyed) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(obj.anchor.x, obj.anchor.y);
    sprite.x = obj.x;
    sprite.y = obj.y;
    sprite.zIndex = getEffectiveZIndex(layers, obj.layer, obj.sortY);
    if (obj.scale && obj.scale !== 1) sprite.scale.set(obj.scale);
    // Flat 'floor' decor lives in a non-sortable sibling container
    // below entityLayer (R4). zIndex is still set above for the few
    // code paths that read it (debug overlay), but the renderer never
    // sorts these children — order is addChild order.
    if (obj.layer === "floor") {
      this.floorContainer.addChild(sprite);
    } else {
      this.entityLayer.addChild(sprite);
    }
    this.objectSprites.set(obj.id, sprite);
    // Pre-filter occluders for the per-frame fade scan.
    const scale = obj.scale ?? 1;
    const visW = texture.width * scale;
    const visH = texture.height * scale;
    if (visW >= MIN_OCCLUDER_WIDTH && visH >= MIN_OCCLUDER_HEIGHT) {
      this.occludingObjectSprites.set(obj.id, sprite);
    }
    // Edge-arrow bob — registers any entity whose spriteKey starts
    // with `edge-arrow-` provided it landed in the entity layer (the
    // floor layer bakes into a static RT and would freeze the bob).
    // Phase derived from the entity id so two arrows side-by-side
    // bob out of sync, which reads as more "alive."
    if (obj.spriteKey?.startsWith("edge-arrow-") && obj.layer !== "floor") {
      let h = 0;
      for (let i = 0; i < obj.id.length; i++)
        h = (h * 31 + obj.id.charCodeAt(i)) | 0;
      this.arrowAnims.set(obj.id, {
        baseY: obj.y,
        phase: ((h % 1000) / 1000) * Math.PI * 2,
      });
    }
    // Tree anim — only fires for the literal 'tree' placeholder sprite
    // key, so lazy-loaded pack-key objects never hit this branch.
    if (obj.spriteKey === "tree") {
      treeSeedRef.value = (treeSeedRef.value * 1103515245 + 12345) & 0x7fffffff;
      const seed = treeSeedRef.value;
      this.treeAnims.set(obj.id, {
        baseX: obj.x,
        baseY: obj.y,
        phase: ((seed % 1000) / 1000) * Math.PI * 2,
        speed: 0.8 + (seed % 500) / 1000,
        rotAmount: 0.015 + (seed % 300) / 30000,
        swayAmount: 0.5 + (seed % 200) / 400,
      });
    }
  }

  /** Flatten the four static layers (ground tiles + transitions +
   * autotile + floor decor) into a single RenderTexture, then replace
   * their sprite contents with one Sprite of that texture. This is
   * R5 of the runtime-perf plan: drops the static scene graph from
   * ~3000 individual sprites to one, slashing per-frame Pixi work
   * (sort/cull/transform/draw-call) on mobile.
   *
   * Called from PixiApp.loadScene after renderTiles + renderObjects,
   * BEFORE the first updateCamera. At that moment worldContainer's
   * transform is still identity, so each static container's children
   * render at their local pixel positions inside the bake texture. */
  bakeStaticLayers(map: MapData): void {
    const w = map.width * map.tileSize;
    const h = map.height * map.tileSize;
    if (w <= 0 || h <= 0) return;

    const bakeTexture = RenderTexture.create({ width: w, height: h });
    // Pixel-art look — no interpolation when the bake is upscaled.
    bakeTexture.source.scaleMode = "nearest";

    // Multi-pass: clear on the first one, accumulate on the rest. Order
    // matches the original z-stack so the bake looks identical to the
    // unbaked version.
    const staticContainers: Container[] = [
      this.groundLayer,
      this.transitionLayer,
      this.autoTileLayer,
      this.floorContainer,
    ];
    let first = true;
    for (const c of staticContainers) {
      if (c.children.length === 0) continue;
      this.app.renderer.render({
        container: c,
        target: bakeTexture,
        clear: first,
      });
      first = false;
    }
    if (first) {
      // Nothing to bake — empty map. Drop the unused texture and bail.
      bakeTexture.destroy(true);
      return;
    }

    // Wipe originals — they're now baked into the texture and shouldn't
    // render anything anymore. Each container stays in worldContainer
    // (with no children) so existing layer ordering and cull iteration
    // stays intact, just over zero items.
    for (const c of staticContainers) {
      c.removeChildren();
    }

    // Single sprite holding the bake. Goes into groundLayer so it
    // renders at the bottom of the z-stack, mirroring where the original
    // tile sprites used to live.
    const bakeSprite = new Sprite(bakeTexture);
    this.groundLayer.addChild(bakeSprite);
    this.bakedStaticTexture = bakeTexture;
  }

  initPlayer(player: PlayerState): void {
    const texture = getTexture(player.spriteKey);
    if (!texture) return;

    this.playerSprite = new Sprite(texture);
    this.playerSprite.anchor.set(player.anchor.x, player.anchor.y);
    this.playerSprite.x = player.x;
    this.playerSprite.y = player.y;
    this.playerLastX = player.x;
    this.playerLastY = player.y;
    this.playerIdleTimer = 0;
    this.playerIdleFrame = 0;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    this.playerSprite.zIndex = getEffectiveZIndex(
      layers,
      PLAYER_LAYER_ID,
      player.sortY,
    );
    this.entityLayer.addChild(this.playerSprite);
  }

  updatePlayer(player: PlayerState, delta: number = 0): void {
    if (!this.playerSprite) return;

    // Detect if player is moving
    const dx = player.x - this.playerLastX;
    const dy = player.y - this.playerLastY;
    const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;
    this.playerLastX = player.x;
    this.playerLastY = player.y;

    // Determine sprite key with walk animation
    let spriteKey = player.spriteKey; // e.g. 'player-down'

    if (isMoving && delta > 0) {
      this.playerIdleTimer = 0;
      this.playerIdleFrame = 0;
      this.playerWalkTimer += delta;
      if (this.playerWalkTimer >= this.WALK_FRAME_DURATION) {
        this.playerWalkTimer -= this.WALK_FRAME_DURATION;
        // Alternate: walk1 → idle → walk1 → idle...
        this.playerWalkFrame = (this.playerWalkFrame + 1) % 2;
      }
      if (this.playerWalkFrame === 0) {
        spriteKey = player.spriteKey + "-walk1";
      }
      // frame 1 = idle (use base spriteKey, already set)
    } else {
      // Standing still — cycle through the Modern Interiors idle
      // frames when available. Legacy sprites fall back to the base
      // directional texture below.
      this.playerWalkTimer = 0;
      this.playerWalkFrame = 0;
      if (delta > 0) {
        this.playerIdleTimer += delta;
        while (this.playerIdleTimer >= IDLE_FRAME_DURATION) {
          this.playerIdleTimer -= IDLE_FRAME_DURATION;
          this.playerIdleFrame = (this.playerIdleFrame + 1) % IDLE_FRAME_COUNT;
        }
      }
      spriteKey = `${player.spriteKey}-idle${this.playerIdleFrame + 1}`;
    }

    // Try walk frame, fall back to base sprite if not found
    const texture = getTexture(spriteKey) || getTexture(player.spriteKey);
    if (texture) {
      this.playerSprite.texture = texture;
    }
    this.playerSprite.x = player.x;
    this.playerSprite.y = player.y;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    this.playerSprite.zIndex = getEffectiveZIndex(
      layers,
      PLAYER_LAYER_ID,
      player.sortY,
    );
  }

  /** Mask rectangle that clips `worldContainer` to a centered sub-region of
   * the canvas when the current map imposes a viewport cap. Left unassigned
   * (no mask) when there is no cap, so the whole canvas shows the world. */
  private viewportMask: Graphics | null = null;

  updateCamera(
    cameraX: number,
    cameraY: number,
    zoom: number = 1,
    viewportCap?: { viewW: number; viewH: number },
  ): void {
    const canvasW = this.app.screen.width;
    const canvasH = this.app.screen.height;

    // If a cap is set, the visible window in screen pixels is the capped
    // world size scaled by zoom, centered on the canvas. Otherwise the world
    // fills the whole canvas (no mask, no centering offset).
    const cappedScreenW = viewportCap ? viewportCap.viewW * zoom : canvasW;
    const cappedScreenH = viewportCap ? viewportCap.viewH * zoom : canvasH;
    const offsetX = viewportCap ? (canvasW - cappedScreenW) / 2 : 0;
    const offsetY = viewportCap ? (canvasH - cappedScreenH) / 2 : 0;

    this.worldContainer.scale.set(zoom, zoom);
    // Camera position stays fractional in CSS pixels. With the
    // renderer's `resolution: devicePixelRatio` and `roundPixels: true`,
    // Pixi rounds each sprite's draw position at DEVICE-pixel
    // granularity — finer than rounding the whole container at CSS
    // level (which would force 2-3 device pixel jumps per frame on
    // mobile, the very stutter the user reported). Letting it stay
    // float lets the renderer place sprites within device-pixel
    // precision, smoothing slow camera motion.
    this.worldContainer.x = offsetX - cameraX * zoom;
    this.worldContainer.y = offsetY - cameraY * zoom;

    // Install / update / remove the viewport mask so anything outside the
    // visible window renders black (the stage background).
    if (viewportCap) {
      if (!this.viewportMask) {
        this.viewportMask = new Graphics();
        this.app.stage.addChild(this.viewportMask);
        this.worldContainer.mask = this.viewportMask;
      }
      this.viewportMask.clear();
      this.viewportMask
        .rect(offsetX, offsetY, cappedScreenW, cappedScreenH)
        .fill(0xffffff);
    } else if (this.viewportMask) {
      this.worldContainer.mask = null;
      this.viewportMask.destroy();
      this.app.stage.removeChild(this.viewportMask);
      this.viewportMask = null;
    }

    // Viewport culling — still based on canvas so we don't accidentally cull
    // sprites that fall inside the clip region of the mask.
    this.cullViewport(cameraX, cameraY, zoom, canvasW, canvasH);
  }

  private cullViewport(
    camX: number,
    camY: number,
    zoom: number,
    canvasW: number,
    canvasH: number,
  ): void {
    const margin = 128; // extra margin to avoid pop-in
    const vw = canvasW / zoom + margin * 2;
    const vh = canvasH / zoom + margin * 2;
    const left = camX - margin;
    const top = camY - margin;
    const right = left + vw;
    const bottom = top + vh;

    const T = this.currentMap?.tileSize ?? 32;

    // ── Dynamic entity layer: cull every frame ──
    // Trees and signposts in here never move, but NPCs, cars, and the
    // player do — and a moving NPC can walk into a stationary camera's
    // viewport, so a fresh visibility pass each frame is required for
    // correctness. After the R4 floor-split this container holds
    // ~125 sprites instead of ~600.
    for (const child of this.entityLayer.children) {
      if (child === this.playerSprite) continue;
      child.visible =
        child.x + 128 > left &&
        child.x - 128 < right &&
        child.y + 32 > top &&
        child.y - 192 < bottom;
    }

    // ── Static layers: re-cull only when the camera crosses a tile ──
    // boundary or zoom changes. Skipping these in steady state turns
    // ~3000 per-frame bbox checks into ~125. None of these containers'
    // contents move at runtime so the visibility set is stable until
    // the camera shifts to a new cell.
    const cellCol = Math.floor(camX / T);
    const cellRow = Math.floor(camY / T);
    const last = this.lastStaticCullKey;
    if (
      last &&
      last.col === cellCol &&
      last.row === cellRow &&
      last.zoom === zoom
    )
      return;
    this.lastStaticCullKey = { col: cellCol, row: cellRow, zoom };

    // Cull ground tiles. After R5 bakes the static map, this container
    // holds a single big sprite covering the whole map instead of one
    // tile per cell, so use the sprite's real width/height (with the
    // tile size as a fallback for the pre-bake/empty case).
    for (const child of this.groundLayer.children) {
      const cw = (child as Sprite).width || T;
      const ch = (child as Sprite).height || T;
      child.visible =
        child.x + cw > left &&
        child.x < right &&
        child.y + ch > top &&
        child.y < bottom;
    }

    // Cull transition layer
    for (const child of this.transitionLayer.children) {
      // Transition layer has a single container child
      if ("children" in child) {
        for (const tc of (child as Container).children) {
          tc.visible =
            tc.x + T > left && tc.x < right && tc.y + T > top && tc.y < bottom;
        }
      }
    }

    // Cull auto-tile layer (same nested structure as transitions)
    for (const child of this.autoTileLayer.children) {
      if ("children" in child) {
        for (const tc of (child as Container).children) {
          tc.visible =
            tc.x + T > left && tc.x < right && tc.y + T > top && tc.y < bottom;
        }
      }
    }

    // Cull flat floor decor — same bbox-extend approach. These live in
    // their own non-sortable container after the layer split (R4).
    for (const child of this.floorContainer.children) {
      child.visible =
        child.x + 128 > left &&
        child.x - 128 < right &&
        child.y + 32 > top &&
        child.y - 192 < bottom;
    }

    // Cull roofs (buildings don't move, so static)
    for (const child of this.roofLayer.children) {
      child.visible =
        child.x + 128 > left &&
        child.x - 128 < right &&
        child.y + 128 > top &&
        child.y - 128 < bottom;
    }
  }

  /** Fade sprites that are visually in front of the player so the user can
   * see where the character is when walking behind tall objects (buildings,
   * trees, lampposts, roofs).
   *
   * Two conditions for a fade:
   *  - the sprite's screen-space bbox overlaps a small box around the player's
   *    feet (we use feet-up-by-sprite-height so an entire tall building counts
   *    as "covering" the player while they stand at its base),
   *  - the sprite renders ABOVE the player in z-order (zIndex > player's), so
   *    things drawn behind don't pointlessly fade.
   *
   * Roofs always render above the entity layer regardless of zIndex (separate
   * container), so we apply the bbox check unconditionally for them.
   *
   * Alpha is lerped toward the target each frame (0.4 occluded, 1.0 clear)
   * so the fade in/out is smooth as the player walks past, instead of
   * popping. */
  applyOcclusionFade(): void {
    if (!this.playerSprite) return;
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    const playerZ = this.playerSprite.zIndex;
    // Player's hit zone — feet at (px, py), extend a player-height upward
    // and a small horizontal pad. Fade only triggers when the player's box
    // is FULLY inside the sprite's box (every edge contained), so partial
    // overlaps as the player walks past don't flicker the sprite.
    const PAD_X = 6;
    const PAD_TOP = 28;
    const playerLeft = px - PAD_X;
    const playerRight = px + PAD_X;
    const playerTop = py - PAD_TOP;
    const playerBottom = py;

    const TARGET_FADED = 0.35;
    const TARGET_CLEAR = 1.0;
    const LERP = 0.2;

    const lerp = (sprite: Sprite, target: number) => {
      const next = sprite.alpha + (target - sprite.alpha) * LERP;
      sprite.alpha = Math.abs(next - target) < 0.01 ? target : next;
    };

    // Skip narrow sprites entirely — fading a lamppost or fencepost is
    // visually noisy and the player isn't really "hidden" behind them
    // anyway. Threshold tuned to roughly the width of a small building
    // base, so anything wider triggers normally.
    const MIN_FADE_WIDTH = 75;

    /** True iff the player's box is fully contained in the sprite's box —
     * the whole character is behind the sprite, not just clipping an edge. */
    const occludes = (sprite: Sprite): boolean => {
      const w = sprite.width;
      if (w < MIN_FADE_WIDTH) return false;
      const h = sprite.height;
      const left = sprite.x - sprite.anchor.x * w;
      const top = sprite.y - sprite.anchor.y * h;
      const right = left + w;
      const bottom = top + h;
      return (
        playerLeft >= left &&
        playerRight <= right &&
        playerTop >= top &&
        playerBottom <= bottom
      );
    };

    const checkEntitySprite = (sprite: Sprite) => {
      if (sprite === this.playerSprite) return;
      // Behind-or-equal in z order → never an occluder.
      if (sprite.zIndex <= playerZ) {
        lerp(sprite, TARGET_CLEAR);
        return;
      }
      lerp(sprite, occludes(sprite) ? TARGET_FADED : TARGET_CLEAR);
    };

    // Iterate the precomputed occluder subset, NOT all 600+ object
    // sprites. Floor decor and other small/flat sprites were filtered
    // out at scene load (in renderObjects) so they never reach this
    // per-frame loop. Their alpha stays at the initial 1.0 — no need
    // to lerp them since they were never going to be faded anyway.
    for (const sprite of this.occludingObjectSprites.values())
      checkEntitySprite(sprite);
    for (const sprite of this.buildingBaseSprites.values())
      checkEntitySprite(sprite);

    // Roofs — separate container always above entityLayer, so skip the
    // zIndex test and only do the area-ratio check.
    for (const sprite of this.roofSprites.values()) {
      lerp(sprite, occludes(sprite) ? TARGET_FADED : TARGET_CLEAR);
    }
  }

  /** Create or update a car sprite. Cars Y-sort on the props layer so
   * they walk visually behind tall objects like the player. If the
   * sprite key isn't loaded, fall back to a solid red rectangle so the
   * car is still visible while the user drops in the real art. */
  setCar(
    id: string,
    x: number,
    y: number,
    spriteKey: string,
    tileSize: number,
  ): void {
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    const zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, y);
    const tex = getTexture(spriteKey);
    if (
      process.env.NODE_ENV === "development" &&
      !tex &&
      !this.warnedMissingCarKeys.has(spriteKey)
    ) {
      console.warn(
        `[RenderSystem] car sprite "${spriteKey}" not loaded — falling back to red rect. Check that the pack file exists at /assets/me/${spriteKey.startsWith("me:") ? spriteKey.slice(3) : spriteKey}.png`,
      );
      this.warnedMissingCarKeys.add(spriteKey);
    }
    if (tex) {
      // Drop any leftover fallback rect from before the texture loaded.
      const fallback = this.carFallbacks.get(id);
      if (fallback) {
        this.entityLayer.removeChild(fallback);
        this.carFallbacks.delete(id);
      }
      let sprite = this.carSprites.get(id);
      if (!sprite) {
        sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.5);
        if (this.mapBoundsMask) sprite.mask = this.mapBoundsMask;
        this.entityLayer.addChild(sprite);
        this.carSprites.set(id, sprite);
      } else if (sprite.texture !== tex) {
        sprite.texture = tex;
      }
      sprite.x = x;
      sprite.y = y;
      sprite.zIndex = zIndex;
      return;
    }
    // No texture — show a fallback rect so the system is debuggable
    // without art. Sized at one tile so it doesn't overpower the map.
    let g = this.carFallbacks.get(id);
    if (!g) {
      g = new Graphics();
      g.rect(-tileSize / 2, -tileSize / 2, tileSize, tileSize).fill({
        color: 0xff4444,
      });
      if (this.mapBoundsMask) g.mask = this.mapBoundsMask;
      this.entityLayer.addChild(g);
      this.carFallbacks.set(id, g);
    }
    g.x = x;
    g.y = y;
    g.zIndex = zIndex;
  }

  /** Drop a car's sprite (or fallback) — called when the system despawns
   * a car at the map edge or a dead-end. */
  removeCar(id: string): void {
    const sprite = this.carSprites.get(id);
    if (sprite) {
      this.entityLayer.removeChild(sprite);
      sprite.destroy();
      this.carSprites.delete(id);
    }
    const g = this.carFallbacks.get(id);
    if (g) {
      this.entityLayer.removeChild(g);
      g.destroy();
      this.carFallbacks.delete(id);
    }
  }

  /** Draw debug overlays for the supplied AABB lists. Each entry pairs a
   * world-space box with a color. Called once per frame from PixiApp
   * when the debug toggle is on; the previous frame's drawing is wiped
   * and replaced wholesale to avoid leaking stale boxes. */
  drawDebugCollisions(
    items: Array<{
      box: { left: number; top: number; right: number; bottom: number };
      color: number;
      label?: string;
    }>,
  ): void {
    if (!this.debugCollisionGraphics) {
      this.debugCollisionGraphics = new Graphics();
      // Add ABOVE the entity layer + roof layer so debug rects sit on
      // top of all gameplay sprites.
      this.worldContainer.addChild(this.debugCollisionGraphics);
    }
    const g = this.debugCollisionGraphics;
    g.clear();
    for (const { box, color } of items) {
      const w = box.right - box.left;
      const h = box.bottom - box.top;
      g.rect(box.left, box.top, w, h)
        .stroke({ color, width: 1.5, alpha: 1 })
        .fill({ color, alpha: 0.12 });
    }
  }

  /** Hide debug collision overlay — empties the Graphics instance so no
   * boxes render until `drawDebugCollisions` is called again. */
  clearDebugCollisions(): void {
    if (this.debugCollisionGraphics) this.debugCollisionGraphics.clear();
  }

  /** Wipe all car sprites — called on scene change so cars from the old
   * map don't linger in the new one. */
  clearCars(): void {
    for (const sprite of this.carSprites.values()) {
      this.entityLayer.removeChild(sprite);
      sprite.destroy();
    }
    this.carSprites.clear();
    for (const g of this.carFallbacks.values()) {
      this.entityLayer.removeChild(g);
      g.destroy();
    }
    this.carFallbacks.clear();
  }

  /** Update an NPC sprite's position (for wandering). When the NPC's
   *  spriteKey resolves to a directional set (`<key>-<dir>` exists),
   *  the renderer also swaps the texture based on `facing` and the
   *  walking-frame state. Idle frames are advanced in updateAnimations
   *  so static NPCs animate too. Legacy single-texture NPCs ignore the
   *  directional args and keep their static texture. */
  updateNPC(
    npcId: string,
    x: number,
    y: number,
    facing?: Direction,
    walking?: boolean,
    walkFrame?: 0 | 1,
  ): void {
    const sprite = this.npcSprites.get(npcId);
    if (!sprite) return;
    sprite.x = x;
    sprite.y = y;
    const layers = this.currentMap ? getLayers(this.currentMap) : [];
    sprite.zIndex = getEffectiveZIndex(layers, PLAYER_LAYER_ID, y);
    // Update animation base position so idle bob is relative to new position
    const anim = this.npcAnims.get(npcId);
    if (anim) {
      anim.baseX = x;
      anim.baseY = y;
    }
    // Texture swap — only for NPCs whose spriteKey backs a directional
    // sprite set. We probe `<key>-down` once to decide; if absent, we
    // leave the original (legacy) texture untouched.
    if (!facing) return;
    this.npcMotion.set(npcId, {
      facing,
      walking: walking === true,
      walkFrame: walkFrame ?? 0,
    });
    const npc = this.currentMap?.npcs.find((n) => n.id === npcId);
    if (!npc) return;
    const baseDir = getTexture(`${npc.spriteKey}-${facing}`);
    if (!baseDir) return; // not a directional NPC — leave static texture alone
    // Walking + the ON half of the 2-frame cycle → walk1 sprite. OFF
    // half (or idle) → base directional sprite (same as the player).
    const useWalk = walking === true && walkFrame === 1;
    const tex = useWalk
      ? (getTexture(`${npc.spriteKey}-${facing}-walk1`) ?? baseDir)
      : baseDir;
    sprite.texture = tex;
  }

  /** Swap the texture on a live object sprite. Used when an object's
   * visual depends on game state that changes after the scene mounted
   * (e.g. the computer desk's image swaps when the player buys an
   * upgrade). The spriteKey on the entity itself stays put — only the
   * Pixi texture reference changes. No-op if the entity has no sprite
   * yet (still lazy-loading) or the texture isn't loaded. */
  refreshObjectTexture(entityId: string, spriteKey: string): void {
    const sprite = this.objectSprites.get(entityId);
    if (!sprite) return;
    const tex = getTexture(spriteKey);
    if (!tex) return;
    sprite.texture = tex;
  }

  /** Update idle animations for trees and NPCs. Call once per frame. */
  updateAnimations(time: number): void {
    if (!this.animationsEnabled) return;

    // Tree sway — rotation + slight X offset
    for (const [id, anim] of this.treeAnims) {
      const sprite = this.objectSprites.get(id);
      if (!sprite) continue;
      const t = time * anim.speed + anim.phase;
      sprite.rotation = Math.sin(t) * anim.rotAmount;
      sprite.x = anim.baseX + Math.sin(t * 0.7) * anim.swayAmount;
    }

    // District-arrow bob — pure cosmetic vertical sine. ~2px swing,
    // ~0.5 Hz so it reads as a friendly "tap me" cue rather than a
    // distracting flicker. Independent of the tree anim params.
    const ARROW_SPEED = 3.2; // rad/sec
    const ARROW_AMP = 2; // pixels
    for (const [id, anim] of this.arrowAnims) {
      const sprite = this.objectSprites.get(id);
      if (!sprite) continue;
      sprite.y =
        anim.baseY + Math.sin(time * ARROW_SPEED + anim.phase) * ARROW_AMP;
    }

    // Quest-marker bob — slightly more emphatic than the edge-arrow
    // bob since these are story-critical guidance, not ambient
    // affordances. Larger amp (4 px) and a touch slower (~2.4 rad/s)
    // so the eye reads it as "look here!" rather than "background".
    const Q_SPEED = 2.4;
    const Q_AMP = 4;
    for (const entry of this.questMarkers.values()) {
      const {
        sprite,
        label,
        labelOffset,
        phase,
        followNpcId,
        offsetX,
        offsetY,
      } = entry;
      const bob = Math.sin(time * Q_SPEED + phase) * Q_AMP;
      // For NPC-following markers, recompute the anchor from the
      // NPC sprite each frame so the marker walks with them.
      // Static markers fall back to the create-time `baseY`.
      if (followNpcId) {
        const npc = this.npcSprites.get(followNpcId);
        if (npc) {
          sprite.x = npc.x + offsetX;
          const followBase = npc.y + offsetY;
          sprite.y = followBase + bob;
          if (label) {
            label.x = npc.x + offsetX;
            label.y = followBase - labelOffset + bob;
          }
          continue;
        }
        // NPC sprite missing (mid-scene-swap or eaten by a future
        // ID change) — hide the marker rather than leaving it
        // stuck at its last known position.
        sprite.visible = false;
        if (label) label.visible = false;
        continue;
      }
      sprite.y = entry.baseY + bob;
      if (label) label.y = entry.labelBaseY + bob;
    }

    // Modern Interiors NPC idle texture loop. Static NPCs default to
    // facing down; wandering NPCs keep the last facing reported by
    // NPCWanderSystem.
    for (const npc of this.currentMap?.npcs ?? []) {
      const sprite = this.npcSprites.get(npc.id);
      if (!sprite) continue;
      const motion = this.npcMotion.get(npc.id) ?? {
        facing: "down" as Direction,
        walking: false,
        walkFrame: 0 as 0 | 1,
      };
      if (motion.walking) continue;
      const baseDir = getTexture(`${npc.spriteKey}-${motion.facing}`);
      if (!baseDir) continue;
      const anim = this.npcAnims.get(npc.id);
      const phase = anim?.phase ?? 0;
      const frame =
        Math.floor((time + phase) / IDLE_FRAME_DURATION) % IDLE_FRAME_COUNT;
      const tex =
        getTexture(`${npc.spriteKey}-${motion.facing}-idle${frame + 1}`) ??
        baseDir;
      sprite.texture = tex;
    }

    // NPC idle bob — disabled temporarily
    // for (const [id, anim] of this.npcAnims) {
    //   const sprite = this.npcSprites.get(id);
    //   if (!sprite) continue;
    //   const t = time * anim.speed + anim.phase;
    //   sprite.y = anim.baseY + Math.sin(t) * anim.swayAmount;
    // }
  }

  /** Replace the active quest-marker set. Each marker is a 16×16
   *  bobbing sprite anchored at world (`x`, `y`) using the given
   *  sprite key (any registered sprite — typically `edge-arrow-south`
   *  pointing at the building below). Existing markers are torn
   *  down before new ones go up so the React layer can call this
   *  liberally with idempotent results. */
  /** Generation counter so an in-flight `loadAssets` callback for
   *  a stale marker set doesn't apply over a newer call's results. */
  private markerGen = 0;

  setQuestMarkers(
    markers: Array<{
      id: string;
      x: number;
      y: number;
      spriteKey: string;
      /** Optional caption rendered above the bobbing arrow. World-
       *  space text rides the same camera transform as the sprite,
       *  so it scales with the player's zoom and stays anchored to
       *  the building beneath. Skipped when omitted — most
       *  ambient-cue markers (doormats, edge arrows) don't need
       *  labels and adding noise to the world hurts more than it
       *  helps. Reserved for story-critical "go HERE" beats. */
      label?: string;
      /** When set, the marker tracks the NPC sprite with this id.
       *  The supplied (x, y) is interpreted as an OFFSET from the
       *  NPC's anchor — `(0, -28)` parks the marker ~28 px above
       *  the NPC's head and the marker re-anchors there every
       *  frame as the NPC wanders. Static markers (over buildings,
       *  doormats) leave this undefined and use absolute coords. */
      followNpcId?: string;
    }>,
  ): void {
    if (this.destroyed) return;
    const gen = ++this.markerGen;
    this.clearQuestMarkers();
    const apply = () => {
      if (this.destroyed || this.markerGen !== gen || !this.questMarkerLayer)
        return;
      for (const m of markers) {
        const tex = getTexture(m.spriteKey);
        if (!tex) continue;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 1);
        // For NPC-following markers, treat (m.x, m.y) as offsets
        // from the NPC anchor and seed initial position from the
        // NPC sprite — otherwise the marker flickers at (offsetX,
        // offsetY) for one frame before the bob loop relocates it.
        const followNpcId = m.followNpcId ?? null;
        const followed = followNpcId ? this.npcSprites.get(followNpcId) : null;
        const initX = followed ? followed.x + m.x : m.x;
        const initY = followed ? followed.y + m.y : m.y;
        sprite.x = initX;
        sprite.y = initY;
        // Phase derived from id so two markers don't bob in lockstep.
        let h = 0;
        for (let i = 0; i < m.id.length; i++)
          h = (h * 31 + m.id.charCodeAt(i)) | 0;
        const phase = ((h % 1000) / 1000) * Math.PI * 2;
        this.questMarkerLayer.addChild(sprite);

        // Optional caption. Pixi `Text` is heavy if instantiated
        // every frame, but our marker set is tiny (≤ a handful)
        // and only resets on scene change, so the per-marker cost
        // is negligible. Anchor centered horizontally + bottom so
        // the label's baseline sits just above the arrow tip.
        let label: Text | null = null;
        // Label sits just above the sprite's top edge.
        const labelOffset = tex.height;
        const labelBaseY = initY - labelOffset;
        if (m.label) {
          const labelPreset = getMarkerLabelPreset(getMarkerLabelStyle());
          const labelText =
            labelPreset.textTransform === "uppercase"
              ? m.label.toUpperCase()
              : m.label;
          label = new Text({
            text: labelText,
            resolution: getMarkerLabelTextResolution(),
            roundPixels: true,
            style: {
              fontFamily: labelPreset.fontFamily,
              fontSize: labelPreset.fontSize,
              fontWeight: labelPreset.fontWeight,
              fill: labelPreset.fill,
              stroke: {
                color: labelPreset.strokeColor,
                width: labelPreset.strokeWidth,
                join: "round",
              },
              align: "center",
            },
          });
          label.anchor.set(0.5, 1);
          label.x = initX;
          label.y = labelBaseY;
          this.questMarkerLayer.addChild(label);
        }

        this.questMarkers.set(m.id, {
          sprite,
          label,
          baseY: initY,
          labelOffset,
          labelBaseY,
          phase,
          followNpcId,
          offsetX: m.x,
          offsetY: m.y,
        });
      }
    };
    // Marker sprites typically aren't on the per-scene required-asset
    // list (no entity uses them), so we kick a lazy `loadAssets` and
    // apply once textures resolve. Already-loaded sprites are a free
    // no-op and `apply` runs synchronously via the resolved promise.
    const needed = markers
      .map((m) => m.spriteKey)
      .filter((k) => !getTexture(k));
    if (needed.length === 0) {
      apply();
    } else {
      loadAssets(needed)
        .then(apply)
        .catch(() => {
          /* silent */
        });
    }
  }

  clearQuestMarkers(): void {
    for (const { sprite, label } of this.questMarkers.values()) {
      sprite.destroy();
      label?.destroy();
    }
    this.questMarkers.clear();
  }

  /** Get the world container for attaching overlays (e.g. tap indicators). */
  getWorldContainer(): Container {
    return this.worldContainer;
  }

  /** Get a roof sprite by building ID — for future per-roof behavior. */
  getRoofSprite(buildingId: string): Sprite | undefined {
    return this.roofSprites.get(buildingId);
  }

  /** Total number of sprites currently in the scene graph. */
  getSpriteCount(): number {
    return (
      this.groundLayer.children.length +
      this.entityLayer.children.length +
      this.roofLayer.children.length
    );
  }

  static getRequiredAssets(map: MapData): string[] {
    const keys = new Set<string>();

    // Tile types may be enum strings or pack refs (`me:...`). Both go through
    // the same `loadAssets` path (it routes `me:` keys to the pack loader).
    // Virtual tile types like `floor-pattern` and `wall-brick` aren't real
    // entries in `spriteManifest`; they resolve at render time to one of
    // four quadrant textures based on (row,col) parity. Expand them here so
    // the actual quadrant PNGs land in the load set — without this, a map
    // built entirely from these patterned tiles renders empty cells (no
    // texture in the cache) and the user sees the mapBoundsMask through
    // the entire floor.
    const tileTypes = new Set<string>();
    for (const row of map.tiles) {
      for (const t of row) tileTypes.add(t);
    }
    for (const t of tileTypes) {
      if (t === "floor-pattern") {
        keys.add("floor-tl");
        keys.add("floor-tr");
        keys.add("floor-bl");
        keys.add("floor-br");
      } else if (t === "wall-brick") {
        keys.add("wall-brick-tl");
        keys.add("wall-brick-tr");
        keys.add("wall-brick-bl");
        keys.add("wall-brick-br");
      } else {
        keys.add(t);
      }
    }

    // Object pack-key textures lazy-load via renderObjects so the
    // long tail of decor PNG fetches doesn't block scene mount —
    // EXCEPT objects with a non-zero collision box. Those define
    // walkable space; if the player can hit a tree before its texture
    // arrives, they collide with thin air and the bug is invisible.
    // Sync-loading collidable pack objects costs more PNG fetches up
    // front but the count is far smaller than the full set (typically
    // ~15% of objects have collision; the rest are flat floor decor).
    // Non-pack object spriteKeys (placeholder PNGs in spriteManifest)
    // also stay sync since they're cheap.
    for (const obj of map.objects) {
      const isPackKey = obj.spriteKey.startsWith("me:");
      const hasCollision =
        obj.collisionBox.width > 0 && obj.collisionBox.height > 0;
      if (isPackKey && !hasCollision) continue;
      keys.add(obj.spriteKey);
      // The computer-desk's actual texture at render time is its
      // leveled variant (computer-desk-l0..l3). Queue all four so the
      // initial render finds its texture AND so upgrading mid-scene
      // doesn't have to async-fetch — the refresh call hits a warm
      // cache and the swap is instant.
      if (obj.spriteKey === "computer-desk") {
        keys.add("computer-desk-l0");
        keys.add("computer-desk-l1");
        keys.add("computer-desk-l2");
        keys.add("computer-desk-l3");
      }
    }
    for (const b of map.buildings) {
      keys.add(b.baseSpriteKey);
      if (b.roofSpriteKey) keys.add(b.roofSpriteKey);
    }
    for (const npc of map.npcs) {
      // For Modern-Interiors character NPCs the spriteKey is a prefix
      // (e.g., "me-char-04"); preload all 4 directions × (idle + walk1)
      // so the first turn doesn't flash a missing texture. Legacy NPCs
      // (key matches "npc"/"npc-blue") just need the bare key. Pattern
      // gate keeps `loadAssets` from warning about non-existent
      // `<legacy-key>-down` lookups.
      if (/^me-char-\d{2}$/.test(npc.spriteKey)) {
        for (const dir of ["down", "up", "left", "right"] as const) {
          keys.add(`${npc.spriteKey}-${dir}`);
          keys.add(`${npc.spriteKey}-${dir}-walk1`);
        }
      } else {
        keys.add(npc.spriteKey);
      }
    }

    for (const dir of ["down", "up", "left", "right"]) {
      keys.add(`${PLAYER_SPRITE_PREFIX}-${dir}`);
      keys.add(`${PLAYER_SPRITE_PREFIX}-${dir}-walk1`);
      keys.add(`${PLAYER_SPRITE_PREFIX}-${dir}-walk2`);
    }
    // NOTE: car sprite keys deliberately omitted here. Adding 40
    // pack-single fetches to the blocking `await loadAssets(...)` was
    // adding several seconds to scene boot. Cars use a background
    // preload kicked off after `loadScene` completes (see PixiApp);
    // the few cars that spawn before their textures are ready
    // momentarily render as the red-rect fallback in RenderSystem.

    // Transition tiles
    for (const k of TRANSITION_ASSET_KEYS) keys.add(k);

    return Array.from(keys);
  }

  destroy(): void {
    // Set BEFORE tearing anything down so any in-flight async
    // callback (lazy-loaded pack object, future preload step) bails
    // out at its `if (this.destroyed) return` guard before touching
    // destroyed containers.
    this.destroyed = true;
    // Free the GPU memory backing the static-layer bake — destroying
    // the worldContainer recursively destroys the bake sprite, but the
    // underlying RenderTexture's source isn't freed automatically.
    if (this.bakedStaticTexture) {
      this.bakedStaticTexture.destroy(true);
      this.bakedStaticTexture = null;
    }
    this.worldContainer.destroy({ children: true });
  }
}
