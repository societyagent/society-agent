const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } })

export const onRequestGet = async () => response({
  openapi: '3.1.0',
  info: { title: 'Society Agent API', version: '1.0.0', description: 'Deterministic town simulation for external agents. The service never accepts wallet secrets or broadcasts transactions.' },
  servers: [{ url: 'https://societyagent.fun' }],
  paths: {
    '/api/agent/capabilities': {
      get: { operationId: 'getCapabilities', summary: 'Discover real agent capabilities', responses: { '200': { description: 'Capabilities' } } },
    },
    '/api/agent/simulate': {
      post: {
        operationId: 'simulateTown',
        summary: 'Run one bounded deterministic town simulation without saving it',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['cfg'],
                properties: { cfg: { type: 'object' }, ticks: { type: 'integer', minimum: 12, maximum: 144 }, interventions: { type: 'array', maxItems: 80 } },
              },
            },
          },
        },
        responses: { '200': { description: 'Simulation result' }, '400': { description: 'Invalid input' }, '429': { description: 'Rate limit reached' } },
      },
    },
    '/api/health': {
      get: { operationId: 'health', summary: 'Check service and database availability', responses: { '200': { description: 'Healthy' }, '503': { description: 'Database unavailable' } } },
    },
  },
})
