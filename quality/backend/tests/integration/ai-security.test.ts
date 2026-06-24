import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedToken = (role: 'admin' | 'advisor' | 'user') => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId: `ai-test-${role}`,
      email: `ai-test-${role}@test.com`,
      role,
      isApproved: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('AI SECURITY', () => {
  it('rejects unauthenticated AI event ingestion', async () => {
    const res = await request(app)
      .post(`${API}/ai/events`)
      .send({ eventType: 'features_refreshed', metadata: {} });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rejects invalid AI event payload for authenticated user', async () => {
    const token = getSignedToken('user');

    const res = await request(app)
      .post(`${API}/ai/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'x', metadata: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects unauthenticated admin AI overview access', async () => {
    const res = await request(app).get(`${API}/admin/ai/overview`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('rejects non-admin user from admin AI overview', async () => {
    const token = getSignedToken('user');

    const res = await request(app)
      .get(`${API}/admin/ai/overview`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });

  it('enforces admin AI query validation for limit bounds', async () => {
    const token = getSignedToken('admin');

    const res = await request(app)
      .get(`${API}/admin/ai/users?limit=999`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
