import { useMemo } from 'react'
import { GRID_H, GRID_W, layoutOf } from '@/engine/world'

const FILL: Record<string, string> = { civic: '#c2573a', food: '#d98a45', market: '#d98a45', school: '#b5473a', health: '#b5473a', home: '#c97a4a' }
/** A flat, static drawing of a street plan. Everything comes from the same layout data the engine uses, so what you preview is the town you get. */
export function MiniMap({ layout, people }: { layout: string; people: number }) {
  const L = useMemo(() => layoutOf(layout), [layout])
  return <svg role="img" aria-label={`Map of the ${L.name}: ${L.places.filter((p) => p.kind !== 'home').map((p) => p.name).join(', ')} and ${L.places.filter((p) => p.kind === 'home').length} homes`} viewBox={`0 0 ${GRID_W} ${GRID_H}`} className="block w-full bg-[#2f4a33]" preserveAspectRatio="xMidYMid slice">
    <rect width={GRID_W} height={GRID_H} fill="#34523a" />
    {Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => L.isRoad(x, y) ? <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill="#3a3d4a" /> : L.cost[y * GRID_W + x] === 1 ? <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill="#6d7185" opacity=".75" /> : null))}
    {L.places.map((p) => p.kind === 'park'
      ? <rect key={p.id} x={p.x} y={p.y} width={p.w} height={p.h} rx={.6} fill="#2b6b3d" stroke="#4e9a63" strokeWidth=".3" />
      : <g key={p.id}><rect x={p.x} y={p.y} width={p.w} height={p.h - 1} rx={.4} fill={FILL[p.kind]} /><rect x={p.x} y={p.y + p.h - 1} width={p.w} height={1} fill="#d9d2c0" /><rect x={p.x + Math.floor(p.w / 2)} y={p.y + p.h - 1} width={1} height={1} fill="#5a3b25" /></g>)}
    {L.places.filter((p) => p.kind !== 'home' && p.kind !== 'park').map((p) => <text key={p.id} x={p.x + p.w / 2} y={p.y + (p.h - 1) / 2 + .6} textAnchor="middle" fontSize="1.9" fontWeight="700" fill="#fff" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.55)" strokeWidth=".35">{p.name.replace('Town ', '').replace('Corner ', '').replace('Riverside ', '')}</text>)}
    <text x={GRID_W - .8} y={GRID_H - .8} textAnchor="end" fontSize="1.6" fill="rgba(255,255,255,.7)">{people} residents</text>
  </svg>
}
