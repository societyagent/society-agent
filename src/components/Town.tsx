import { useEffect, useRef } from 'react'
import { GRID_H, GRID_W, layoutOf, type Agent, type Layout, type Place, type PlaceKind } from '@/engine/world'

/**
 * 2D town renderer. Art: Kenney "RPG Urban Pack" (CC0, kenney.nl) — 16px tiles from /town/tiles.png.
 * The static map is pre-rendered once per size; residents are animated sprites on top.
 */
const T = 16, COLS = 27
const GRASS = 28, GRASS_VAR = [5, 6, 32, 33], SIDEWALK = 36, ASPHALT = 441
const BUSH = [238], TREE = [259, 260, 286, 287], AUTUMN = [340, 341]
const WIN = [363, 364], DOOR = 366
const ROOF = {
  red: { top: [17, 18, 19], mid: [71, 72, 73], bot: [98, 99, 100] },
  orange: { top: [125, 126, 127], mid: [179, 180, 181], bot: [206, 207, 208] },
} as const
const ROOF_OF: Record<PlaceKind, 'red' | 'orange'> = { civic: 'red', food: 'orange', market: 'orange', school: 'red', health: 'red', home: 'orange', park: 'orange' }
const ICON: Partial<Record<PlaceKind, string>> = { civic: '🏛', food: '☕', market: '🛒', school: '🎓', health: '✚' }
const CHARS = 6 // sprite sets in the sheet; each has 3 rows (stand + 2 walk frames) x 4 columns (left, front, back, right)
const spriteBase = (agentId: number) => (agentId % CHARS) * 3 * COLS + 23

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

function drawTile(ctx: CanvasRenderingContext2D, img: HTMLImageElement, idx: number, dx: number, dy: number, size: number) {
  ctx.drawImage(img, (idx % COLS) * T, Math.floor(idx / COLS) * T, T, T, Math.round(dx), Math.round(dy), Math.ceil(size), Math.ceil(size))
}

