import { useEffect, useRef } from 'react'
import { GRID_H, GRID_W, layoutOf, type Agent } from '@/engine/world'
import { Town } from './Town'

/**
 * The preview in the dashboard: the very same renderer as the live town (so what you preview is what you get), with the cast standing at home
 * in the morning light. Nothing moves, nothing is clickable, and it never touches simulation state.
 */
const NONE: Agent[] = []
export function MiniMap({ layout, people }: { layout: string; people: number }) {
  const L = layoutOf(layout)
  const homes = useRef<HTMLDivElement>(null)
  useEffect(() => { homes.current?.setAttribute('data-ready', '1') }, [])
  return <div ref={homes} role="img" aria-label={`Map of the ${L.name}: ${L.places.filter((p) => p.kind !== 'home').map((p) => p.name).join(', ')} and ${L.places.filter((p) => p.kind === 'home').length} homes`} className="pointer-events-none relative overflow-hidden rounded-xl" style={{ aspectRatio: `${GRID_W} / ${GRID_H}` }}>
    <Town agents={NONE} selected={null} mode="opinion" onSelect={() => {}} tick={14} layout={layout} />
    <span className="absolute bottom-2 right-2 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-white/80 backdrop-blur">{people} residents</span>
  </div>
}
