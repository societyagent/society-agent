import type { CSSProperties } from 'react'
import { COLS, ROWS, T, spriteBase } from './sprites'

/** A resident's pixel-art face, cut straight out of the town's own sprite sheet so the panel and the map always match. */
export function Portrait({ id, size = 52, color = '#ffb98a' }: { id: number; size?: number; color?: string }) {
  const idx = spriteBase(id) + 1 // standing, facing the viewer
  const col = idx % COLS, row = Math.floor(idx / COLS), k = size / T
  const sheet: CSSProperties = { width: size, height: size, backgroundImage: 'url(/town/tiles.png)', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', backgroundSize: `${COLS * T * k}px ${ROWS * T * k}px`, backgroundPosition: `${-col * T * k}px ${-row * T * k}px` }
  return <span aria-hidden className="relative inline-grid shrink-0 place-items-end overflow-hidden rounded-2xl" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 30%, ${color}55, ${color}14 70%), #14110e`, boxShadow: `inset 0 0 0 1px ${color}66, 0 8px 22px -10px ${color}aa` }}><span style={sheet} /></span>
}
