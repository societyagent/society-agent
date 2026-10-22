/**
 * Every quota and time-to-live in one place. The API enforces these values and the docs print them,
 * so the manual can never drift from the behaviour (tests/docs.test.ts checks the docs read from here).
 */
export const LIMITS = {
  /** A saved run: ticks of 10 simulated minutes (144 = one day). */
  maxTicks: 288,
  maxInterventions: 80,
  maxDecisionsPerRun: 40,
  maxRunsPerOwner: 200,
  sessionTtlSec: 60 * 60 * 24 * 7,
  challengeTtlSec: 300,
  /** Fixed-window rate limits: `limit` calls per `windowSec` seconds. */
  rate: {
    challenge: { limit: 20, windowSec: 300, per: 'network address' },
    verify: { limit: 30, windowSec: 300, per: 'network address' },
    saveRun: { limit: 40, windowSec: 3600, per: 'wallet' },
    saveRunNetwork: { limit: 80, windowSec: 3600, per: 'network address' },
    saveRunGlobal: { limit: 240, windowSec: 3600, per: 'deployment' },
    aiWallet: { limit: 80, windowSec: 3600, per: 'wallet' },
    aiNetwork: { limit: 120, windowSec: 3600, per: 'network address' },
    aiGlobal: { limit: 300, windowSec: 3600, per: 'deployment' },
    agentSimNetwork: { limit: 30, windowSec: 3600, per: 'network address' },
    agentSimGlobal: { limit: 240, windowSec: 3600, per: 'deployment' },
    clientError: { limit: 20, windowSec: 600, per: 'network address' },
  },
  ai: { mindCallsPerRun: 12, residentsPerMindCall: 3, linesPerVoicesCall: 6, historyTurns: 4, memoryItems: 8 },
  agentCompare: { maxSimulatedDays: 60, minTowns: 10, maxTowns: 30 },
  lab: { maxSimulatedDays: 600, minTowns: 10, maxTowns: 200, maxOptions: 4 },
  town: { minResidents: 6, maxResidents: 16 },
} as const
