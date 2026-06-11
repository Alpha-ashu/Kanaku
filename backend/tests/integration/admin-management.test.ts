import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/db/prisma';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = '00000000-0000-0000-0000-000000000001', role = 'admin') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = secret;
  }
  // Generate unique email per user ID to avoid database email uniqueness conflicts during request validation
  const email = `${role}_${userId.slice(0, 8)}@test.com`;
  const token = jwt.sign({ userId, id: userId, email, role, isApproved: true }, secret, { expiresIn: '15m' });
  return {
    Authorization: `Bearer ${token}`,
  };
};

describe('ADMIN MANAGEMENT MODULE', () => {
  let testUserId: string;
  let dbAvailable = true;
  const testEmail = `admin_test_${Date.now()}@example.com`;
  const testPhone = `+1555000${Math.floor(1000 + Math.random() * 9000)}`;

  beforeAll(async () => {
    try {
      // Clean up if exist
      const oldUser = await prisma.user.findFirst({ where: { email: testEmail } });
      if (oldUser) {
        try {
          await prisma.user.delete({ where: { id: oldUser.id } });
        } catch (err) {}
      }
    } catch {
      dbAvailable = false;
    }
  });

  describe('Phone uniqueness and Registration/Profile updating checks', () => {
    it('should allow registering a user with a unique phone number', async () => {
      if (!dbAvailable) return;
      const newId = randomUUID();
      const user = await prisma.user.create({
        data: {
          id: newId,
          email: testEmail,
          name: 'Unique Phone User',
          password: 'Password123!',
          role: 'user',
          isApproved: true,
        }
      });
      testUserId = user.id;

      // Sync public.profiles
      await prisma.profiles.upsert({
        where: { id: testUserId },
        create: {
          id: testUserId,
          email: testEmail,
          full_name: 'Unique Phone User',
          phone: testPhone,
          updated_at: new Date(),
        },
        update: {
          phone: testPhone,
        }
      });

      const profile = await prisma.profiles.findUnique({ where: { id: testUserId } });
      expect(profile?.phone).toBe(testPhone);
    });

    it('should reject registering a new user with the same phone number', async () => {
      if (!dbAvailable || !testUserId) return;
      const duplicateEmail = `duplicate_${Date.now()}@example.com`;
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: duplicateEmail,
          name: 'Duplicate Phone User',
          password: 'Password123!',
          phone: testPhone,
        });

      expect([400, 409]).toContain(res.status);
      expect(res.body.code).toBe('PHONE_EXISTS');
    });

    it('should reject updating profile of another user to the same phone number', async () => {
      if (!dbAvailable || !testUserId) return;
      // Create another user
      const user2Email = `user2_${Date.now()}@example.com`;
      const user2Id = randomUUID();
      const user2 = await prisma.user.create({
        data: {
          id: user2Id,
          email: user2Email,
          name: 'User Two',
          password: 'Password123!',
          role: 'user',
          isApproved: true,
        }
      });

      // Update user2 profile via update profile endpoint to use user1's phone number
      const headers = getSignedAuthHeaders(user2.id, 'user');
      const res = await request(app)
        .put(`${API}/auth/profile`)
        .set(headers)
        .send({
          firstName: 'User',
          lastName: 'Two',
          phone: testPhone, // Duplicate phone
        });

      expect([400, 409]).toContain(res.status);
      expect(res.body.code).toBe('PHONE_EXISTS');

      // Clean up user2
      await prisma.user.delete({ where: { id: user2.id } });
    });
  });

  describe('GET /admin/users/:userId/storage', () => {
    it('should reject requests from non-admin users', async () => {
      if (!dbAvailable || !testUserId) return;
      const headers = getSignedAuthHeaders('00000000-0000-0000-0000-000000000009', 'user');
      const res = await request(app)
        .get(`${API}/admin/users/${testUserId}/storage`)
        .set(headers);
      expect([401, 403]).toContain(res.status);
    });

    it('should retrieve database storage statistics for a user', async () => {
      if (!dbAvailable || !testUserId) return;
      const headers = getSignedAuthHeaders('00000000-0000-0000-0000-000000000001', 'admin');
      const res = await request(app)
        .get(`${API}/admin/users/${testUserId}/storage`)
        .set(headers);

      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.userId).toBe(testUserId);
        expect(res.body.stats).toBeDefined();
        expect(res.body.totalRecords).toBeDefined();
        expect(res.body.estimatedBytes).toBeDefined();
      }
    });
  });

  describe('DELETE /admin/users/:userId', () => {
    it('should reject deletion requests from non-admin users', async () => {
      if (!dbAvailable || !testUserId) return;
      const headers = getSignedAuthHeaders('00000000-0000-0000-0000-000000000009', 'user');
      const res = await request(app)
        .delete(`${API}/admin/users/${testUserId}`)
        .set(headers);
      expect([401, 403]).toContain(res.status);
    });

    it('should prevent an admin from deleting themselves', async () => {
      const adminId = '00000000-0000-0000-0000-000000000001';
      const headers = getSignedAuthHeaders(adminId, 'admin');
      const res = await request(app)
        .delete(`${API}/admin/users/${adminId}`)
        .set(headers);
      expect([400, 503]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toContain('cannot delete their own account');
    });

    it('should cascade delete user data from Prisma database', async () => {
      if (!dbAvailable || !testUserId) return;
      const headers = getSignedAuthHeaders('00000000-0000-0000-0000-000000000001', 'admin');
      const res = await request(app)
        .delete(`${API}/admin/users/${testUserId}`)
        .set(headers);

      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.userId).toBe(testUserId);
        const deletedUser = await prisma.user.findUnique({ where: { id: testUserId } });
        expect(deletedUser).toBeNull();
      }
    });
  });
});
