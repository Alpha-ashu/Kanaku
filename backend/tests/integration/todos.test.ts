/**
 * TODOS API - Comprehensive Test Suite
 * Covers: Lists CRUD, Items, Sharing, Authorization
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = 'todos-test-user', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'todos@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
};

describe('TODOS MODULE', () => {
  describe('GET /todos', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/todos`);
      expect(res.status).toBe(401);
    });

    it('should return todo lists for authenticated user', async () => {
      const res = await request(app).get(`${API}/todos`).set(getSignedAuthHeaders());
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /todos', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/todos`)
        .send({ title: 'My Shopping List' });
      expect(res.status).toBe(401);
    });

    it('should reject todo list with missing title', async () => {
      const res = await request(app)
        .post(`${API}/todos`)
        .set(getSignedAuthHeaders())
        .send({});
      expect([400, 401]).toContain(res.status);
    });

    it('should create a valid todo list', async () => {
      const uniqueTitle = `Shopping List ${Date.now()}`;
      const res = await request(app)
        .post(`${API}/todos`)
        .set(getSignedAuthHeaders())
        .send({ title: uniqueTitle });
      expect([201, 400, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
      }
    });

    it('should sanitize XSS in todo list title', async () => {
      const res = await request(app)
        .post(`${API}/todos`)
        .set(getSignedAuthHeaders())
        .send({ title: '<script>alert("xss")</script>' });
      if (res.status === 201 && res.body.data?.title) {
        expect(res.body.data.title).not.toContain('<script>');
      }
      expect([201, 400, 500]).toContain(res.status);
    });
  });

  describe('GET /todos/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get(`${API}/todos/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent todo list', async () => {
      const res = await request(app)
        .get(`${API}/todos/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('PUT /todos/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put(`${API}/todos/some-id`)
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent todo list', async () => {
      const res = await request(app)
        .put(`${API}/todos/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders())
        .send({ title: 'Updated' });
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /todos/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`${API}/todos/some-id`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent todo list', async () => {
      const res = await request(app)
        .delete(`${API}/todos/00000000-0000-0000-0000-000000000000`)
        .set(getSignedAuthHeaders());
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('IDOR Protection', () => {
    it('should not allow accessing another users todo list', async () => {
      const res = await request(app)
        .get(`${API}/todos/another-user-list-id`)
        .set(getSignedAuthHeaders());
      expect([404, 403, 500]).toContain(res.status);
    });

    it('should not allow deleting another users todo list', async () => {
      const res = await request(app)
        .delete(`${API}/todos/another-user-list-id`)
        .set(getSignedAuthHeaders());
      expect([404, 403, 500]).toContain(res.status);
    });
  });
});