function buildStatic(img: HTMLImageElement, cell: number, L: Layout): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.ceil(GRID_W * cell); c.height = Math.ceil(GRID_H * cell)
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
  const g = L.cost, isRoad = L.isRoad, PLACES = L.places
  const park = PLACES.find((p) => p.kind === 'park')!
  const inRect = (p: Place, x: number, y: number) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h
  // ground
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const h = hash(x, y)
    const i = isRoad(x, y) ? ASPHALT : g[y * GRID_W + x] === 1 && !inRect(park, x, y) ? SIDEWALK : h % 7 === 0 ? GRASS_VAR[h % GRASS_VAR.length] : GRASS
    drawTile(ctx, img, i, x * cell, y * cell, cell)
  }
  // lane markings (dashed centre lines) + kerb highlight
  ctx.fillStyle = 'rgba(226,229,245,0.85)'
  const dash = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
  const lw = Math.max(1, cell * 0.12)
  const onV = (x: number) => L.vRoads.some((c) => x === c || x === c + 1), onH = (y: number) => L.hRoads.some((r) => y === r || y === r + 1)
  for (const ry of L.hRoads) for (let x = 0; x < GRID_W; x++) { if (x % 2 === 0 && !onV(x)) dash((x + 0.15) * cell, (ry + 1) * cell - lw / 2, cell * 0.7, lw) }
  for (const rx of L.vRoads) for (let y = 0; y < GRID_H; y++) if (y % 2 === 0 && !onH(y)) dash((rx + 1) * cell - lw / 2, (y + 0.15) * cell, lw, cell * 0.7)
  // park: bushes on the rim, trees inside, a little path
  for (let y = park.y; y < park.y + park.h; y++) for (let x = park.x; x < park.x + park.w; x++) {
    const edge = x === park.x || y === park.y || x === park.x + park.w - 1 || y === park.y + park.h - 1
    const h = hash(x + 91, y + 13)
    if (edge && h % 3 !== 0) drawTile(ctx, img, BUSH[h % BUSH.length], x * cell, y * cell, cell)
    else if (!edge && h % 3 === 0 && (x + y) % 2 === 0) drawTile(ctx, img, h % 8 === 0 ? AUTUMN[h % AUTUMN.length] : TREE[h % TREE.length], x * cell, y * cell, cell)
  }
  // buildings: roof block + facade row (door in the middle)
  for (const p of PLACES) {
    if (p.kind === 'park') continue
    const set = ROOF[ROOF_OF[p.kind] === 'orange' && p.kind === 'home' && PLACES.indexOf(p) % 2 === 0 ? 'red' : ROOF_OF[p.kind]]
    const rows = p.h - 1
    for (let r = 0; r < rows; r++) {
      const band = r === 0 ? set.top : r === rows - 1 && rows > 1 ? set.bot : set.mid
      for (let k = 0; k < p.w; k++) {
        const col = k === 0 ? 0 : k === p.w - 1 ? 2 : 1
        drawTile(ctx, img, band[col], (p.x + k) * cell, (p.y + r) * cell, cell)
      }
    }
    const fy = (p.y + p.h - 1) * cell, mid = Math.floor(p.w / 2)
    for (let k = 0; k < p.w; k++) drawTile(ctx, img, k === mid ? DOOR : WIN[k % 2], (p.x + k) * cell, fy, cell)
    // soft drop shadow under the facade
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(p.x * cell, (p.y + p.h) * cell, p.w * cell, cell * 0.18)
    // sign on the roof
    if (p.kind !== 'home') {
      const text = `${ICON[p.kind] ?? ''} ${p.name}`.trim()
      ctx.font = `700 ${Math.max(9, cell * 0.74)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const tw = ctx.measureText(text).width + cell * 0.9, th = cell * 1.15
      const sx = (p.x + p.w / 2) * cell - tw / 2, sy = (p.y + (rows - 1) / 2 + 0.55) * cell
      ctx.fillStyle = 'rgba(14,16,26,0.82)'; ctx.beginPath(); ctx.roundRect(sx, sy - th / 2, tw, th, cell * 0.3); ctx.fill()
      ctx.fillStyle = '#f4f5fb'; ctx.fillText(text, (p.x + p.w / 2) * cell, sy + cell * 0.04)
    }
  }
  return c
}

export function Town({ agents, selected, mode, onSelect, tick, layout }: TownProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const anim = useRef<{ pos: Map<number, { x: number; y: number; face: number; step: number }>; raf: number; last: number }>({ pos: new Map(), raf: 0, last: 0 })
  const live = useRef({ agents, selected, mode, tick, layout })
  useEffect(() => { live.current = { agents, selected, mode, tick, layout } })

  useEffect(() => {
    const A = anim.current
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const img = new Image(); let ready = false; let stat: HTMLCanvasElement | null = null; let statCell = 0; let statLayout = ''
    img.onload = () => { ready = true }; img.src = '/town/tiles.png'
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const w = cv.clientWidth
      cv.width = Math.round(w * dpr); cv.height = Math.round((w * GRID_H) / GRID_W * dpr)
      cv.style.height = `${(w * GRID_H) / GRID_W}px`; stat = null
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(cv)

    const draw = (now: number) => {
      const { agents, selected, mode, tick, layout } = live.current
      const L = layoutOf(layout)
      const cell = cv.width / GRID_W
      const dt = Math.min(0.1, (now - (A.last || now)) / 1000); A.last = now
      ctx.imageSmoothingEnabled = false
      if (!ready) { ctx.fillStyle = '#3ec7a3'; ctx.fillRect(0, 0, cv.width, cv.height); A.raf = requestAnimationFrame(draw); return }
      if (!stat || statCell !== cell || statLayout !== L.id) { stat = buildStatic(img, cell, L); statCell = cell; statLayout = L.id }
      ctx.drawImage(stat, 0, 0)

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
        const g = groups.get(`${Math.round(a.x)},${Math.round(a.y)}`) ?? [a.id]
        const slot = g.indexOf(a.id) - (g.length - 1) / 2
        sprites.push({ a, cx: (cur.x + 0.5 + slot * 0.8) * cell, fy: (cur.y + 1) * cell, moving })
      }
      sprites.sort((m, n) => m.fy - n.fy)
      const bubbles: { a: Agent; cx: number; top: number }[] = []
      const tags: { nm: string; cx: number; fy: number; sel: boolean }[] = []
      const size = cell * 1.5
      for (const { a, cx, fy, moving } of sprites) {
        const cur = A.pos.get(a.id)!
        const col = cur.face, row = moving ? 1 + (Math.floor(cur.step) % 2) : 0
        const idx = spriteBase(a.id) + row * COLS + col
        const sel = selected === a.id
        // opinion marker: a soft ring on the ground
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx, fy - cell * 0.05, size * 0.3, size * 0.11, 0, 0, Math.PI * 2); ctx.fill()
        if (a.informed || sel) {
          ctx.strokeStyle = sel ? '#ffffff' : opinionColor(a, mode); ctx.lineWidth = Math.max(1.5, cell * (sel ? 0.16 : 0.12))
          ctx.beginPath(); ctx.ellipse(cx, fy - cell * 0.05, size * (sel ? 0.42 : 0.36), size * (sel ? 0.16 : 0.14), 0, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.drawImage(img, (idx % COLS) * T, Math.floor(idx / COLS) * T, T, T, Math.round(cx - size / 2), Math.round(fy - size), Math.ceil(size), Math.ceil(size))
        // status dot above the head
        ctx.fillStyle = opinionColor(a, mode); ctx.strokeStyle = 'rgba(8,9,14,0.9)'; ctx.lineWidth = Math.max(1, cell * 0.1)
        ctx.beginPath(); ctx.arc(cx, fy - size - cell * 0.15, cell * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        tags.push({ nm: a.name.split(' ')[0], cx, fy, sel })
        if (a.line && tick - a.lineAt <= 1) bubbles.push({ a, cx, top: fy - size - cell * 0.7 })
      }

      // name tags: left-to-right, pushed down a row whenever they would collide with an earlier tag
      ctx.font = `700 ${Math.max(8, cell * 0.6)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'; ctx.lineWidth = cell * 0.24
      const tagBoxes: { x: number; y: number; w: number; h: number }[] = []
      const th = cell * 0.78
      for (const tg of tags.sort((m, n) => m.cx - n.cx)) {
        const w = ctx.measureText(tg.nm).width + 4
        let y = tg.fy + cell * 0.08
        for (let k = 0; k < 4; k++) {
          const hit = tagBoxes.find((q) => tg.cx - w / 2 < q.x + q.w && tg.cx + w / 2 > q.x && y < q.y + q.h && y + th > q.y)
          if (!hit) break
          y = hit.y + hit.h + 1
        }
        tagBoxes.push({ x: tg.cx - w / 2, y, w, h: th })
        ctx.strokeStyle = 'rgba(8,9,14,0.92)'; ctx.strokeText(tg.nm, tg.cx, y)
        ctx.fillStyle = tg.sel ? '#fde68a' : 'rgba(255,255,255,0.95)'; ctx.fillText(tg.nm, tg.cx, y)
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
        ctx.fillStyle = 'rgba(248,249,255,0.97)'; ctx.strokeStyle = 'rgba(20,22,34,0.55)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(bx, by, w, h, cell * 0.4); ctx.fill(); ctx.stroke()
        if (by + h < top) { ctx.beginPath(); ctx.moveTo(cx - cell * 0.25, by + h - 0.5); ctx.lineTo(cx, Math.min(top + cell * 0.1, by + h + cell * 0.5)); ctx.lineTo(cx + cell * 0.25, by + h - 0.5); ctx.closePath(); ctx.fill() }
        ctx.fillStyle = '#161826'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + cell * 0.5, by + h / 2)
      }
      // day / night
      const hr = ((7 * 60 + tick * 10) % 1440) / 60
      const night = hr >= 21 || hr < 6 ? 0.34 : hr >= 19 ? 0.16 : hr < 7 ? 0.14 : 0
      if (night) { ctx.fillStyle = `rgba(8,10,40,${night})`; ctx.fillRect(0, 0, cv.width, cv.height) }
      A.raf = requestAnimationFrame(draw)
    }
    A.raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(A.raf); ro.disconnect() }
  }, [])

  const hit = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = ref.current!, rect = cv.getBoundingClientRect()
    const cell = rect.width / GRID_W
    const mx = (e.clientX - rect.left) / cell, my = (e.clientY - rect.top) / cell
    let best: { id: number; d: number } | null = null
    for (const a of live.current.agents) {
      const p = anim.current.pos.get(a.id) ?? { x: a.x, y: a.y }
      const d = Math.hypot(p.x + 0.5 - mx, p.y + 0.15 - my)
      if (d < 1.4 && (!best || d < best.d)) best = { id: a.id, d }
    }
    onSelect(best ? best.id : null)
  }
  return <canvas ref={ref} onClick={hit} className="block w-full cursor-pointer rounded-2xl border border-white/10 [image-rendering:pixelated]" role="img" aria-label="Live town map with moving residents" />
}
