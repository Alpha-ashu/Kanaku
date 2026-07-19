import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { invalidateLearningCache } from '../../../../backend/src/features/voice/voice.learning';
import { detectLanguage } from '../../../../backend/src/features/voice/voice.nlp';

const API = '/api/v1';
const TEST_USER_ID = 'voice-learning-test-user';

const getToken = () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign(
    { userId: TEST_USER_ID, id: TEST_USER_ID, email: 'voice-learn@example.com', role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('VOICE INTELLIGENCE — learning loop & multilingual detection', () => {
  const authToken = getToken();

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID, email: 'voice-learn@example.com', name: 'Voice Learner',
        password: 'x', role: 'user', isApproved: true, status: 'verified',
      },
    });
    await prisma.userVoiceLearning.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.voiceTranscript.deleteMany({ where: { userId: TEST_USER_ID } });
    invalidateLearningCache(TEST_USER_ID);
  });

  afterAll(async () => {
    await prisma.userVoiceLearning.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.voiceTranscript.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  });

  it('persists a correction via POST /voice/learn', async () => {
    const res = await request(app)
      .post(`${API}/voice/learn`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ originalSegment: 'spent 300 on chai at office canteen', correctedCategory: 'Office Snacks' });

    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(true);

    const row = await prisma.userVoiceLearning.findFirst({ where: { userId: TEST_USER_ID } });
    expect(row).not.toBeNull();
    expect(row!.correctedCategory).toBe('Office Snacks');
    expect(row!.appliedCount).toBe(1);
  });

  it('repeat corrections upsert the same row and increment applied_count', async () => {
    const res = await request(app)
      .post(`${API}/voice/learn`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ originalSegment: 'spent 300 on chai at office canteen', correctedCategory: 'Office Snacks' });

    expect(res.status).toBe(200);
    const rows = await prisma.userVoiceLearning.findMany({ where: { userId: TEST_USER_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].appliedCount).toBe(2);
  });

  it('applies the learned category on the next /voice/process call (regex fallback path)', async () => {
    invalidateLearningCache(TEST_USER_ID);
    const res = await request(app)
      .post(`${API}/voice/process`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ transcript: 'spent 300 on chai at office canteen' });

    expect(res.status).toBe(200);
    expect(res.body.actions.length).toBeGreaterThan(0);
    const action = res.body.actions[0];
    // Without learning this categorises as Food & Dining; the correction overrides it
    expect(action.entities.category).toBe('Office Snacks');
    expect(action.requiresReview).toBe(false);
  }, 30000);

  it('stores the processed transcript in voice_transcripts', async () => {
    const count = await prisma.voiceTranscript.count({ where: { userId: TEST_USER_ID } });
    expect(count).toBeGreaterThan(0);
  });

  it('detects Devanagari and Tamil scripts; Latin/Hinglish stays en', () => {
    expect(detectLanguage('मैंने पेट्रोल पर पाँच सौ रुपये खर्च किये')).toBe('hi');
    expect(detectLanguage('நான் உணவுக்கு ஐநூறு ரூபாய் செலவழித்தேன்')).toBe('ta');
    expect(detectLanguage('maine 500 ka petrol bharwaya')).toBe('en');
    expect(detectLanguage('spent 500 on petrol')).toBe('en');
  });
});
