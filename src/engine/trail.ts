import type { Ev } from './world'

/** The recorded first-hearing chain, not a claim about every later influence. */
export function newsTrail(events: Ev[], resident: number): Ev[] {
  const visited = new Set<number>(), chain: Ev[] = []
  let current: number | undefined = resident
  while (current !== undefined && !visited.has(current)) {
    visited.add(current)
    const first = events.find((e) => e.agent === current && e.type === 'inform')
      ?? events.find((e) => e.agent === current && e.type === 'intervene' && e.text.startsWith('Whispered to '))
    if (!first) break
    chain.unshift(first)
    current = first.type === 'inform' ? first.with : undefined
  }
  return chain
}
