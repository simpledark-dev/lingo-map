'use client';

import { useEffect, useRef, useState } from 'react';

type Dir = { up: boolean; down: boolean; left: boolean; right: boolean };
const ZERO_DIR: Dir = { up: false, down: false, left: false, right: false };

type Props = {
  onChange: (dir: Dir | null) => void;
};

const PAD_SIZE = 132;
const ARM = 44;
const DEAD_ZONE = 6;

/**
 * Touch-anchored Game Boy d-pad. The first finger that lands inside the
 * widget becomes the anchor; subsequent translation picks one of four
 * cardinal directions (dominant-axis snap, with a small dead zone so
 * shaky fingers don't flicker between up/right). Sliding the finger
 * across the pad rolls the direction without the user having to lift —
 * that's the "Game Boy d-pad feel" called for in BL-11.
 *
 * Hidden on coarse-pointer-incapable devices (i.e., desktop) by the
 * mediaquery in `useEffect` below — the keyboard already handles them.
 */
export default function VirtualDPad({ onChange }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastDirRef = useRef<Dir>(ZERO_DIR);
  const [active, setActive] = useState<keyof Dir | null>(null);
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
    onChange(next);
    if (!next || (!value.up && !value.down && !value.left && !value.right)) {
      setActive(null);
    } else if (value.up) setActive('up');
    else if (value.down) setActive('down');
    else if (value.left) setActive('left');
    else if (value.right) setActive('right');
  };

  const computeDir = (dx: number, dy: number): Dir => {
    if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return ZERO_DIR;
    if (Math.abs(dx) > Math.abs(dy)) {
      return { up: false, down: false, left: dx < 0, right: dx > 0 };
    }
    return { up: dy < 0, down: dy > 0, left: false, right: false };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (anchorRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    padRef.current?.setPointerCapture(e.pointerId);
    anchorRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    // Pressing the pad with no displacement yet — start with neutral
    // and wait for the user to slide. Without this, a pure tap would
    // emit no direction and feel unresponsive; emit a tiny default
    // would feel worse (player walks on a tap). Stay neutral.
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

  const armColor = (k: keyof Dir) => (active === k ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)');
  const armBorder = 'rgba(0,0,0,0.55)';

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
        opacity: 0.85,
      }}
      aria-label="Movement controls"
    >
      {/* Cross-shaped d-pad: a vertical bar and a horizontal bar, with
          per-arm tinting when that direction is active. */}
      <div
        style={{
          position: 'absolute',
          left: (PAD_SIZE - ARM) / 2,
          top: 0,
          width: ARM,
          height: PAD_SIZE,
          background: `linear-gradient(to bottom, ${armColor('up')} 0%, ${armColor('up')} 50%, ${armColor('down')} 50%, ${armColor('down')} 100%)`,
          border: `2px solid ${armBorder}`,
          borderRadius: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: (PAD_SIZE - ARM) / 2,
          left: 0,
          width: PAD_SIZE,
          height: ARM,
          background: `linear-gradient(to right, ${armColor('left')} 0%, ${armColor('left')} 50%, ${armColor('right')} 50%, ${armColor('right')} 100%)`,
          border: `2px solid ${armBorder}`,
          borderRadius: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}
      />
      {/* Center hub on top of both bars to hide the seam. */}
      <div
        style={{
          position: 'absolute',
          left: (PAD_SIZE - ARM) / 2 + 2,
          top: (PAD_SIZE - ARM) / 2 + 2,
          width: ARM - 4,
          height: ARM - 4,
          background: 'rgba(40,40,40,0.6)',
          borderRadius: 6,
        }}
      />
      {/* Arrow glyphs — tiny chevrons drawn with borders so we don't
          need an extra asset. */}
      <Arrow dir="up"    centerX={PAD_SIZE / 2} y={10} />
      <Arrow dir="down"  centerX={PAD_SIZE / 2} y={PAD_SIZE - 18} />
      <Arrow dir="left"  centerX={16} y={PAD_SIZE / 2 - 4} />
      <Arrow dir="right" centerX={PAD_SIZE - 24} y={PAD_SIZE / 2 - 4} />
    </div>
  );
}

function Arrow({ dir, centerX, y }: { dir: 'up' | 'down' | 'left' | 'right'; centerX: number; y: number }) {
  const size = 8;
  const styles: React.CSSProperties = {
    position: 'absolute',
    left: centerX - size,
    top: y,
    width: 0,
    height: 0,
    pointerEvents: 'none',
  };
  if (dir === 'up') {
    Object.assign(styles, {
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderBottom: `${size}px solid rgba(255,255,255,0.85)`,
    });
  } else if (dir === 'down') {
    Object.assign(styles, {
      borderLeft: `${size}px solid transparent`,
      borderRight: `${size}px solid transparent`,
      borderTop: `${size}px solid rgba(255,255,255,0.85)`,
    });
  } else if (dir === 'left') {
    Object.assign(styles, {
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderRight: `${size}px solid rgba(255,255,255,0.85)`,
    });
  } else {
    Object.assign(styles, {
      borderTop: `${size}px solid transparent`,
      borderBottom: `${size}px solid transparent`,
      borderLeft: `${size}px solid rgba(255,255,255,0.85)`,
    });
  }
  return <div style={styles} />;
}
