/** Sprite-sheet facts shared by the map renderer, the portraits and the HUD (kept apart from components so hot reload stays happy). */
export const T = 16, COLS = 27, ROWS = 18
/** Six character sets, each 3 rows (stand + 2 walk frames) x 4 columns (left, front, back, right). */
export const CHARS = 6
export const spriteBase = (agentId: number) => (agentId % CHARS) * 3 * COLS + 23
/** Clock hour as a float, 0..24. The day starts at 07:00 and a tick is ten minutes. */
export const hourOf = (tick: number) => ((7 * 60 + tick * 10) % 1440) / 60
export type Phase = 'morning' | 'day' | 'evening' | 'night'
export const phaseOf = (tick: number): Phase => { const h = hourOf(tick); return h < 6 || h >= 20 ? 'night' : h < 9 ? 'morning' : h < 17 ? 'day' : 'evening' }
