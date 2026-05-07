'use client';

/**
 * Modern Interiors palette — pick + drag-stamp for the Room Builder
 * sheets (walls, floors, baseboards). Each sheet renders at its native
 * pixel size with a 16-grid overlay; the player drags a rectangle in
 * the sheet to define a stamp, then drags on the canvas to paint it.
 *
 * Design vs the existing PackPicker (Modern Exteriors singles):
 *   - PackPicker shows ONE asset per thumbnail (file = whole sprite).
 *   - InteriorPicker shows whole sheets where each 16-px CELL is a
 *     selectable sub-tile. A 2-tall wall section needs both cells
 *     selected together as a 1×2 rectangle so it paints as one
 *     visual unit.
 *
 * The stamp lives in editor state as
 * `selectedTileStamp: { sheetId, startCol, startRow, width, height }`.
 * When non-null, the canvas's paint handler stamps the rectangle at
 * the cursor cell instead of painting `selectedTileType` directly.
 */
import { useEffect, useState, useRef } from 'react';
import { EditorAction } from './editorState';
import { loadInteriorSheets } from '../renderer/AssetLoader';

interface InteriorSheet {
  id: string;
  image: string;
  cols: number;
  rows: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
  blocking: boolean;
  label: string;
}

interface Manifest {
  tileSize: number;
  sheets: InteriorSheet[];
}

const SHEET_ID_STORAGE_KEY = 'editor:interior-sheet';

interface Props {
  selectedStamp: {
    sheetId: string;
    startCol: number;
    startRow: number;
    width: number;
    height: number;
  } | null;
  dispatch: React.Dispatch<EditorAction>;
}

