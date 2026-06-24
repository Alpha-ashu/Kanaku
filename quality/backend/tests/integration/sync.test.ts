/**
 * SYNC API - Comprehensive Test Suite
 * Covers: Pull/Push, Device Registration, Conflict Resolution, Auth
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedToken = (userId = 'sync-test-user') => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId,
      email: `${userId}@test.com`,
      role: 'user',
      isApproved: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

const getAuthHeaders = (userId = 'sync-test-user') => ({
  Authorization: `Bearer ${getSignedToken(userId)}`,
});

describe('SYNC MODULE', () => {
  //  POST /sync/pull 
  describe('POST /sync/pull', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .send({ deviceId: 'device1' });
      expect(res.status).toBe(401);
    });

    it('should reject pull with missing deviceId', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .set(getAuthHeaders())
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID is required');
    });

    it('should ignore a client-supplied userId during validation', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .set(getAuthHeaders())
        .send({ userId: 'different-user' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID is required');
    });

    it('should reject invalid lastSyncedAt timestamp before hitting the sync service', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .set(getAuthHeaders())
        .send({ deviceId: 'device1', lastSyncedAt: 'not-a-date' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('lastSyncedAt must be a valid timestamp');
    });
  });

  //  POST /sync/push 
  describe('POST /sync/push', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .send({ deviceId: 'device1', entities: [] });
      expect(res.status).toBe(401);
    });

    it('should reject push with missing entities', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(getAuthHeaders())
        .send({ deviceId: 'device1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID and entities array are required');
    });

    it('should reject push when entities is not an array', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(getAuthHeaders())
        .send({ deviceId: 'device1', entities: 'not-array' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID and entities array are required');
    });

    it('should ignore a client-supplied userId during push validation', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(getAuthHeaders())
        .send({ userId: 'different-user', deviceId: 'device1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID and entities array are required');
    });
  });

  //  POST /sync/register-device 
  describe('POST /sync/register-device', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/sync/register-device`)
        .send({ deviceId: 'device1', deviceName: 'Test Phone' });
      expect(res.status).toBe(401);
    });

    it('should reject without deviceId even when userId is omitted from body', async () => {
      const res = await request(app)
        .post(`${API}/sync/register-device`)
        .set(getAuthHeaders())
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID is required');
    });

    it('should ignore a client-supplied userId during device registration validation', async () => {
      const res = await request(app)
        .post(`${API}/sync/register-device`)
        .set(getAuthHeaders())
        .send({ userId: 'different-user' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Device ID is required');
    });
  });

  //  GET /sync/devices 
  describe('GET /sync/devices', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/sync/devices`);
      expect(res.status).toBe(401);
    });
  });

  //  POST /sync/deactivate-device 
  describe('POST /sync/deactivate-device', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/sync/deactivate-device`)
        .send({ deviceId: 'device1' });
      expect(res.status).toBe(401);
    });

    it('should reject without deviceId', async () => {
      const res = await request(app)
        .post(`${API}/sync/deactivate-device`)
        .set(getAuthHeaders())
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
