'use client';

import { useEffect, useRef, useState } from 'react';

type Dir = { up: boolean; down: boolean; left: boolean; right: boolean };
const ZERO_DIR: Dir = { up: false, down: false, left: false, right: false };

type Props = {
  onChange: (dir: Dir | null) => void;
};

const PAD_SIZE = 132;
const DEAD_ZONE = 6;
// Octant boundary at 22.5°: anything closer to the axis than tan(22.5°)
// snaps to a single cardinal; everything else snaps to a diagonal pair.
const DIAG_RATIO = 0.414;

/**
 * Touch-anchored virtual d-pad with 8-way input. The first finger that
 * lands inside the widget becomes the anchor; subsequent translation
 * picks one of eight octant directions (4 cardinals + 4 diagonals,
 * 22.5° boundary). Sliding the finger across the pad rolls the
 * direction without the user having to lift.
 *
 * Shape is a circle with 4 cardinal-arrow glyphs inside; the circle
 * is the entire touch zone, so anywhere inside it is a valid press —
 * the arrows are visual hints, not separate buttons.
 *
 * Hidden on coarse-pointer-incapable devices (i.e., desktop) by the
 * mediaquery in `useEffect` below — the keyboard already handles them.
 */
export default function VirtualDPad({ onChange }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastDirRef = useRef<Dir>(ZERO_DIR);
  const [dir, setDir] = useState<Dir>(ZERO_DIR);
  const [visible, setVisible] = useState(false);

  // Show the pad only on touch / coarse-pointer devices. Desktop with a
  // mouse and keyboard doesn't need it (BL-11: "Should hide on
  // desktop") and showing it would just take screen space.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(pointer: coarse)');
    const apply = () => setVisible(mql.matches);
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);

  const emit = (next: Dir | null) => {
    const value = next ?? ZERO_DIR;
    const prev = lastDirRef.current;
    if (
      prev.up === value.up &&
      prev.down === value.down &&
      prev.left === value.left &&
      prev.right === value.right
    ) {
      return;
    }
    lastDirRef.current = value;
    setDir(value);
    onChange(next);
  };

  const computeDir = (dx: number, dy: number): Dir => {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < DEAD_ZONE && ady < DEAD_ZONE) return ZERO_DIR;
    const major = Math.max(adx, ady);
    const minor = Math.min(adx, ady);
    const diagonal = minor / major >= DIAG_RATIO;
    const horiz = diagonal || adx > ady;
    const vert = diagonal || ady >= adx;
    return {
      up: vert && dy < 0,
      down: vert && dy > 0,
      left: horiz && dx < 0,
      right: horiz && dx > 0,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (anchorRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    padRef.current?.setPointerCapture(e.pointerId);
    anchorRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    emit(ZERO_DIR);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const anchor = anchorRef.current;
    if (!anchor || anchor.pointerId !== e.pointerId) return;
    const dx = e.clientX - anchor.x;
    const dy = e.clientY - anchor.y;
    emit(computeDir(dx, dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const anchor = anchorRef.current;
    if (!anchor || anchor.pointerId !== e.pointerId) return;
    if (padRef.current?.hasPointerCapture(e.pointerId)) {
      padRef.current.releasePointerCapture(e.pointerId);
    }
    anchorRef.current = null;
    emit(null);
  };

  if (!visible) return null;

  return (
    <div
      ref={padRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left: 16,
        bottom: 24,
        width: PAD_SIZE,
        height: PAD_SIZE,
        pointerEvents: 'auto',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-label="Movement controls"
    >
      {/* Outer circle — entire surface is the touch zone. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.35)',
          border: '2px solid rgba(255,255,255,0.4)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      />
      <Arrow dir="up"    active={dir.up}    centerX={PAD_SIZE / 2}     y={9} />
      <Arrow dir="down"  active={dir.down}  centerX={PAD_SIZE / 2}     y={PAD_SIZE - 18} />
      <Arrow dir="left"  active={dir.left}  centerX={18}               y={PAD_SIZE / 2 - 9} />
      <Arrow dir="right" active={dir.right} centerX={PAD_SIZE - 9}     y={PAD_SIZE / 2 - 9} />
    </div>
  );
}

function Arrow({ dir, active, centerX, y }: { dir: 'up' | 'down' | 'left' | 'right'; active: boolean; centerX: number; y: number }) {
  const size = 9;
  const color = active ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)';
  const styles: React.CSSProperties = {
    position: 'absolute',
    left: centerX - size,
    top: y,
    width: 0,
    height: 0,
    pointerEvents: 'none',
    filter: active ? 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' : 'none',
  };
  if (dir === 'up') {
    Object.assign(styles, {
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderBottom: `${size}px solid ${color}`,
    });
  } else if (dir === 'down') {
    Object.assign(styles, {
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderTop: `${size}px solid ${color}`,
    });
  } else if (dir === 'left') {
    Object.assign(styles, {
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderRight: `${size}px solid ${color}`,
    });
  } else {
    Object.assign(styles, {
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderLeft: `${size}px solid ${color}`,
    });
  }
  return <div style={styles} />;
}
