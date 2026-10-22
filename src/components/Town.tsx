import { useEffect, useRef } from 'react'
import { GRID_H, GRID_W, layoutOf, type Agent, type Layout, type Place, type PlaceKind } from '@/engine/world'
import { COLS, T, hourOf, spriteBase } from './sprites'

/**
 * 2D town renderer. Art: Kenney "RPG Urban Pack" (CC0, kenney.nl), 16px tiles from /town/tiles.png.
 * The static map (ground, roads, buildings, park, props) is drawn once per size and layout. Everything that moves or changes with
 * the time of day (light, lamps, clouds, birds, residents, labels) is layered on top. It is purely cosmetic: nothing here reads or writes simulation state.
 */
const GRASS = 28, GRASS_VAR = [5, 6, 32, 33], SIDEWALK = 36, ASPHALT = 441
const BUSH = [238], TREE = [259, 260, 286, 287], AUTUMN = [340, 341]
const WIN = [363, 364], DOOR = 366
const LAMP = 168, PROPS = [304, 279, 278] // mailbox, bin, hydrant
const ROOF = {
  red: { top: [17, 18, 19], mid: [71, 72, 73], bot: [98, 99, 100] },
  orange: { top: [125, 126, 127], mid: [179, 180, 181], bot: [206, 207, 208] },
} as const
const ROOF_OF: Record<PlaceKind, 'red' | 'orange'> = { civic: 'red', food: 'orange', market: 'orange', school: 'red', health: 'red', home: 'orange', park: 'orange' }
const ICON: Partial<Record<PlaceKind, string>> = { civic: '🏛', food: '☕', market: '🛒', school: '🎓', health: '✚' }
const ACCENT: Record<PlaceKind, string> = { civic: '#e9b44c', food: '#ff9a62', market: '#7ed39a', school: '#6fb0ff', health: '#ff7a8a', home: '#ffffff', park: '#7ed39a' }

export interface TownProps {
  agents: Agent[]
  selected: number | null
  mode: 'opinion' | 'informed'
  onSelect: (id: number | null) => void
  tick: number
  layout?: string
}

function opinionColor(a: Agent, mode: 'opinion' | 'informed'): string {
  if (!a.informed) return '#7c8499'
  if (mode === 'informed') return '#ffb98a'
  const v = Math.max(-1, Math.min(1, a.opinion))
  if (v >= 0) return `rgb(${Math.round(120 + 119 * v)},${Math.round(200 - 110 * v)},${Math.round(150 - 70 * v)})`
  return `rgb(${Math.round(120 + 50 * v)},${Math.round(200 + 30 * v)},${Math.round(150 - 90 * v)})`
}
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) >>> 0 }

/** Colour wash for the hour: [hour, r, g, b, alpha]. Dawn is rose, noon is clear, dusk is amber then violet, night is deep blue. */
const KEYS: [number, number, number, number, number][] = [
  [0, 10, 14, 54, 0.42], [5, 12, 16, 58, 0.4], [6.5, 255, 146, 92, 0.24], [8, 255, 190, 124, 0.1], [10, 255, 255, 255, 0],
  [16, 255, 255, 255, 0], [17.2, 255, 168, 88, 0.17], [18.4, 255, 128, 70, 0.27], [19.4, 214, 84, 86, 0.28], [20.6, 40, 34, 108, 0.32], [22, 10, 14, 54, 0.4], [24, 10, 14, 54, 0.42],
]
function tintAt(h: number): [number, number, number, number] {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1]
    if (h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t] }
  }
  return [10, 14, 54, 0.42]
}
/** 0 in daylight, 1 once it is properly dark. Lamps and windows follow it. */
const lightsOn = (h: number) => (h >= 17.8 ? Math.min(1, (h - 17.8) / 1.7) : h < 7.2 ? Math.min(1, (7.2 - h) / 1.4) : 0)

interface Built { canvas: HTMLCanvasElement; lamps: { x: number; y: number }[]; windows: { x: number; y: number; lit: boolean }[] }

