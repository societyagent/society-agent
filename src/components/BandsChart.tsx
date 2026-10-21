import { useMemo, useRef } from 'react'
import { bands, hourLabel, hourToTick, TICKS, type Batch, type ChartMetric } from '@/engine/lab'

/** Distribution chart: the typical town (median) and the middle 80% of towns, per option. Dark for the app, light for printed reports. */
export function BandsChart({ b, axis, metric, hoverTick = null, setHover, colors, light = false }: { b: Batch; axis: [string, string]; metric: ChartMetric; hoverTick?: number | null; setHover?: (t: number | null) => void; colors: string[]; light?: boolean }) {
  const ink = light ? { grid: 'rgba(20,16,10,.10)', text: 'rgba(20,16,10,.55)', zero: 'rgba(20,16,10,.35)', cursor: 'rgba(20,16,10,.4)', tipBg: '#ffffff', tipLine: 'rgba(20,16,10,.18)', tipText: 'rgba(20,16,10,.6)', ring: '#ffffff' } : { grid: 'rgba(255,255,255,.07)', text: 'rgba(255,255,255,.4)', zero: 'rgba(255,255,255,.22)', cursor: 'rgba(255,255,255,.35)', tipBg: '#17130f', tipLine: 'rgba(255,255,255,.12)', tipText: 'rgba(255,255,255,.55)', ring: '#0c0b0a' }
  const W = 880, H = 330, pl = 46, pr = 14, pt = 18, pb = 34
  const data = useMemo(() => b.results.map((rs) => bands(rs, TICKS, metric)), [b, metric])
  const inf = metric === 'informed'
  const show = (v: number) => (inf ? `${Math.round(v * 100)}%` : v.toFixed(2))
  const all = data.flatMap((d) => [...d.lo, ...d.hi]); const lo = Math.min(-0.1, ...all), hi = Math.max(0.1, ...all)
  const y0 = inf ? -0.03 : Math.floor(lo * 10) / 10 - 0.05, y1 = inf ? 1.03 : Math.ceil(hi * 10) / 10 + 0.05
  const X = (t: number) => pl + (t / (TICKS - 1)) * (W - pl - pr), Y = (v: number) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb)
  const line = (v: number[], from = 0) => v.map((p, t) => (t < from ? '' : `${t === from ? 'M' : 'L'}${X(t).toFixed(1)},${Y(p).toFixed(1)}`)).join('')
  const startOf = (i: number) => (i === 0 || b.x.conds[i].kind === 'none' ? 0 : Math.max(0, hourToTick(b.x.conds[i].hour) - 1))
  const band = (d: { lo: number[]; hi: number[] }) => {
    const ts = d.hi.map((v, t) => (Number.isNaN(v) ? -1 : t)).filter((t) => t >= 0)
    if (!ts.length) return ''
    return `${ts.map((t, k) => `${k ? 'L' : 'M'}${X(t).toFixed(1)},${Y(d.hi[t]).toFixed(1)}`).join('')}${[...ts].reverse().map((t) => `L${X(t).toFixed(1)},${Y(d.lo[t]).toFixed(1)}`).join('')}Z`
  }
  const ticks = inf ? [0, 0.2, 0.4, 0.6, 0.8, 1] : Array.from({ length: 6 }, (_, i) => y0 + ((y1 - y0) * i) / 5)
  const hours = [8, 12, 16, 20, 24, 28, 31].map((h) => ({ h, t: (h - 7) * 6 })).filter((x) => x.t < TICKS)
  const ref = useRef<SVGSVGElement>(null)
  const move = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(), t = Math.round(((e.clientX - r.left) / r.width * W - pl) / (W - pl - pr) * (TICKS - 1)); setHover?.(Math.max(0, Math.min(TICKS - 1, t))) }
  const clk = (t: number) => `${String((7 + Math.floor(t / 6)) % 24).padStart(2, '0')}:${(t % 6) * 10 || '00'}`
  return <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label={`${inf ? 'Share of the town that has heard the news' : 'Opinion'} over the day for ${b.x.conds.map((c) => c.label).join(', ')}; shaded bands show the middle 80% of ${b.seeds.length} towns`} onPointerMove={setHover ? move : undefined} onPointerLeave={setHover ? () => setHover(null) : undefined}>
    {ticks.map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={ink.grid} /><text x={pl - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={ink.text} fontFamily="DM Mono, monospace">{inf ? `${Math.round(v * 100)}%` : (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}</text></g>)}
    {y0 < 0 && y1 > 0 && <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke={ink.zero} strokeDasharray="3 4" />}
    {hours.map((x) => <text key={x.h} x={X(x.t)} y={H - 10} textAnchor="middle" fontSize="11" fill={ink.text} fontFamily="DM Mono, monospace">{hourLabel(x.h)}</text>)}
    <text x={pl} y={11} fontSize="10.5" fill={ink.text}>{inf ? 'everyone has heard ↑' : `${axis[1].toLowerCase()} ↑`}</text><text x={pl} y={H - 24} fontSize="10.5" fill={ink.text}>{inf ? '↓ nobody has heard' : `↓ ${axis[0].toLowerCase()}`}</text>
    {data.map((d, i) => i === 0 || startOf(i) === 0 ? <path key={`b${i}`} d={band(d)} fill={colors[i]} opacity=".13" /> : <path key={`b${i}`} d={band({ lo: d.lo.map((v, t) => (t < startOf(i) ? NaN : v)), hi: d.hi.map((v, t) => (t < startOf(i) ? NaN : v)) })} fill={colors[i]} opacity=".13" />)}
    {b.x.conds.map((c, i) => c.kind !== 'none' && <line key={`m${i}`} x1={X(hourToTick(c.hour))} x2={X(hourToTick(c.hour))} y1={pt} y2={H - pb} stroke={colors[i]} strokeDasharray="2 4" opacity=".5" />)}
    {data.map((d, i) => <path key={`l${i}`} d={line(d.median, startOf(i))} fill="none" stroke={colors[i]} strokeWidth={i === 0 ? 2.8 : 2.4} strokeLinejoin="round" />)}
    {hoverTick !== null && <g><line x1={X(hoverTick)} x2={X(hoverTick)} y1={pt} y2={H - pb} stroke={ink.cursor} />{data.map((d, i) => hoverTick >= startOf(i) && <circle key={i} cx={X(hoverTick)} cy={Y(d.median[hoverTick])} r="4" fill={colors[i]} stroke={ink.ring} strokeWidth="1.5" />)}
      <g transform={`translate(${Math.min(X(hoverTick) + 10, W - 250)},${pt + 4})`}><rect width="240" height={24 + data.length * 17} rx="8" fill={ink.tipBg} stroke={ink.tipLine} /><text x="10" y="16" fontSize="11" fill={ink.tipText} fontFamily="DM Mono, monospace">{clk(hoverTick)}</text>
        {data.map((d, i) => <text key={i} x="10" y={34 + i * 17} fontSize="11.5" fill={colors[i]}>{b.x.conds[i].label}: {show(d.median[hoverTick])}{hoverTick < startOf(i) ? ' (same as baseline)' : ''}</text>)}</g></g>}
  </svg>
}

