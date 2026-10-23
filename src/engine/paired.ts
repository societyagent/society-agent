import { cfgFor, ivsOf, seedsFor, TICKS, type Experiment } from './lab'
import { replayRun } from './replay'

/** Two independent replays of one seed, both stopped at the same simulated minute. */
export function pairedAt(x: Experiment, seedIndex: number, option: number, tick: number) {
  if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= x.n || !Number.isInteger(option) || option < 1 || option >= x.conds.length || !Number.isInteger(tick) || tick < 0 || tick >= TICKS) throw new RangeError('Invalid replay position')
  const seed = seedsFor(x.batchSeed, x.n)[seedIndex]
  const view = (i: number) => replayRun(cfgFor(x, seed, x.conds[i]), tick + 1, ivsOf(x.conds[i], x.population))
  return { seed, left: view(0), right: view(option) }
}
