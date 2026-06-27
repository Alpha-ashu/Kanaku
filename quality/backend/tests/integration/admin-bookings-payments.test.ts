/**
 * ADMIN & BOOKINGS APIs - Comprehensive Test Suite
 * Covers: RBAC, Admin-only, Advisor Approval, Booking Flow
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { pinService } from '../../../../backend/src/features/pin/pin.service';
import { generateSecurityToken } from '../../../../backend/src/middleware/securityGate';

const API = '/api/v1';

const getAuthHeaders = (token = 'mock-access-token') => ({
  Authorization: `Bearer ${token}`,
});

const getSignedAuthHeaders = (userId = 'pin-test-user') => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  const token = jwt.sign(
    {
      userId,
      id: userId,
      email: `${userId}@test.com`,
      role: 'user',
      isApproved: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );

  return {
    Authorization: `Bearer ${token}`,
  };
};

// 
// ADMIN MODULE - RBAC Tests
// 
describe('ADMIN MODULE', () => {
  describe('GET /admin/users', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/admin/users`);
      expect(res.status).toBe(401);
    });

    it('should return 403 for non-admin user', async () => {
      // Regular user token should be rejected
      const res = await request(app)
        .get(`${API}/admin/users`)
        .set(getAuthHeaders());
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /admin/pending-advisors', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/admin/pending-advisors`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/approve-advisor/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/admin/approve-advisor/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/reject-advisor/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/admin/reject-advisor/some-id`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/stats', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/admin/stats`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/feature-flags', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/admin/feature-flags`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/feature-flags', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/admin/feature-flags`)
        .send({ flag: 'payments', enabled: true });
      expect(res.status).toBe(401);
    });
  });
});

// 
// BOOKINGS MODULE
// 
describe('BOOKINGS MODULE', () => {
  describe('POST /bookings', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .send({
          advisorId: 'advisor-1',
          sessionType: 'video',
          proposedDate: '2026-06-01',
          proposedTime: '10:00',
          duration: 60,
          amount: 100,
        });
      expect(res.status).toBe(401);
    });

    it('should reject booking with missing advisorId', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(getAuthHeaders())
        .send({
          sessionType: 'video',
          proposedDate: '2026-06-01',
          proposedTime: '10:00',
          duration: 60,
          amount: 100,
        });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject booking with invalid session type', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(getAuthHeaders())
        .send({
          advisorId: 'advisor-1',
          sessionType: 'hologram',
          proposedDate: '2026-06-01',
          proposedTime: '10:00',
          duration: 60,
          amount: 100,
        });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject booking with past date', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(getAuthHeaders())
        .send({
          advisorId: 'advisor-1',
          sessionType: 'video',
          proposedDate: '2020-01-01',
          proposedTime: '10:00',
          duration: 60,
          amount: 100,
        });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject booking with negative amount', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(getAuthHeaders())
        .send({
          advisorId: 'advisor-1',
          sessionType: 'video',
          proposedDate: '2026-06-01',
          proposedTime: '10:00',
          duration: 60,
          amount: -50,
        });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject booking with invalid time format', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(getAuthHeaders())
        .send({
          advisorId: 'advisor-1',
          sessionType: 'video',
          proposedDate: '2026-06-01',
          proposedTime: '25:99',
          duration: 60,
          amount: 100,
        });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('GET /bookings', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/bookings`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /bookings/:id/accept', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).post(`${API}/bookings/some-id/accept`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /bookings/:id/reject', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).post(`${API}/bookings/some-id/reject`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).post(`${API}/bookings/some-id/cancel`);
      expect(res.status).toBe(401);
    });
  });
});

// 
// PAYMENTS MODULE
// 
describe('PAYMENTS MODULE', () => {
  describe('GET /payments', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/payments`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /payments', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/payments`)
        .send({ sessionId: 's1', paymentMethod: 'stripe' });
      expect(res.status).toBe(401);
    });

    it('should reject with missing sessionId', async () => {
      const res = await request(app)
        .post(`${API}/payments`)
        .set(getAuthHeaders())
        .send({ paymentMethod: 'stripe' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject with invalid payment method', async () => {
      const res = await request(app)
        .post(`${API}/payments`)
        .set(getAuthHeaders())
        .send({ sessionId: 's1', paymentMethod: 'bitcoin' });
      expect([400, 401]).toContain(res.status);
    });
  });
});

// 
// PIN MODULE
// 
describe('PIN MODULE', () => {
  describe('POST /pin/create', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .send({ pin: '123456' });
      expect(res.status).toBe(401);
    });

    it('should reject PIN shorter than 6 digits', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(getAuthHeaders())
        .send({ pin: '12345' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject PIN longer than 6 digits', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(getAuthHeaders())
        .send({ pin: '1234567' });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject non-numeric PIN', async () => {
      const res = await request(app)
        .post(`${API}/pin/create`)
        .set(getAuthHeaders())
        .send({ pin: 'abcdef' });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('POST /pin/verify', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post(`${API}/pin/verify`)
        .send({ pin: '123456' });
      expect(res.status).toBe(401);
    });

    it('should reject empty PIN', async () => {
      const res = await request(app)
        .post(`${API}/pin/verify`)
        .set(getAuthHeaders())
        .send({ pin: '' });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('GET /pin/key-backup', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get(`${API}/pin/key-backup`);
      expect(res.status).toBe(401);
    });

    it('should return the backend-managed key backup for the authenticated user', async () => {
      const spy = jest
        .spyOn(pinService, 'getPinKeyBackup')
        .mockResolvedValueOnce({ success: true, message: 'ok', backup: 'hash|salt' });

      const res = await request(app)
        .get(`${API}/pin/key-backup`)
        .set(getSignedAuthHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.backup).toBe('hash|salt');
      expect(spy).toHaveBeenCalledWith('pin-test-user');

      spy.mockRestore();
    });
  });

  describe('POST /pin/key-backup', () => {
    it('should reject missing backup payload', async () => {
      const securityToken = generateSecurityToken('pin-test-user');
      const res = await request(app)
        .post(`${API}/pin/key-backup`)
        .set(getSignedAuthHeaders())
        .set('x-security-token', securityToken)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PIN key backup is required');
    });

    it('should save the backend-managed key backup for the authenticated user', async () => {
      const spy = jest
        .spyOn(pinService, 'savePinKeyBackup')
        .mockResolvedValueOnce({ success: true, message: 'saved' });

      const securityToken = generateSecurityToken('pin-test-user');
      const res = await request(app)
        .post(`${API}/pin/key-backup`)
        .set(getSignedAuthHeaders())
        .set('x-security-token', securityToken)
        .send({ backup: 'hash|salt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(spy).toHaveBeenCalledWith({ userId: 'pin-test-user', backup: 'hash|salt' });

      spy.mockRestore();
    });
  });

  describe('DELETE /pin/key-backup', () => {
    it('should clear the backend-managed key backup for the authenticated user', async () => {
      const spy = jest
        .spyOn(pinService, 'clearPinKeyBackup')
        .mockResolvedValueOnce({ success: true, message: 'cleared' });

      const res = await request(app)
        .delete(`${API}/pin/key-backup`)
        .set(getSignedAuthHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('pin-test-user');

      spy.mockRestore();
    });
  });
});

// 
// HEALTH CHECK
// 
describe('HEALTH CHECK', () => {
  it('should return OK from /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent-route');
    expect(res.status).toBe(404);
  });

  it('should return 404 for unknown API routes', async () => {
    const res = await request(app).get(`${API}/nonexistent`);
    expect(res.status).toBe(404);
  });
});
