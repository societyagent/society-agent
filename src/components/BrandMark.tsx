export function BrandMark({ size = 34 }: { size?: number; dark?: boolean }) {
  return <img src="/brand/society-mark.jpg" alt="Society Agent" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.24)), display: 'block' }} />
}

export function Wordmark({ size = 30, text = 22, beta: _beta = false, dark: _dark = true }: { size?: number; text?: number; beta?: boolean; dark?: boolean }) {
  return <span className="flex items-center gap-2.5" style={{ color: '#fff' }}><BrandMark size={size} /><span className="wordmark" style={{ fontSize: text }}>society agent</span></span>
}
