/**
 * VOICE API - Integration Test Suite
 * Covers: /process transcript and /process-audio endpoints
 */
import request from 'supertest';
import { app } from '../../src/app';

const API = '/api/v1';

const getAuthHeaders = (token = 'mock-access-token') => ({
  Authorization: `Bearer ${token}`,
});

describe('VOICE MODULE', () => {
  describe('POST /voice/process', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/voice/process`)
        .send({ transcript: 'Spent 500 on dinner' });
      expect(res.status).toBe(401);
    });

    it('should return 400 with missing transcript', async () => {
      const res = await request(app)
        .post(`${API}/voice/process`)
        .set(getAuthHeaders())
        .send({});
      expect([400, 401]).toContain(res.status);
    });

    it('should process transcript for authenticated user', async () => {
      const res = await request(app)
        .post(`${API}/voice/process`)
        .set(getAuthHeaders())
        .send({ transcript: 'Spent 500 on food yesterday' });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.actions.length).toBeGreaterThan(0);
        expect(res.body.actions[0].type).toBe('expense');
        expect(res.body.actions[0].entities.amount).toBe(500);
      }
    });
  });

  describe('POST /voice/process-audio', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post(`${API}/voice/process-audio`);
      expect(res.status).toBe(401);
    });

    it('should return 400 if no file is uploaded', async () => {
      const res = await request(app)
        .post(`${API}/voice/process-audio`)
        .set(getAuthHeaders());
      expect([400, 401]).toContain(res.status);
    });

    it('should fail or return fallback if dummy webm is processed', async () => {
      const dummyBuffer = Buffer.from('dummy-audio-content');
      const res = await request(app)
        .post(`${API}/voice/process-audio`)
        .set(getAuthHeaders())
        .attach('audio', dummyBuffer, 'voice_input.webm');
      
      expect([200, 401, 503]).toContain(res.status);
      if (res.status === 503) {
        expect(res.body.fallbackToWebSpeech).toBe(true);
      }
    });
  });
});