export default function InteriorPicker({ selectedStamp, dispatch }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Drag state for selecting a multi-cell stamp inside the sheet.
  // `start` is set on pointerdown; `end` tracks the current pointer
  // cell during the drag. On pointerup we commit a stamp from the
  // bounding box of (start, end). Storing both lets the highlighted
  // rectangle update live while the player is still holding the
  // mouse.
  const [drag, setDrag] = useState<
    | null
    | { start: { col: number; row: number }; end: { col: number; row: number } }
  >(null);
  const sheetContainerRef = useRef<HTMLDivElement | null>(null);

  // Load manifest once, restore last-viewed sheet from localStorage.
  useEffect(() => {
    let cancelled = false;
    void loadInteriorSheets().then((m) => {
      if (cancelled || !m) return;
      setManifest(m);
      const saved = typeof window !== 'undefined' ? localStorage.getItem(SHEET_ID_STORAGE_KEY) : null;
      const initial = saved && m.sheets.some((s) => s.id === saved) ? saved : (m.sheets[0]?.id ?? null);
      setSheetId(initial);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist sheet selection.
  useEffect(() => {
    if (!sheetId || typeof window === 'undefined') return;
    try { localStorage.setItem(SHEET_ID_STORAGE_KEY, sheetId); } catch { /* quota / disabled */ }
  }, [sheetId]);

  if (!manifest) {
    return <div style={{ color: '#888', fontSize: 11, padding: 8 }}>Loading interiors…</div>;
  }
  if (manifest.sheets.length === 0) {
    return <div style={{ color: '#888', fontSize: 11, padding: 8 }}>No sheets in /assets/mi/manifest.json.</div>;
  }

  const sheet = manifest.sheets.find((s) => s.id === sheetId) ?? manifest.sheets[0];
  const tileSize = manifest.tileSize ?? 16;
  // Render sheets at 2× so individual cells are clickable on desktop
  // without zoom — Limezu's 16-px tiles are ~6mm at 1× on a typical
  // monitor. 2× brings them to a fingertip-sized 12mm.
  const SCALE = 2;
  const sheetWidthPx = sheet.cols * tileSize * SCALE;
  const sheetHeightPx = sheet.rows * tileSize * SCALE;

  /** Map a pointer event in sheet-local pixel space to a (col, row).
   *  Clamps to the sheet's bounds so a drag that escapes the image
   *  edge clips to the last valid cell instead of producing
   *  out-of-range coords. */
  function eventToCell(e: React.PointerEvent<HTMLDivElement>): { col: number; row: number } {
    const rect = sheetContainerRef.current?.getBoundingClientRect();
    if (!rect) return { col: 0, row: 0 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.max(0, Math.min(sheet.cols - 1, Math.floor(x / (tileSize * SCALE))));
    const row = Math.max(0, Math.min(sheet.rows - 1, Math.floor(y / (tileSize * SCALE))));
    return { col, row };
  }

  // Bounding box derived from the live drag cells, or from the
  // committed stamp when we're not actively dragging — drives the
  // highlight rectangle drawn over the sheet.
  const highlight = drag
    ? bounds(drag.start, drag.end)
    : selectedStamp && selectedStamp.sheetId === sheet.id
      ? {
          col: selectedStamp.startCol,
          row: selectedStamp.startRow,
          w: selectedStamp.width,
          h: selectedStamp.height,
        }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0 }}>
      {/* Sheet picker */}
      <select
        value={sheet.id}
        onChange={(e) => setSheetId(e.target.value)}
        style={{
          padding: '6px 8px',
          fontSize: 11,
          background: '#2a2a3a',
          color: '#ddd',
          border: '1px solid #444',
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        {manifest.sheets.map((s) => (
          <option key={s.id} value={s.id} style={{ color: 'black' }}>
            {s.label} ({s.cols}×{s.rows})
          </option>
        ))}
      </select>

      <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>
        Click or drag a rectangle to pick a stamp. Walls are 2 cells tall — drag to grab the whole piece.
      </div>

      {/* The sheet itself, with grid overlay + drag-rectangle highlight.
          touchAction:none so a touch drag selects cells instead of
          scrolling the parent panel. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#0f0f1a', padding: 4 }}>
        <div
          ref={sheetContainerRef}
          style={{
            position: 'relative',
            width: sheetWidthPx,
            height: sheetHeightPx,
            backgroundImage: `url(${sheet.image})`,
            backgroundSize: `${sheetWidthPx}px ${sheetHeightPx}px`,
            backgroundRepeat: 'no-repeat',
            // Pixel-perfect upscale — no bilinear smoothing on tiles.
            imageRendering: 'pixelated',
            cursor: 'crosshair',
            userSelect: 'none',
            touchAction: 'none',
            // Subtle checkerboard so transparent cells in the sheet
            // are visible against the dark panel background — without
            // it, empty separator cells look identical to the panel
            // and the player misjudges where tiles actually live.
            backgroundColor: '#1a1a2e',
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
            const cell = eventToCell(e);
            setDrag({ start: cell, end: cell });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const cell = eventToCell(e);
            // Skip the state update when the pointer is still in the
            // same cell as the last frame — avoids re-renders for
            // every sub-pixel mouse move.
            if (cell.col === drag.end.col && cell.row === drag.end.row) return;
            setDrag({ start: drag.start, end: cell });
          }}
          onPointerUp={(e) => {
            if (!drag) return;
            const cell = eventToCell(e);
            const final = bounds(drag.start, cell);
            dispatch({
              type: 'SET_SELECTED_TILE_STAMP',
              stamp: {
                sheetId: sheet.id,
                startCol: final.col,
                startRow: final.row,
                width: final.w,
                height: final.h,
              },
            });
            // Mirror into selectedTileType too so any code path that
            // still reads it (preview text, stale paint sites) sees a
            // valid `mi:` key for the stamp's top-left cell. The
            // canvas's stamp branch wins on actual paint.
            dispatch({
              type: 'SET_SELECTED_TILE',
              tileType: `mi:${sheet.id}/${final.col}_${final.row}`,
            });
            // SET_SELECTED_TILE clears the stamp — re-set it AFTER so
            // both fields are in their intended state.
            dispatch({
              type: 'SET_SELECTED_TILE_STAMP',
              stamp: {
                sheetId: sheet.id,
                startCol: final.col,
                startRow: final.row,
                width: final.w,
                height: final.h,
              },
            });
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {/* Grid overlay — drawn once per cell, lightweight CSS lines.
              Only renders when the sheet is small enough that 16 lines
              don't visually overwhelm the underlying art. */}
          <GridOverlay cols={sheet.cols} rows={sheet.rows} cellPx={tileSize * SCALE} />
          {highlight && (
            <div
              style={{
                position: 'absolute',
                left: highlight.col * tileSize * SCALE,
                top: highlight.row * tileSize * SCALE,
                width: highlight.w * tileSize * SCALE,
                height: highlight.h * tileSize * SCALE,
                border: '2px solid #4488ff',
                background: 'rgba(68, 136, 255, 0.15)',
                pointerEvents: 'none',
                boxShadow: '0 0 0 1px #fff, inset 0 0 0 1px #fff',
              }}
            />
          )}
        </div>
      </div>

      {/* Selected-stamp readout — confirms which cells the next click
          will paint, and shows whether the stamp still applies to the
          currently-shown sheet. */}
      <div style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>
        {selectedStamp
          ? `Stamp: ${selectedStamp.sheetId} ${selectedStamp.width}×${selectedStamp.height} @ (${selectedStamp.startCol}, ${selectedStamp.startRow})`
          : 'No stamp selected.'}
      </div>
    </div>
  );
}

function bounds(a: { col: number; row: number }, b: { col: number; row: number }) {
  const col = Math.min(a.col, b.col);
  const row = Math.min(a.row, b.row);
  const w = Math.abs(a.col - b.col) + 1;
  const h = Math.abs(a.row - b.row) + 1;
  return { col, row, w, h };
}

function GridOverlay({ cols, rows, cellPx }: { cols: number; rows: number; cellPx: number }) {
  // Single SVG so the grid is one DOM node, not cols*rows divs. The
  // overlay is purely visual; pointer events pass through to the
  // sheet container above so drags on the sheet still register.
  return (
    <svg
      width={cols * cellPx}
      height={rows * cellPx}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    >
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <line
          key={`v${i}`}
          x1={i * cellPx}
          y1={0}
          x2={i * cellPx}
          y2={rows * cellPx}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: rows + 1 }).map((_, j) => (
        <line
          key={`h${j}`}
          x1={0}
          y1={j * cellPx}
          x2={cols * cellPx}
          y2={j * cellPx}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
