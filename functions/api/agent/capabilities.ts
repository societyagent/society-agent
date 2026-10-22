import { json, type Ctx } from '../../_lib'

/** Public discovery for agents. It lists only real, non-custodial capabilities. */
export const onRequestGet = async (ctx: Ctx) => {
  const origin = new URL(ctx.request.url).origin
  return json({
    protocol: 'society-agent/v1',
    name: 'Society Agent',
    version: '1.0',
    custody: 'none',
    auth: 'none for simulation; wallet session required only for saved runs and AI',
    openapi: `${origin}/openapi.json`,
    llms: `${origin}/llms.txt`,
    tools: [
      { name: 'simulate_town', mode: 'http', method: 'POST', path: '/api/agent/simulate', description: 'Run a bounded deterministic town simulation without storing it.' },
      { name: 'health', mode: 'http', method: 'GET', path: '/api/health', description: 'Check live service and database availability.' },
    ],
  })
}
