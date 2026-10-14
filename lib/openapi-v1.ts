const errorSchema = {
  type: 'object', required: ['error', 'request_id'],
  properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } }, request_id: { type: 'string' } },
};
const errorContent = { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } };
const commonErrors = {
  '400': { description: 'Invalid input.', content: errorContent },
  '401': { description: 'Missing, invalid, revoked, or expired API key.', content: errorContent },
  '403': { description: 'The API key does not have the required scope.', content: errorContent },
  '429': { description: 'The per-key rate limit was exceeded. See Retry-After.', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: errorContent },
  '503': { description: 'The rate limiter or billing service is temporarily unavailable.', content: errorContent },
  '500': { description: 'The request could not be completed.', content: errorContent },
};
const dataEnvelope = { type: 'object', required: ['data', 'request_id'], properties: { data: { type: 'array', items: { type: 'object' } }, request_id: { type: 'string' } } };

export const openApiV1 = {
  openapi: '3.1.0',
  info: {
    title: 'LeonardX Public API', version: '1.0.0',
    description: 'Public API v1 for account, projects, model discovery, text inference, and usage. Model inference requires an active API plan and available credits.',
  },
  servers: [{ url: 'https://leoos-omega.vercel.app/api' }],
  security: [{ BearerApiKey: [] }],
  tags: [{ name: 'Account' }, { name: 'Projects' }, { name: 'Models' }, { name: 'Messages' }, { name: 'Usage' }],
  paths: {
    '/v1/me': {
      get: {
        operationId: 'getCurrentApiAccount', tags: ['Account'], summary: 'Read the API-key owner account',
        responses: { '200': { description: 'Account and API key scope information.' }, ...commonErrors },
      },
    },
    '/v1/projects': {
      get: { operationId: 'listProjects', tags: ['Projects'], summary: 'List the API-key owner’s projects', responses: { '200': { description: 'Up to 100 projects, newest first.' }, ...commonErrors } },
      post: {
        operationId: 'createProject', tags: ['Projects'], summary: 'Create a draft project',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['project_name'], properties: { project_name: { type: 'string', maxLength: 120 }, type: { type: 'string', maxLength: 40, default: 'web_app' } }, additionalProperties: false } } } },
        responses: { '201': { description: 'The created draft project.' }, ...commonErrors },
      },
    },
    '/v1/projects/{id}': {
      get: { operationId: 'getProject', tags: ['Projects'], summary: 'Read a project owned by the API-key owner', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Project metadata and saved files.' }, '404': { description: 'Project not found or not owned by this account.', content: errorContent }, ...commonErrors } },
    },
    '/v1/projects/{id}/status': {
      get: { operationId: 'getProjectStatus', tags: ['Projects'], summary: 'Read project status without saved file contents', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Project status and progress.' }, '404': { description: 'Project not found or not owned by this account.', content: errorContent }, ...commonErrors } },
    },
    '/v1/models': {
      get: {
        operationId: 'listModels', tags: ['Models'], summary: 'List models enabled for this API deployment',
        responses: { '200': { description: 'Supported model identifiers.', content: { 'application/json': { schema: dataEnvelope } } }, ...commonErrors },
      },
    },
    '/v1/messages': {
      post: {
        operationId: 'createMessage', tags: ['Messages'], summary: 'Create a text message response, optionally streamed as server-sent events',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['messages'], properties: { model: { type: 'string', default: 'gpt-4o-mini' }, messages: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', required: ['role', 'content'], properties: { role: { type: 'string', enum: ['system', 'user', 'assistant'] }, content: { type: 'string', minLength: 1 } } } }, max_tokens: { type: 'integer', minimum: 1, maximum: 4096, default: 1024 }, stream: { type: 'boolean', default: false } }, additionalProperties: false } } } },
        responses: { '200': { description: 'Model response JSON when stream=false, or server-sent message events when stream=true.' }, '402': { description: 'An active API plan or sufficient credits are required.', content: errorContent }, '502': { description: 'The model provider could not complete the request.', content: errorContent }, ...commonErrors },
      },
    },
    '/v1/usage': {
      get: { operationId: 'listAiUsage', tags: ['Usage'], summary: 'Read recent AI usage records', responses: { '200': { description: 'Up to 200 recent AI usage rows.' }, ...commonErrors } },
    },
  },
  components: {
    securitySchemes: { BearerApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'LeonardX API key' } },
    schemas: {
      ErrorResponse: errorSchema,
      DataEnvelope: dataEnvelope,
      Project: { type: 'object', required: ['id', 'project_name', 'created_at'], properties: { id: { type: 'string' }, project_name: { type: 'string' }, type: { type: ['string', 'null'] }, status: { type: ['string', 'null'] }, progress: { type: ['integer', 'null'] }, file_url: { type: ['string', 'null'] }, files: { type: 'object', additionalProperties: { type: 'string' } }, created_at: { type: 'string', format: 'date-time' } } },
    },
  },
};
