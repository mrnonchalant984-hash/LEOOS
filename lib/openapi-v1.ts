const errorResponse = {
  type: 'object',
  required: ['error', 'request_id'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
    request_id: { type: 'string' },
  },
} as const;

const commonErrors = {
  '400': { description: 'Invalid input.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  '401': { description: 'Missing, invalid, revoked, or expired API key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  '403': { description: 'The API key does not have the required scope.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  '429': { description: 'The per-key rate limit was exceeded. See Retry-After.', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  '503': { description: 'The shared rate limiter is temporarily unavailable.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  '500': { description: 'The request could not be completed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
} as const;

export const openApiV1 = {
  openapi: '3.1.0',
  info: {
    title: 'LEO OS Public API',
    version: '1.0.0',
    description: 'Public API v1 for account, projects, project status, and AI usage. This OpenAPI document version is independent from the /api/v1 URL prefix and plugin manifest apiVersion.',
  },
  servers: [{ url: 'https://leoos-omega.vercel.app/api' }],
  security: [{ BearerApiKey: [] }],
  tags: [{ name: 'Account' }, { name: 'Projects' }, { name: 'Usage' }],
  paths: {
    '/v1/me': {
      get: {
        operationId: 'getCurrentApiAccount', tags: ['Account'], summary: 'Read the API-key owner account',
        responses: {
          '200': { description: 'Account and API key scope information.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountResponse' } } } },
          ...commonErrors,
        },
      },
    },
    '/v1/projects': {
      get: {
        operationId: 'listProjects', tags: ['Projects'], summary: 'List the API-key owner’s projects',
        responses: {
          '200': { description: 'Up to 100 projects, newest first.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectListResponse' } } } },
          ...commonErrors,
        },
      },
      post: {
        operationId: 'createProject', tags: ['Projects'], summary: 'Create a draft project',
        security: [{ BearerApiKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProjectRequest' } } } },
        responses: {
          '201': { description: 'The created draft project.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          ...commonErrors,
        },
      },
    },
    '/v1/projects/{id}': {
      get: {
        operationId: 'getProject', tags: ['Projects'], summary: 'Read a project owned by the API-key owner',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Project metadata and saved files.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '404': { description: 'Project not found or not owned by this account.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          ...commonErrors,
        },
      },
    },
    '/v1/projects/{id}/status': {
      get: {
        operationId: 'getProjectStatus', tags: ['Projects'], summary: 'Read project status without saved file contents',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Project status and progress.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '404': { description: 'Project not found or not owned by this account.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          ...commonErrors,
        },
      },
    },
    '/v1/usage': {
      get: {
        operationId: 'listAiUsage', tags: ['Usage'], summary: 'Read recent AI usage records',
        responses: {
          '200': { description: 'Up to 200 recent AI usage rows.', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsageResponse' } } } },
          ...commonErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: { BearerApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'LEO API key' } },
    schemas: {
      ErrorResponse: errorResponse,
      RequestEnvelope: { type: 'object', properties: { request_id: { type: 'string' } } },
      Project: {
        type: 'object', required: ['id', 'project_name', 'created_at'],
        properties: {
          id: { type: 'string' }, project_name: { type: 'string' }, type: { type: ['string', 'null'] },
          status: { type: ['string', 'null'] }, progress: { type: ['integer', 'null'] },
          file_url: { type: ['string', 'null'] }, files: { type: 'object', additionalProperties: { type: 'string' } },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      ProjectListResponse: { type: 'object', required: ['data', 'request_id'], properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Project' } }, request_id: { type: 'string' } } },
      ProjectResponse: { type: 'object', required: ['data', 'request_id'], properties: { data: { $ref: '#/components/schemas/Project' }, request_id: { type: 'string' } } },
      CreateProjectRequest: { type: 'object', required: ['project_name'], properties: { project_name: { type: 'string', maxLength: 120 }, type: { type: 'string', maxLength: 40, default: 'web_app' } }, additionalProperties: false },
      AccountResponse: { type: 'object', required: ['data', 'request_id'], properties: { data: { type: 'object', properties: { id: { type: 'string' }, email: { type: ['string', 'null'] }, full_name: { type: ['string', 'null'] }, role: { type: 'string' }, created_at: { type: 'string', format: 'date-time' }, api_key_id: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } } }, request_id: { type: 'string' } } },
      UsageResponse: { type: 'object', required: ['data', 'request_id'], properties: { data: { type: 'array', items: { type: 'object', properties: { feature: { type: 'string' }, model: { type: ['string', 'null'] }, total_tokens: { type: 'integer' }, credits_used: { type: 'integer' }, created_at: { type: 'string', format: 'date-time' } } } }, request_id: { type: 'string' } } },
    },
  },
} as const;
