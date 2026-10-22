import { useId } from 'react'

/** A tiny area chart for a stat card: the shape of the day so far, with no axes. */
export function Spark({ values, color, height = 30 }: { values: number[]; color: string; height?: number }) {
  const id = useId()
  if (values.length < 2) return <div aria-hidden className="mt-2" style={{ height }} />
  const step = Math.max(1, Math.ceil(values.length / 64)), v = values.filter((_, i) => i % step === 0 || i === values.length - 1)
  const w = 120, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo < 1e-6 ? 1 : hi - lo
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, height - 3 - ((x - lo) / span) * (height - 8)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return <svg aria-hidden viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="mt-2 block w-full overflow-visible" style={{ height }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
    <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} vectorEffect="non-scaling-stroke" />
  </svg>
}

/** A small progress ring. A finished ring is a full circle with a check mark. */
export function Ring({ pct, size = 28, color = '#ffb98a' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), full = p >= 99.5
  return <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
    <circle cx={size / 2} cy={size / 2} r={r} fill={full ? `${color}22` : 'none'} stroke="rgba(255,255,255,.14)" strokeWidth="3" />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap={full ? 'butt' : 'round'} strokeDasharray={full ? undefined : `${(c * p) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .4s ease' }} />
    {full && <path d={`M${size * 0.3} ${size * 0.52} L${size * 0.45} ${size * 0.66} L${size * 0.72} ${size * 0.36}`} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}
