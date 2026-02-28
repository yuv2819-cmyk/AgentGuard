import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('API integration', () => {
  const app = createApp();

  it('GET /v1/health responds with ok', async () => {
    const response = await request(app).get('/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('POST /v1/agent/actions requires X-Agent-Key', async () => {
    const response = await request(app).post('/v1/agent/actions').send({
      tool: 'kb',
      action: 'read',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/X-Agent-Key/);
  });

  it('GET /v1/workspaces requires bearer auth', async () => {
    const response = await request(app).get('/v1/workspaces');
    expect(response.status).toBe(401);
  });
});
