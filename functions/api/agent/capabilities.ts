import { json, type Ctx } from '../../_lib'

/** Public discovery for agents. It lists only real, non-custodial capabilities. */
export const onRequestGet = async (ctx: Ctx) => {
  const origin = new URL(ctx.request.url).origin
  return json({
    protocol: 'society-agent/v1',
    name: 'Society Agent',
    version: '1.0',
    custody: 'none',
    auth: 'none: these tools need no login, key or wallet',
    webAppOnly: 'Saved runs and AI voices exist only in the web app and need a wallet sign-in there. They are not part of these tools.',
    openapi: `${origin}/openapi.json`,
    llms: `${origin}/llms.txt`,
    tools: [
      { name: 'simulate_town', mode: 'http', method: 'POST', path: '/api/agent/simulate', description: 'Run a bounded deterministic town simulation without storing it.' },
      { name: 'compare_options', mode: 'http', method: 'POST', path: '/api/agent/compare', description: 'Compare 2-4 interventions in the same random towns with a paired test. Answers whether a move makes a clear difference or is chance.' },
      { name: 'health', mode: 'http', method: 'GET', path: '/api/health', description: 'Check live service and database availability.' },
    ],
  })
}
