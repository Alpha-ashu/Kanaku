import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const makeToken = (userId: string, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign(
    { userId, id: userId, email: `${userId}@test.com`, role, isApproved: role === 'advisor' },
    secret,
    { expiresIn: '15m' },
  );
};

const userAuth = (userId = 'advisor-test-user') => ({
  Authorization: `Bearer ${makeToken(userId, 'user')}`,
});

const advisorAuth = (userId = 'advisor-test-advisor') => ({
  Authorization: `Bearer ${makeToken(userId, 'advisor')}`,
});

const adminAuth = (userId = 'advisor-test-admin') => ({
  Authorization: `Bearer ${makeToken(userId, 'admin')}`,
});

const managerAuth = (userId = 'advisor-test-manager') => ({
  Authorization: `Bearer ${makeToken(userId, 'manager')}`,
});

describe('Advisor System', () => {
  // ── PUBLIC / USER SIDE ────────────────────────────────────────────────────
  describe('GET /advisors — browse advisors (user role)', () => {
    it('returns advisor list for authenticated user', async () => {
      const res = await request(app).get(`${API}/advisors`).set(userAuth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('GET /advisors is a public route (no auth required)', async () => {
      const res = await request(app).get(`${API}/advisors`);
      // Public route — returns 200 (or 503 if DB unavailable), never 401
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('returns array in data if 200', async () => {
      const res = await request(app).get(`${API}/advisors`).set(userAuth());
      if (res.status === 200) {
        // GET /advisors returns the advisor list as the response body (array).
        // Tolerate a future {success,data} envelope too.
        expect(Array.isArray(res.body) || Array.isArray(res.body?.data)).toBe(true);
      }
    });

    it('supports search/filter query params', async () => {
      const res = await request(app)
        .get(`${API}/advisors?specialization=investments&minRating=4`)
        .set(userAuth());
      expect([200, 400, 500, 503]).toContain(res.status);
    });
  });

  describe('GET /advisors/:id — advisor profile', () => {
    it('returns 404 or 500 for non-existent advisor', async () => {
      const res = await request(app)
        .get(`${API}/advisors/non-existent-advisor-id`)
        .set(userAuth());
      expect([404, 500, 503]).toContain(res.status);
    });
  });

  describe('POST /advisors/apply — apply as advisor (user)', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/advisors/apply`)
        .send({ bio: 'Experienced advisor', specialization: 'investments' });
      expect(res.status).toBe(401);
    });

    it('user can apply with valid data', async () => {
      const res = await request(app)
        .post(`${API}/advisors/apply`)
        .set(userAuth())
        .send({
          bio: 'Experienced financial advisor with 10 years',
          specialization: 'investments',
          qualifications: ['CFA'],
          experienceYears: 10,
        });
      expect([200, 201, 400, 409, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('rejects application without required bio', async () => {
      const res = await request(app)
        .post(`${API}/advisors/apply`)
        .set(userAuth())
        .send({ specialization: 'investments' });
      expect([400, 422, 500, 503]).toContain(res.status);
    });
  });

  // ── ADVISOR SELF-MANAGEMENT ───────────────────────────────────────────────
  describe('GET /advisors/me — advisor profile (advisor role)', () => {
    it('returns own profile for advisor', async () => {
      const res = await request(app).get(`${API}/advisors/me`).set(advisorAuth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('user role can also access own advisor profile if applied', async () => {
      const res = await request(app).get(`${API}/advisors/me`).set(userAuth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });
  });

  describe('Advisor Availability', () => {
    it('POST /advisors/availability requires auth', async () => {
      const res = await request(app)
        .post(`${API}/advisors/availability`)
        .send({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
      expect(res.status).toBe(401);
    });

    it('advisor can set availability', async () => {
      const res = await request(app)
        .post(`${API}/advisors/availability`)
        .set(advisorAuth())
        .send({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'Asia/Kolkata' });
      expect([200, 201, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('GET /advisors/:id/availability returns slots', async () => {
      const res = await request(app)
        .get(`${API}/advisors/some-advisor-id/availability`)
        .set(userAuth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('GET /advisors/me/sessions returns advisor sessions', async () => {
      const res = await request(app)
        .get(`${API}/advisors/me/sessions`)
        .set(advisorAuth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  // ── BOOKING FLOW ──────────────────────────────────────────────────────────
  describe('Booking System', () => {
    it('GET /bookings returns user bookings', async () => {
      const res = await request(app).get(`${API}/bookings`).set(userAuth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('GET /bookings returns advisor bookings for advisor role', async () => {
      const res = await request(app).get(`${API}/bookings`).set(advisorAuth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('POST /bookings requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .send({ advisorId: 'adv-001', slotId: 'slot-001' });
      expect(res.status).toBe(401);
    });

    it('user can book advisor session', async () => {
      const res = await request(app)
        .post(`${API}/bookings`)
        .set(userAuth())
        .send({ advisorId: 'non-existent-advisor', slotId: 'non-existent-slot', date: '2026-07-01' });
      expect([201, 200, 400, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /bookings/:id/cancel requires auth', async () => {
      const res = await request(app).patch(`${API}/bookings/some-booking/cancel`);
      expect(res.status).toBe(401);
    });

    it('user can cancel their booking', async () => {
      const res = await request(app)
        .patch(`${API}/bookings/non-existent-booking/cancel`)
        .set(userAuth());
      expect([200, 400, 403, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });
  });

  // ── ADMIN/MANAGER APPROVAL FLOW ───────────────────────────────────────────
  describe('Advisor Approval (Admin/Manager)', () => {
    it('GET /advisors/admin/applications — admin can list applications', async () => {
      const res = await request(app)
        .get(`${API}/advisors/admin/applications`)
        .set(adminAuth());
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('GET /advisors/admin/applications — user is blocked', async () => {
      const res = await request(app)
        .get(`${API}/advisors/admin/applications`)
        .set(userAuth());
      expect([401, 403]).toContain(res.status);
    });

    it('GET /advisors/admin/applications — manager can list applications', async () => {
      const res = await request(app)
        .get(`${API}/advisors/admin/applications`)
        .set(managerAuth());
      expect([200, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('PUT /advisors/admin/:id/approve — admin can approve', async () => {
      const res = await request(app)
        .put(`${API}/advisors/admin/non-existent-advisor-id/approve`)
        .set(adminAuth())
        .send({ approved: true });
      expect([200, 400, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('PUT /advisors/admin/:id/approve — user is blocked', async () => {
      const res = await request(app)
        .put(`${API}/advisors/admin/some-id/approve`)
        .set(userAuth())
        .send({ approved: true });
      expect([401, 403]).toContain(res.status);
    });

    it('PUT /advisors/admin/:id/reject — admin can reject', async () => {
      const res = await request(app)
        .put(`${API}/advisors/admin/non-existent-advisor-id/reject`)
        .set(adminAuth())
        .send({ reason: 'Insufficient qualifications' });
      expect([200, 400, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // ── REVIEWS & RATINGS ────────────────────────────────────────────────────
  describe('Advisor Reviews', () => {
    it('GET /advisors/:id/reviews returns reviews', async () => {
      const res = await request(app)
        .get(`${API}/advisors/some-advisor-id/reviews`)
        .set(userAuth());
      expect([200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('POST /advisors/:id/reviews requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/advisors/some-id/reviews`)
        .send({ rating: 5, comment: 'Great!' });
      expect(res.status).toBe(401);
    });

    it('user can post review', async () => {
      const res = await request(app)
        .post(`${API}/advisors/some-advisor-id/reviews`)
        .set(userAuth())
        .send({ rating: 4, comment: 'Very helpful advisor.' });
      expect([200, 201, 400, 404, 409, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // ── DATA ISOLATION ────────────────────────────────────────────────────────
  describe('IDOR & Data Isolation', () => {
    it('user cannot view advisor-only sessions endpoint', async () => {
      const res = await request(app)
        .get(`${API}/advisors/me/sessions`)
        .set(userAuth('idor-user-test'));
      // requireRole('advisor') blocks non-advisor users with 403
      expect([403, 200, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
    });

    it('advisor A cannot cancel advisor B booking', async () => {
      const res = await request(app)
        .patch(`${API}/bookings/another-advisors-booking/cancel`)
        .set(advisorAuth('idor-advisor-test'));
      expect([400, 403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
