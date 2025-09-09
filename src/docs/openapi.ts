export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Auth Service API',
    version: '1.0.0',
    description: 'Registration and user info endpoints.'
  },
  paths: {
    '/auth/change-password': {
      post: {
        summary: 'Change password (email + current password)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangePasswordRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Changed', content: { 'application/json': { schema: { $ref: '#/components/schemas/OkResponse' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { $ref: '#/components/responses/Internal' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Logout (clear JWT cookie)',
        responses: {
          '200': {
            description: 'Cookie cleared',
            headers: {
              'Set-Cookie': { description: 'Clears httpOnly JWT cookie' },
            },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OkResponse' } } },
          },
          '500': { $ref: '#/components/responses/Internal' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Login with email/password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User object',
            headers: {
              'Set-Cookie': { description: 'HttpOnly JWT cookie' },
            },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': {
            description: 'Unauthorized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '500': { $ref: '#/components/responses/Internal' },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Registration result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OkResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
          '500': { $ref: '#/components/responses/Internal' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get user claims',
        parameters: [
          {
            in: 'query', name: 'application_name', required: false, schema: { type: 'string', default: 'BUDGETS' }
          },
          {
            in: 'query', name: 'user_id', required: true, schema: { type: 'string' }
          },
        ],
        responses: {
          '200': {
            description: 'User claims',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } } },
          },
          '500': { $ref: '#/components/responses/Internal' },
        },
      },
    },
  },
  components: {
    responses: {
      BadRequest: {
        description: 'Bad input',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      Conflict: {
        description: 'Conflict',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      Internal: {
        description: 'Server error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
    schemas: {
      ChangePasswordRequest: {
        type: 'object',
        required: ['email', 'current_password', 'new_password'],
        properties: {
          email: { type: 'string', format: 'email' },
          current_password: { type: 'string' },
          new_password: { type: 'string', minLength: 6 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          email: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['first_name', 'last_name', 'email', 'password', 'role_label'],
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role_label: { type: 'string', enum: ['accountant', 'regular_user', 'global_user', 'assistant', 'admin'] },
          application_name: { type: 'string', default: 'BUDGETS' },
        },
      },
      OkResponse: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: true } },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      MeResponse: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          email: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;
