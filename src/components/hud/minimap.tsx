"use client";

import { useRef, useEffect } from "react";
import { useMinimapStore } from "@/stores/useMinimapStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimap canvas dimensions in CSS pixels. */
const MINIMAP_SIZE = 148;

/** Dot sizes in canvas pixels. */
const PLAYER_DOT_RADIUS = 3;
const ZOMBIE_DOT_RADIUS = 1.5;
const SAFEHOUSE_SIZE = 6;

const TWO_PI = Math.PI * 2;

/** Colors */
const COLOR_BG = "#0a0a0f";
const COLOR_BORDER = "#27272a"; // zinc-800
const COLOR_PLAYER = "#22c55e"; // green-500
const COLOR_ZOMBIE = "#ef4444"; // red-500
const COLOR_SAFEHOUSE = "#eab308"; // yellow-500

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Minimap — top-right HUD element showing a bird's-eye view of the map
 * with player position, safehouse marker, and zombie positions.
 *
 * Uses a small HTML5 canvas rendered by React, redrawn when the
 * minimap store updates (~2 Hz). Efficient because it avoids DOM node
 * churn and only runs drawing code at the store's update frequency.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const playerPosition = useMinimapStore((s) => s.playerPosition);
  const zombiePositions = useMinimapStore((s) => s.zombiePositions);
  const safehouseCenter = useMinimapStore((s) => s.safehouseCenter);
  const mapWidth = useMinimapStore((s) => s.mapWidth);
  const mapHeight = useMinimapStore((s) => s.mapHeight);
  const initialised = useMinimapStore((s) => s.initialised);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !initialised || mapWidth === 0 || mapHeight === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("[Minimap] Canvas 2D context unavailable — minimap disabled");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = MINIMAP_SIZE;
    const h = MINIMAP_SIZE;

    // Set canvas resolution for sharp rendering on HiDPI
    const canvasW = Math.round(w * dpr);
    const canvasH = Math.round(h * dpr);
    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW;
      canvas.height = canvasH;
    }

    // Always reset transform to avoid accumulated scale on DPR changes
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Scale factor to fit the map into the minimap
    const scale = Math.min(w / mapWidth, h / mapHeight);
    const offsetX = (w - mapWidth * scale) / 2;
    const offsetY = (h - mapHeight * scale) / 2;

    // --- Clear ---
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, w, h);

    // --- Map outline ---
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, mapWidth * scale, mapHeight * scale);

    // --- Safehouse marker ---
    const sx = offsetX + safehouseCenter.x * scale;
    const sy = offsetY + safehouseCenter.y * scale;
    ctx.fillStyle = COLOR_SAFEHOUSE;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(
      sx - SAFEHOUSE_SIZE / 2,
      sy - SAFEHOUSE_SIZE / 2,
      SAFEHOUSE_SIZE,
      SAFEHOUSE_SIZE,
    );
    ctx.globalAlpha = 1;

    // --- Zombie dots ---
    ctx.fillStyle = COLOR_ZOMBIE;
    for (let i = 0; i < zombiePositions.length; i++) {
      const zx = offsetX + zombiePositions[i].x * scale;
      const zy = offsetY + zombiePositions[i].y * scale;
      ctx.beginPath();
      ctx.arc(zx, zy, ZOMBIE_DOT_RADIUS, 0, TWO_PI);
      ctx.fill();
    }

    // --- Player dot (drawn last so it's always on top) ---
    const px = offsetX + playerPosition.x * scale;
    const py = offsetY + playerPosition.y * scale;
    ctx.fillStyle = COLOR_PLAYER;
    ctx.beginPath();
    ctx.arc(px, py, PLAYER_DOT_RADIUS, 0, TWO_PI);
    ctx.fill();
  }, [
    playerPosition,
    zombiePositions,
    safehouseCenter,
    mapWidth,
    mapHeight,
    initialised,
  ]);

  if (!initialised) return null;

  return (
    <div
      className="absolute top-4 right-4 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80"
      data-testid="hud-minimap"
    >
      <canvas
        ref={canvasRef}
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
        aria-label="Minimap"
      />
    </div>
  );
}