function buildStatic(img: HTMLImageElement, cell: number, L: Layout): Built {
  const c = document.createElement('canvas'); c.width = Math.ceil(GRID_W * cell); c.height = Math.ceil(GRID_H * cell)
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
  const g = L.cost, isRoad = L.isRoad, PLACES = L.places, u = cell / 16
  const park = PLACES.find((p) => p.kind === 'park')!
  const inRect = (p: Place, x: number, y: number) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h
  const inBuilding = (x: number, y: number) => PLACES.some((p) => p.kind !== 'park' && inRect(p, x, y))
  const road = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && isRoad(x, y)
  const side = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !isRoad(x, y) && g[y * GRID_W + x] === 1 && !inRect(park, x, y)
  const tile = (i: number, x: number, y: number, size = cell) => ctx.drawImage(img, (i % COLS) * T, Math.floor(i / COLS) * T, T, T, Math.round(x), Math.round(y), Math.ceil(size), Math.ceil(size))

  // ground, with a little variation so large lawns do not read as one flat colour
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const h = hash(x, y)
    tile(isRoad(x, y) ? ASPHALT : side(x, y) ? SIDEWALK : h % 7 === 0 ? GRASS_VAR[h % GRASS_VAR.length] : GRASS, x * cell, y * cell)
  }
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (road(x, y) || side(x, y)) continue
    const patch = hash(Math.floor(x / 3) + 500, Math.floor(y / 3) + 900) % 6, h = hash(x * 3 + 1, y * 7 + 2)
    if (patch === 0) { ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(x * cell, y * cell, cell, cell) } else if (patch === 1) { ctx.fillStyle = 'rgba(0,48,24,.08)'; ctx.fillRect(x * cell, y * cell, cell, cell) }
    if (h % 4 === 0) { ctx.fillStyle = 'rgba(20,84,50,.5)'; ctx.fillRect(x * cell + ((h >> 4) & 15) * u * 0.85, y * cell + ((h >> 8) & 15) * u * 0.85, 1.4 * u, 2.4 * u) }
    if (h % 31 === 0) { ctx.fillStyle = ['#fff1a8', '#ffffff', '#ffb3c6'][h % 3]; ctx.fillRect(x * cell + ((h >> 5) & 11) * u + 2 * u, y * cell + ((h >> 9) & 11) * u + 2 * u, 1.6 * u, 1.6 * u) }
  }
  // large-scale ground structure: soft, wide lights and shades in the same green family (low frequency, so a lawn has regions, not just noise)
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (road(x, y) || side(x, y) || inBuilding(x, y) || inRect(park, x, y)) continue
    const big = hash(Math.floor(x / 4) + 71, Math.floor(y / 4) + 33) % 7, X = x * cell, Y = y * cell, r = cell * 3.4
    if (big > 1) continue
    const gr = ctx.createRadialGradient(X + cell / 2, Y + cell / 2, 0, X + cell / 2, Y + cell / 2, r)
    if (big === 0) { gr.addColorStop(0, 'rgba(214,255,176,.075)'); gr.addColorStop(1, 'rgba(214,255,176,0)') } else { gr.addColorStop(0, 'rgba(0,56,34,.09)'); gr.addColorStop(1, 'rgba(0,56,34,0)') }
    ctx.fillStyle = gr; ctx.fillRect(X - r, Y - r, r * 2, r * 2)
  }
  // kerbs: a dark line on the road side and a pale one just inside the pavement
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (!side(x, y)) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!road(x + dx, y + dy)) continue
      const k = 1.3 * u, X = x * cell, Y = y * cell
      ctx.fillStyle = 'rgba(14,18,30,.5)'; ctx.fillRect(dx === 1 ? X + cell - k : X, dy === 1 ? Y + cell - k : Y, dx ? k : cell, dy ? k : cell)
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(dx === 1 ? X + cell - 2 * k : dx === -1 ? X + k : X, dy === 1 ? Y + cell - 2 * k : dy === -1 ? Y + k : Y, dx ? k * 0.8 : cell, dy ? k * 0.8 : cell)
    }
  }
  // lane markings
  ctx.fillStyle = 'rgba(226,229,245,0.85)'
  const dash = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
  const lw = Math.max(1, cell * 0.12)
  const onV = (x: number) => L.vRoads.some((c2) => x === c2 || x === c2 + 1), onH = (y: number) => L.hRoads.some((r) => y === r || y === r + 1)
  for (const ry of L.hRoads) for (let x = 0; x < GRID_W; x++) if (x % 2 === 0 && !onV(x)) dash((x + 0.15) * cell, (ry + 1) * cell - lw / 2, cell * 0.7, lw)
  for (const rx of L.vRoads) for (let y = 0; y < GRID_H; y++) if (y % 2 === 0 && !onH(y)) dash((rx + 1) * cell - lw / 2, (y + 0.15) * cell, lw, cell * 0.7)
  // zebra crossings on every arm of every junction
  ctx.fillStyle = 'rgba(238,241,252,.78)'
  for (const rx of L.vRoads) for (const ry of L.hRoads) {
    for (const ay of [ry - 1, ry + 2]) if (road(rx, ay) && road(rx + 1, ay)) for (let k = 0; k < 6; k++) ctx.fillRect((rx + 0.14 + k * 0.33) * cell, ay * cell + cell * 0.14, cell * 0.17, cell * 0.72)
    for (const ax of [rx - 1, rx + 2]) if (road(ax, ry) && road(ax, ry + 1)) for (let k = 0; k < 6; k++) ctx.fillRect(ax * cell + cell * 0.14, (ry + 0.14 + k * 0.33) * cell, cell * 0.72, cell * 0.17)
  }

  // park: a cross of paths, two benches, flower beds, trees and bushes
  const py = park.y + Math.floor(park.h / 2), px = park.x + Math.floor(park.w / 2)
  const inner = (x: number, y: number) => x > park.x && x < park.x + park.w - 1 && y > park.y && y < park.y + park.h - 1
  const keep = new Set<string>()
  const benchSpots: [number, number][] = [[park.x + 1 + Math.floor((park.w - 2) * 0.22), py - 1], [park.x + 1 + Math.floor((park.w - 2) * 0.66), py + 1]]
  for (let x = park.x + 1; x < park.x + park.w - 1; x++) keep.add(`${x},${py}`)
  for (let y = park.y + 1; y < park.y + park.h - 1; y++) keep.add(`${px},${y}`)
  for (const [bx, by] of benchSpots) { keep.add(`${bx},${by}`); keep.add(`${bx + 1},${by}`) }
  for (let y = park.y; y < park.y + park.h; y++) for (let x = park.x; x < park.x + park.w; x++) if (inner(x, y) && keep.has(`${x},${y}`) && (x === px || y === py)) { tile(SIDEWALK, x * cell, y * cell); ctx.fillStyle = 'rgba(214,176,120,.38)'; ctx.fillRect(x * cell, y * cell, cell, cell) }
  const bench = (x: number, y: number) => {
    const X = x * cell, Y = y * cell + cell * 0.22
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(X + u, Y + cell * 0.66, 2 * cell - 2 * u, 2.6 * u)
    ctx.fillStyle = '#5b3d29'; ctx.fillRect(X + 1.5 * u, Y + cell * 0.22, 2 * cell - 3 * u, cell * 0.14)
    ctx.fillStyle = '#b07a4f'; ctx.fillRect(X + 1.5 * u, Y + cell * 0.38, 2 * cell - 3 * u, cell * 0.2)
    ctx.fillStyle = '#2e2018'; ctx.fillRect(X + 2.5 * u, Y + cell * 0.58, 1.6 * u, cell * 0.2); ctx.fillRect(X + 2 * cell - 4.1 * u, Y + cell * 0.58, 1.6 * u, cell * 0.2)
  }
  for (const [bx, by] of benchSpots) bench(bx, by)
  const beds: [number, number][] = [[park.x + 2, park.y + 1], [park.x + park.w - 3, park.y + park.h - 2]]
  for (const [bx, by] of beds) if (inner(bx, by) && !keep.has(`${bx},${by}`)) {
    keep.add(`${bx},${by}`)
    ctx.fillStyle = '#5e3e28'; ctx.beginPath(); ctx.roundRect(bx * cell + 1.5 * u, by * cell + 3 * u, cell - 3 * u, cell - 5 * u, 3 * u); ctx.fill()
    for (let k = 0; k < 9; k++) { const h = hash(bx * 13 + k, by * 7 + k * 3); ctx.fillStyle = ['#ff7a8a', '#ffd166', '#ffffff', '#b794f6'][h % 4]; ctx.fillRect(bx * cell + 3 * u + (h % 9) * 1.1 * u, by * cell + 4 * u + ((h >> 5) % 6) * 1.2 * u, 1.8 * u, 1.8 * u) }
  }
  for (let y = park.y; y < park.y + park.h; y++) for (let x = park.x; x < park.x + park.w; x++) {
    const edge = x === park.x || y === park.y || x === park.x + park.w - 1 || y === park.y + park.h - 1
    const h = hash(x + 91, y + 13)
    if (edge && h % 3 !== 0) tile(BUSH[h % BUSH.length], x * cell, y * cell)
    else if (!edge && !keep.has(`${x},${y}`) && h % 2 === 0 && (x + y) % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse((x + 0.5) * cell, (y + 0.92) * cell, cell * 0.42, cell * 0.14, 0, 0, Math.PI * 2); ctx.fill()
      tile(h % 8 === 0 ? AUTUMN[h % AUTUMN.length] : TREE[h % TREE.length], x * cell, y * cell)
    }
  }

  // buildings: roof block, facade row (door in the middle), shadows, lit windows at night, a sign in the accent colour of the place
  const windows: { x: number; y: number; lit: boolean }[] = []
  for (const p of PLACES) {
    if (p.kind === 'park') continue
    const set = ROOF[ROOF_OF[p.kind] === 'orange' && p.kind === 'home' && PLACES.indexOf(p) % 2 === 0 ? 'red' : ROOF_OF[p.kind]]
    const rows = p.h - 1
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(p.x * cell, (p.y + p.h) * cell, p.w * cell, cell * 0.3); ctx.fillRect((p.x + p.w) * cell, (p.y + 0.5) * cell, cell * 0.3, (p.h - 0.2) * cell)
    for (let r = 0; r < rows; r++) {
      const band = r === 0 ? set.top : r === rows - 1 && rows > 1 ? set.bot : set.mid
      for (let k = 0; k < p.w; k++) tile(band[k === 0 ? 0 : k === p.w - 1 ? 2 : 1], (p.x + k) * cell, (p.y + r) * cell)
    }
    // depth: a lit top edge and a shaded eave on the roof block, a ridge line, and a chimney or skylight, so a roof reads as a roof, not a colour patch
    {
      const rx = p.x * cell, ry = p.y * cell, rw = p.w * cell, rh = rows * cell, hh = hash(p.x * 7 + 3, p.y * 11 + 5)
      const lg = ctx.createLinearGradient(0, ry, 0, ry + rh); lg.addColorStop(0, 'rgba(255,244,224,.22)'); lg.addColorStop(0.18, 'rgba(255,244,224,0)'); lg.addColorStop(0.78, 'rgba(20,8,10,0)'); lg.addColorStop(1, 'rgba(20,8,10,.3)')
      ctx.fillStyle = lg; ctx.fillRect(rx, ry, rw, rh)
      ctx.fillStyle = 'rgba(255,248,232,.34)'; ctx.fillRect(rx, ry, rw, Math.max(1, u * 0.9))
      ctx.fillStyle = 'rgba(30,12,12,.34)'; ctx.fillRect(rx, ry + rh - Math.max(1.5, u * 1.4), rw, Math.max(1.5, u * 1.4))
      if (rows > 1 && p.w > 2) { ctx.fillStyle = 'rgba(30,12,12,.16)'; ctx.fillRect(rx + u, ry + rh * 0.5 - u * 0.3, rw - 2 * u, Math.max(1, u * 0.7)) }
      const big = p.w >= 5, k = big ? 1.5 : 1.25, cx0 = rx + rw * (0.18 + 0.64 * ((hh % 5) / 4)), cy0 = ry + rh * (big ? 0.2 : 0.14)
      if (p.kind === 'home' || p.kind === 'food') {
        // chimney: a brick stack with a dark cap and a soft shadow on the roof
        const w = u * 3.6 * k, h = u * 4.6 * k
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(cx0 + u * 1.1, cy0 + h * 0.62, w, u * 1.6)
        ctx.fillStyle = '#7a4a3a'; ctx.fillRect(cx0, cy0, w, h)
        ctx.fillStyle = '#9b6a58'; ctx.fillRect(cx0, cy0, u * 0.9, h)
        ctx.fillStyle = 'rgba(40,20,16,.55)'; for (let r2 = 1; r2 < 3; r2++) ctx.fillRect(cx0, cy0 + (h / 3) * r2, w, Math.max(1, u * 0.5))
        ctx.fillStyle = '#2a1a16'; ctx.fillRect(cx0 - u * 0.5, cy0 - u * 1.2 * k, w + u, u * 1.4 * k)
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(cx0 - u * 0.5, cy0 - u * 1.2 * k, w + u, Math.max(1, u * 0.5))
      } else {
        // skylight: a glass pane in a metal frame with a highlight
        const w = u * 6 * k, h = u * 3.8 * k
        ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fillRect(cx0 + u * 1.1, cy0 + u * 1.4, w, h)
        ctx.fillStyle = '#b4cbdb'; ctx.fillRect(cx0, cy0, w, h)
        const sg = ctx.createLinearGradient(cx0, cy0, cx0 + w, cy0 + h); sg.addColorStop(0, 'rgba(255,255,255,.55)'); sg.addColorStop(0.45, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(cx0, cy0, w, h)
        ctx.strokeStyle = '#46586a'; ctx.lineWidth = Math.max(1, u * 0.8); ctx.strokeRect(cx0, cy0, w, h)
        ctx.beginPath(); ctx.moveTo(cx0 + w / 2, cy0); ctx.lineTo(cx0 + w / 2, cy0 + h); ctx.stroke()
      }
    }
    const fy = (p.y + p.h - 1) * cell, mid = Math.floor(p.w / 2)
    for (let k = 0; k < p.w; k++) { tile(k === mid ? DOOR : WIN[k % 2], (p.x + k) * cell, fy); if (k !== mid) windows.push({ x: (p.x + k) * cell, y: fy, lit: hash(p.x + k, p.y * 7 + 3) % 3 !== 0 }) }
    ctx.fillStyle = 'rgba(255,236,200,.2)'; ctx.fillRect((p.x + mid) * cell + cell * 0.12, (p.y + p.h) * cell, cell * 0.76, cell * 0.42)
    if (p.kind !== 'home') {
      const text = `${ICON[p.kind] ?? ''} ${p.name}`.trim()
      ctx.font = `700 ${Math.max(9, cell * 0.74)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const tw = ctx.measureText(text).width + cell * 0.95, th = cell * 1.15
      const sx = (p.x + p.w / 2) * cell - tw / 2, sy = (p.y + (rows - 1) / 2 + 0.55) * cell
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.roundRect(sx + u, sy - th / 2 + 2 * u, tw, th, cell * 0.32); ctx.fill()
      ctx.fillStyle = 'rgba(14,16,26,0.86)'; ctx.beginPath(); ctx.roundRect(sx, sy - th / 2, tw, th, cell * 0.32); ctx.fill()
      ctx.fillStyle = ACCENT[p.kind]; ctx.fillRect(sx + cell * 0.34, sy - th / 2, tw - cell * 0.68, Math.max(1.5, 1.7 * u))
      ctx.fillStyle = '#f4f5fb'; ctx.fillText(text, (p.x + p.w / 2) * cell, sy + cell * 0.05)
    }
  }

  // street lamps along the pavements and the odd mailbox, bin or hydrant
  const lamps: { x: number; y: number }[] = []
  const nearRoad = (x: number, y: number) => road(x + 1, y) || road(x - 1, y) || road(x, y + 1) || road(x, y - 1)
  for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
    if (!side(x, y) || inBuilding(x, y) || !nearRoad(x, y) || hash(x + 17, y + 29) % 5 !== 0) continue
    if (lamps.some((l) => Math.abs(l.x - x) + Math.abs(l.y - y) < 6)) continue
    lamps.push({ x, y })
  }
  const shown = lamps.length > 14 ? lamps.filter((_, i) => i % 2 === 0) : lamps
  const props: { x: number; y: number; i: number }[] = []
  for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
    if (props.length >= 9 || !side(x, y) || inBuilding(x, y) || !nearRoad(x, y) || hash(x + 71, y + 3) % 17 !== 0) continue
    if (shown.some((l) => Math.abs(l.x - x) + Math.abs(l.y - y) < 3) || props.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) < 5)) continue
    props.push({ x, y, i: PROPS[hash(x, y) % PROPS.length] })
  }
  for (const pr of props) {
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse((pr.x + 0.5) * cell, (pr.y + 0.95) * cell, cell * 0.3, cell * 0.1, 0, 0, Math.PI * 2); ctx.fill()
    tile(pr.i, pr.x * cell + cell * 0.1, pr.y * cell + cell * 0.05, cell * 0.8)
  }
  for (const l of shown) {
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse((l.x + 0.5) * cell, (l.y + 0.96) * cell, cell * 0.34, cell * 0.11, 0, 0, Math.PI * 2); ctx.fill()
    tile(LAMP, (l.x + 0.5) * cell - cell * 0.75, (l.y + 1) * cell - cell * 1.5, cell * 1.5)
  }
  return { canvas: c, lamps: shown, windows }
}

const makeGlow = (cell: number) => {
  const s = Math.ceil(cell * 7), c = document.createElement('canvas'); c.width = c.height = s
  const g = c.getContext('2d')!, gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,212,132,.74)'); gr.addColorStop(0.35, 'rgba(255,186,96,.3)'); gr.addColorStop(1, 'rgba(255,170,80,0)')
  g.fillStyle = gr; g.fillRect(0, 0, s, s); return c
}
const makeVignette = (w: number, h: number) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!, gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.hypot(w, h) / 2)
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(4,5,12,.4)')
  g.fillStyle = gr; g.fillRect(0, 0, w, h); return c
}

type Anim = { pos: Map<number, { x: number; y: number; face: number; step: number }>; raf: number; last: number; informed: Map<number, boolean>; ripples: { x: number; y: number; t: number; c: string }[] }

export function Town({ agents, selected, mode, onSelect, tick, layout }: TownProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const anim = useRef<Anim>({ pos: new Map(), raf: 0, last: 0, informed: new Map(), ripples: [] })
  const live = useRef({ agents, selected, mode, tick, layout })
  const hover = useRef<number | null>(null)
  useEffect(() => { live.current = { agents, selected, mode, tick, layout } })

  useEffect(() => {
    const A = anim.current
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const img = new Image(); let ready = false
    let built: Built | null = null, builtCell = 0, builtLayout = '', glow: HTMLCanvasElement | null = null, vign: HTMLCanvasElement | null = null
    img.onload = () => { ready = true }; img.src = '/town/tiles.png'
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const w = cv.clientWidth
      cv.width = Math.round(w * dpr); cv.height = Math.round((w * GRID_H) / GRID_W * dpr)
      cv.style.height = `${(w * GRID_H) / GRID_W}px`; built = null; vign = null
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(cv)

    const draw = (now: number) => {
      const { agents, selected, mode, tick, layout } = live.current
      const L = layoutOf(layout)
      const cell = cv.width / GRID_W
      const dt = Math.min(0.1, (now - (A.last || now)) / 1000); A.last = now
      ctx.imageSmoothingEnabled = false
      if (!ready) { ctx.fillStyle = '#2f9c82'; ctx.fillRect(0, 0, cv.width, cv.height); A.raf = requestAnimationFrame(draw); return }
      if (!built || builtCell !== cell || builtLayout !== L.id) { built = buildStatic(img, cell, L); builtCell = cell; builtLayout = L.id; glow = makeGlow(cell) }
      if (!vign || vign.width !== cv.width || vign.height !== cv.height) vign = makeVignette(cv.width, cv.height)
      ctx.drawImage(built.canvas, 0, 0)
      const hr = hourOf(tick), lights = lightsOn(hr), sec = now / 1000

      // slow cloud shadows drifting across the town by day
      if (!calm && lights < 0.6) for (let i = 0; i < 3; i++) {
        const span = cv.width + cell * 24, x = ((sec * cell * 0.9 + (i * span) / 3) % span) - cell * 12, y = cv.height * (0.22 + 0.28 * i) + Math.sin(sec * 0.2 + i) * cell
        const rx = cell * (6 + i * 1.5), ry = rx * 0.5
        ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx)
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(10,22,40,${0.075 * (1 - lights)})`); gr.addColorStop(1, 'rgba(10,22,40,0)')
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }

      // gather residents; fan out co-located ones so nobody hides behind another
      const groups = new Map<string, number[]>()
      for (const a of agents) { const k = `${Math.round(a.x)},${Math.round(a.y)}`; const g = groups.get(k) ?? []; g.push(a.id); groups.set(k, g) }
      const sprites: { a: Agent; cx: number; fy: number; moving: boolean }[] = []
      for (const a of agents) {
        const cur = A.pos.get(a.id) ?? { x: a.x, y: a.y, face: 1, step: 0 }
        const k = 1 - Math.pow(0.0006, dt)
        const dx = a.x - cur.x, dy = a.y - cur.y
        const moving = Math.hypot(dx, dy) > 0.06
        if (moving) { cur.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 3) : dy < 0 ? 2 : 1; cur.step += dt * 9 } else cur.step = 0
        cur.x += dx * k; cur.y += dy * k
        A.pos.set(a.id, cur)
        if (A.informed.get(a.id) === false && a.informed && !calm) A.ripples.push({ x: cur.x, y: cur.y, t: now, c: opinionColor(a, mode) })
        A.informed.set(a.id, a.informed)
        const g = groups.get(`${Math.round(a.x)},${Math.round(a.y)}`) ?? [a.id]
        const slot = g.indexOf(a.id) - (g.length - 1) / 2
        sprites.push({ a, cx: (cur.x + 0.5 + slot * 1.05) * cell, fy: (cur.y + 1 + Math.abs(slot) * 0.12) * cell, moving })
      }
      // a ring that spreads from a resident the moment they hear the news
      A.ripples = A.ripples.filter((r) => now - r.t < 1500)
      for (const r of A.ripples) {
        const p = (now - r.t) / 1500
        ctx.strokeStyle = r.c; ctx.globalAlpha = (1 - p) * 0.75; ctx.lineWidth = Math.max(1.5, cell * 0.14 * (1 - p))
        ctx.beginPath(); ctx.ellipse((r.x + 0.5) * cell, (r.y + 0.95) * cell, cell * (0.6 + p * 3.2), cell * (0.22 + p * 1.1), 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
      }

      sprites.sort((m, n) => m.fy - n.fy)
      const bubbles: { a: Agent; cx: number; top: number }[] = []
      const tags: { a: Agent; nm: string; cx: number; fy: number; sel: boolean; hov: boolean }[] = []
      const size = cell * 1.5
      for (const { a, cx, fy, moving } of sprites) {
        const cur = A.pos.get(a.id)!
        const col = cur.face, row = moving ? 1 + (Math.floor(cur.step) % 2) : 0
        const idx = spriteBase(a.id) + row * COLS + col
        const sel = selected === a.id, hov = hover.current === a.id
        if (sel) {
          const r = cell * 2.2, gr = ctx.createRadialGradient(cx, fy - cell * 0.05, 0, cx, fy - cell * 0.05, r)
          gr.addColorStop(0, 'rgba(255,244,214,.3)'); gr.addColorStop(1, 'rgba(255,244,214,0)')
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, fy - cell * 0.05, r, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, fy - cell * 0.05, size * 0.3, size * 0.11, 0, 0, Math.PI * 2); ctx.fill()
        if (a.informed || sel || hov) {
          const pulse = sel && !calm ? 1 + 0.07 * Math.sin(now / 240) : 1
          ctx.strokeStyle = sel ? '#ffffff' : hov && !a.informed ? '#e8ecf8' : opinionColor(a, mode); ctx.lineWidth = Math.max(1.5, cell * (sel ? 0.16 : 0.12))
          ctx.beginPath(); ctx.ellipse(cx, fy - cell * 0.05, size * (sel ? 0.42 : hov ? 0.4 : 0.36) * pulse, size * (sel ? 0.16 : hov ? 0.15 : 0.14) * pulse, 0, 0, Math.PI * 2); ctx.stroke()
        }
        const bob = moving ? Math.abs(Math.sin(cur.step * Math.PI)) * cell * 0.06 : 0
        ctx.drawImage(img, (idx % COLS) * T, Math.floor(idx / COLS) * T, T, T, Math.round(cx - size / 2), Math.round(fy - size - bob), Math.ceil(size), Math.ceil(size))
        ctx.fillStyle = opinionColor(a, mode); ctx.strokeStyle = 'rgba(8,9,14,0.9)'; ctx.lineWidth = Math.max(1, cell * 0.1)
        ctx.beginPath(); ctx.arc(cx, fy - size - cell * 0.15 - bob, cell * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        tags.push({ a, nm: a.name.split(' ')[0], cx, fy, sel, hov })
        if (a.line && tick - a.lineAt <= 1) bubbles.push({ a, cx, top: fy - size - cell * 0.7 })
      }

      // birds in the early and late hours
      if (!calm && lights < 0.5) for (let i = 0; i < 4; i++) {
        const span = cv.width + cell * 10, x = ((sec * cell * (2.2 + i * 0.35) + (i * span) / 4) % span) - cell * 5
        const y = cv.height * (0.1 + 0.2 * (((i * 37) % 5) / 5)) + Math.sin(sec * 2 + i * 1.7) * cell * 0.6, flap = Math.sin(sec * 14 + i * 2)
        ctx.fillStyle = 'rgba(0,0,0,.09)'; ctx.beginPath(); ctx.ellipse(x, y + cell * 3.6, cell * 0.42, cell * 0.14, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(20,22,30,.6)'; ctx.lineWidth = Math.max(1, cell * 0.1)
        ctx.beginPath(); ctx.moveTo(x - cell * 0.45, y - flap * cell * 0.2); ctx.lineTo(x, y + cell * 0.12); ctx.lineTo(x + cell * 0.45, y - flap * cell * 0.2); ctx.stroke()
      }

      // sun-cast shadows of the buildings: they swing from west to east across the day and are longest at dawn and dusk (a cosmetic layer over the static map)
      if (lights < 0.9) {
        const sunT = Math.max(0, Math.min(1, (hr - 6.5) / 12)), dirX = (sunT - 0.5) * 2.6, len = 0.35 + 1.1 * Math.pow(Math.abs(sunT - 0.5) * 2, 1.5), a = 0.2 * (1 - lights)
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#0a1020'
        for (const pl of L.places) {
          if (pl.kind === 'park') continue
          const x0 = pl.x * cell, x1 = (pl.x + pl.w) * cell, y1 = (pl.y + pl.h) * cell, h = pl.h * cell * 0.55, sx = dirX * len * cell * 1.4
          ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1 + sx, y1 + h * len * 0.5); ctx.lineTo(x0 + sx, y1 + h * len * 0.5); ctx.closePath(); ctx.fill()
        }
        ctx.restore()
      }
      // roofs and walls cool and darken after sunset, so the lit windows are the brightest thing in the street
      if (lights > 0.02) {
        ctx.save(); ctx.globalAlpha = 0.34 * lights; ctx.fillStyle = '#0b1230'
        for (const pl of L.places) { if (pl.kind === 'park') continue; ctx.fillRect(pl.x * cell, pl.y * cell, pl.w * cell, (pl.h - 1) * cell) }
        ctx.restore()
      }
      // light of the hour, then windows and lamps that glow once it is dark, then a soft vignette
      const [tr, tg, tb, ta] = tintAt(hr)
      if (ta > 0.005) { ctx.fillStyle = `rgba(${Math.round(tr)},${Math.round(tg)},${Math.round(tb)},${ta})`; ctx.fillRect(0, 0, cv.width, cv.height) }
      if (lights > 0.02 && glow) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'
        for (const w of built.windows) if (w.lit) { ctx.fillStyle = `rgba(255,196,96,${0.55 * lights})`; ctx.fillRect(w.x + cell * 0.2, w.y + cell * 0.22, cell * 0.6, cell * 0.46) }
        // warm pools of light that fall on the road below the windows, so the glow reaches the street instead of stopping at the glass
        for (const pl of L.places) {
          if (pl.kind === 'park') continue
          const flick = 0.92 + 0.08 * Math.sin(sec * 2.3 + pl.x * 1.7)
          const gx = (pl.x + pl.w / 2) * cell, gy = (pl.y + pl.h + 0.7) * cell, rw = pl.w * cell * 0.62
          ctx.save(); ctx.translate(gx, gy); ctx.scale(1, 0.42)
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rw); gr.addColorStop(0, `rgba(255,190,100,${0.26 * lights * flick})`); gr.addColorStop(1, 'rgba(255,170,80,0)')
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rw, 0, Math.PI * 2); ctx.fill(); ctx.restore()
        }
        ctx.globalAlpha = lights
        for (const l of built.lamps) { const lx = (l.x + 0.5) * cell, ly = (l.y + 1) * cell - cell * 1.15; ctx.drawImage(glow, lx - glow.width / 2, ly - glow.height / 2) }
        ctx.restore()
      }
      ctx.drawImage(vign, 0, 0)

      // name tags: little pills, pushed down a row whenever they would collide; the hovered or selected one also shows the role
      ctx.font = `600 ${Math.max(8, cell * 0.58)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      const tagBoxes: { x: number; y: number; w: number; h: number }[] = []
      const th = cell * 0.9, pad = cell * 0.34
      for (const tg of tags.sort((m, n) => (m.sel || m.hov ? 1 : 0) - (n.sel || n.hov ? 1 : 0) || m.cx - n.cx)) {
        const label = tg.sel || tg.hov ? `${tg.nm} · ${tg.a.role}` : tg.nm
        const w = ctx.measureText(label).width + pad * 2 + cell * 0.4
        let y = tg.sel || tg.hov ? tg.fy - size - cell * 1.6 : tg.fy + cell * 0.1, x = tg.cx - w / 2
        if (y < 2) y = tg.fy + cell * 0.1
        for (let k = 0; k < 5; k++) {
          const hit = tagBoxes.find((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + th > q.y)
          if (!hit) break
          // try the free spot to the right of the blocker first when it keeps the pill close to its owner, else drop one line
          if (hit.x + hit.w + 2 + w / 2 - tg.cx < cell * 2.6) x = hit.x + hit.w + 2
          else { y = hit.y + hit.h + 1; x = tg.cx - w / 2 }
        }
        tagBoxes.push({ x, y, w, h: th })
        ctx.fillStyle = tg.sel ? 'rgba(48,38,16,.9)' : 'rgba(12,13,20,.74)'; ctx.beginPath(); ctx.roundRect(x, y, w, th, th / 2); ctx.fill()
        ctx.strokeStyle = tg.sel ? 'rgba(253,230,138,.85)' : 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = opinionColor(tg.a, mode); ctx.beginPath(); ctx.arc(x + pad * 0.9, y + th / 2, cell * 0.17, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = tg.sel ? '#fde68a' : 'rgba(255,255,255,.95)'; ctx.fillText(label, x + pad * 0.9 + cell * 0.38, y + th / 2 + cell * 0.03)
      }

      // speech bubbles: newest few, stacked without overlapping, with a little tail
      const placed: { x: number; y: number; w: number; h: number }[] = []
      ctx.font = `${Math.max(9, cell * 0.62)}px Inter, system-ui, sans-serif`
      const free = (x: number, y: number, w: number, h: number) => y >= 2 && y + h <= cv.height - 2 && !placed.some((q) => x < q.x + q.w + 6 && x + w + 6 > q.x && y < q.y + q.h + 6 && y + h + 6 > q.y)
      for (const { a, cx, top } of bubbles.sort((m, n) => n.a.lineAt - m.a.lineAt).slice(0, 2)) {
        const text = a.line!.length > 38 ? `${a.line!.slice(0, 36)}…` : a.line!
        const w = ctx.measureText(text).width + cell * 1.0, h = cell * 1.3
        const bx = Math.max(2, Math.min(cv.width - w - 2, cx - w / 2))
        let by = NaN
        for (let k = 0; k < 6 && Number.isNaN(by); k++) if (free(bx, top - h - k * (h + 6), w, h)) by = top - h - k * (h + 6)
        if (Number.isNaN(by)) continue
        placed.push({ x: bx, y: by, w, h })
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.roundRect(bx + 1, by + 2, w, h, cell * 0.4); ctx.fill()
        ctx.fillStyle = 'rgba(248,249,255,0.97)'; ctx.strokeStyle = 'rgba(20,22,34,0.55)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(bx, by, w, h, cell * 0.4); ctx.fill(); ctx.stroke()
        if (by + h < top) { ctx.beginPath(); ctx.moveTo(cx - cell * 0.25, by + h - 0.5); ctx.lineTo(cx, Math.min(top + cell * 0.1, by + h + cell * 0.5)); ctx.lineTo(cx + cell * 0.25, by + h - 0.5); ctx.closePath(); ctx.fill() }
        ctx.fillStyle = '#161826'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + cell * 0.5, by + h / 2)
      }
      A.raf = requestAnimationFrame(draw)
    }
    A.raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(A.raf); ro.disconnect() }
  }, [])

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = ref.current!, rect = cv.getBoundingClientRect()
    const cell = rect.width / GRID_W
    const mx = (e.clientX - rect.left) / cell, my = (e.clientY - rect.top) / cell
    let best: { id: number; d: number } | null = null
    for (const a of live.current.agents) {
      const p = anim.current.pos.get(a.id) ?? { x: a.x, y: a.y }
      const d = Math.hypot(p.x + 0.5 - mx, p.y + 0.15 - my)
      if (d < 1.4 && (!best || d < best.d)) best = { id: a.id, d }
    }
    return best ? best.id : null
  }
  const move = (e: React.MouseEvent<HTMLCanvasElement>) => { const id = nearest(e); hover.current = id; ref.current!.style.cursor = id === null ? 'default' : 'pointer' }
  const leave = () => { hover.current = null; if (ref.current) ref.current.style.cursor = 'default' }
  return <canvas ref={ref} onClick={(e) => onSelect(nearest(e))} onMouseMove={move} onMouseLeave={leave} className="block w-full rounded-2xl border border-white/10 shadow-[0_30px_70px_-30px_rgba(0,0,0,.9)] [image-rendering:pixelated]" role="img" aria-label="Live town map with moving residents" />
}
