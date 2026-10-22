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
    '/api/agent/compare': {
      post: {
        operationId: 'compareOptions',
        summary: 'Compare 2-4 interventions in the same random towns (paired test); bounded, nothing stored',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['template', 'conds'], properties: { template: { type: 'string' }, n: { type: 'integer', minimum: 10, maximum: 30 }, outcome: { type: 'string', enum: ['final', 'peak', 'spread', 'half'] }, conds: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', properties: { label: { type: 'string' }, kind: { type: 'string', enum: ['none', 'announce', 'whisper'] }, text: { type: 'string' }, hour: { type: 'integer', minimum: 8, maximum: 22 }, stance: { type: 'number', minimum: -1, maximum: 1 } } } } } } } } },
        responses: { '200': { description: 'Per-option statistics and a verdict per option versus the first' }, '400': { description: 'Invalid experiment' }, '429': { description: 'Rate limit reached' } },
      },
    },
    '/api/health': {
      get: { operationId: 'health', summary: 'Check service and database availability', responses: { '200': { description: 'Healthy' }, '503': { description: 'Database unavailable' } } },
    },
  },
})
