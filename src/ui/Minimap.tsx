'use client';

import { useRef, useEffect, useCallback } from 'react';
import { MapData, TileType, GameState } from '../core/types';

const TILE_COLORS: Record<string, string> = {
  [TileType.GRASS]: '#4a8c3f',
  [TileType.PATH]: '#c4a35a',
  [TileType.WATER]: '#3068a8',
  [TileType.BRIDGE]: '#8b6f47',
  [TileType.WALL]: '#555566',
  [TileType.FLOOR]: '#c9a96e',
};

interface MinimapProps {
  mapData: MapData;
  gameState: GameState;
  onClose: () => void;
}

export default function Minimap({ mapData, gameState, onClose }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 100, 600);
    const scale = maxSize / Math.max(mapData.width, mapData.height);
    const w = Math.floor(mapData.width * scale);
    const h = Math.floor(mapData.height * scale);

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw tiles
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tile = mapData.tiles[row][col];
        ctx.fillStyle = TILE_COLORS[tile] || '#000000';
        ctx.fillRect(
          Math.floor(col * scale),
          Math.floor(row * scale),
          Math.ceil(scale),
          Math.ceil(scale),
        );
      }
    }

    const T = mapData.tileSize;

    // Draw objects (trees = dark green, rocks = gray)
    for (const obj of mapData.objects) {
      const px = (obj.x / T) * scale;
      const py = (obj.y / T) * scale;
      if (obj.spriteKey === 'tree') {
        ctx.fillStyle = '#2d5a1e';
        ctx.fillRect(px - scale * 0.5, py - scale * 0.8, scale, scale * 0.8);
      } else if (obj.spriteKey === 'rock') {
        ctx.fillStyle = '#777788';
        ctx.fillRect(px - scale * 0.3, py - scale * 0.3, scale * 0.6, scale * 0.6);
      }
    }

    // Draw buildings
    for (const b of mapData.buildings) {
      const bx = (b.x / T) * scale;
      const by = (b.y / T) * scale;
      let color = '#a0785a';
      if (b.baseSpriteKey.includes('cafe')) color = '#c07050';
      else if (b.baseSpriteKey.includes('restaurant')) color = '#904040';
      else if (b.baseSpriteKey.includes('bookstore')) color = '#3a6a2a';
      else if (b.baseSpriteKey.includes('market')) color = '#b09050';
      else if (b.baseSpriteKey.includes('bakery')) color = '#c08050';
      else if (b.baseSpriteKey.includes('inn')) color = '#7a6040';
      else if (b.baseSpriteKey.includes('blacksmith')) color = '#555555';
      ctx.fillStyle = color;
      const bw = (-b.collisionBox.offsetX * 2 / T) * scale;
      const bh = (-b.collisionBox.offsetY / T) * scale;
      ctx.fillRect(bx - bw / 2, by - bh, bw, bh);
    }

    // Draw NPCs
    for (const npc of mapData.npcs) {
      const nx = (npc.x / T) * scale;
      const ny = (npc.y / T) * scale;
      ctx.fillStyle = '#c44a4a';
      ctx.fillRect(nx - scale * 0.3, ny - scale * 0.5, scale * 0.6, scale * 0.5);
    }

    // Draw player
    const px = (gameState.player.x / T) * scale;
    const py = (gameState.player.y / T) * scale;
    ctx.fillStyle = '#3a7bd5';
    ctx.beginPath();
    ctx.arc(px, py, scale * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Player outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, scale * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // Draw camera viewport rectangle
    const cam = gameState.camera;
    const zoom = 1; // minimap shows world positions
    const vpW = (640 / T / zoom) * scale;
    const vpH = (480 / T / zoom) * scale;
    const vpX = (cam.x / T) * scale;
    const vpY = (cam.y / T) * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }, [mapData, gameState]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-3 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', borderRadius: 8, border: '2px solid rgba(255,255,255,0.3)' }}
        />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/70 max-w-[480px]">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#3a7bd5]" /> You</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#a0785a]" /> House</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#c07050]" /> Cafe</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#904040]" /> Restaurant</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#3a6a2a]" /> Bookstore</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#b09050]" /> Market</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#c08050]" /> Bakery</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#7a6040]" /> Inn</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#555555]" /> Blacksmith</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#c44a4a]" /> NPC</span>
        </div>
        <button
          onClick={onClose}
          className="mt-1 px-4 py-1.5 rounded bg-white/20 text-white text-sm hover:bg-white/30 transition"
        >
          Close Map
        </button>
      </div>
    </div>
  );
}
