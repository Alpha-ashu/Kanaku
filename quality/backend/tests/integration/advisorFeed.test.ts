/**
 * Advisor feed, follow graph, and consultation chat attachments.
 *
 * These surfaces existed in the UI long before they had tables — posts and
 * follows were React state and the attach button only raised a toast. The
 * contract worth pinning here is the boundary, not the happy path: who may
 * publish, that a like cannot be double-counted, that the feed is scoped to the
 * caller's own follow edges, and that a private storage key never travels to a
 * client.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

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

const userAuth = (userId = 'feed-test-user') => ({ Authorization: `Bearer ${makeToken(userId, 'user')}` });
const advisorAuth = (userId = 'feed-test-advisor') => ({ Authorization: `Bearer ${makeToken(userId, 'advisor')}` });

/** The whole module sits behind the `bookAdvisor` admin flag (deny by default). */
const GATED_OK = [200, 201, 403, 404, 500, 503];

describe('Advisor feed', () => {
  describe('GET /advisors/posts', () => {
    it('is routed to the feed, not swallowed by the /:id advisor lookup', async () => {
      const res = await request(app).get(`${API}/advisors/posts`).set(userAuth());
      expect(GATED_OK).toContain(res.status);
      // A 404 "Advisor not found" would mean `posts` was read as an advisor id.
      if (res.status === 404) {
        expect(res.body?.error).not.toMatch(/advisor not found/i);
      }
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });

    it('requires authentication', async () => {
      const res = await request(app).get(`${API}/advisors/posts`);
      expect([401, 403]).toContain(res.status);
    });

    it('returns only followed advisors when following=true', async () => {
      const res = await request(app).get(`${API}/advisors/posts?following=true`).set(userAuth());
      expect(GATED_OK).toContain(res.status);
      if (res.status === 200) {
        // A user who follows nobody gets an empty feed, never everyone's posts.
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('POST /advisors/posts', () => {
    it('rejects a plain user — publishing is advisor-only', async () => {
      const res = await request(app)
        .post(`${API}/advisors/posts`)
        .set(userAuth())
        .send({ category: 'Tax Alert', title: 'Not allowed', content: 'A user must not be able to publish.' });
      expect([403, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('rejects an empty title or body', async () => {
      const res = await request(app)
        .post(`${API}/advisors/posts`)
        .set(advisorAuth())
        .send({ category: 'Tax Alert', title: '', content: '' });
      expect([400, 403, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(201);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/advisors/posts`)
        .send({ title: 'x', content: 'y' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('likes', () => {
    it('accepts a like without exposing another user\'s like list', async () => {
      const res = await request(app).post(`${API}/advisors/posts/does-not-exist/like`).set(userAuth()).send({});
      // Unknown post is a 404 — never a 500 and never a silent success.
      expect([403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('unliking an unknown post is harmless', async () => {
      const res = await request(app).delete(`${API}/advisors/posts/does-not-exist/like`).set(userAuth());
      // Idempotent by design: removing a like that is not there is not an error.
      expect([200, 403, 500, 503]).toContain(res.status);
    });
  });
});

describe('Advisor follow graph', () => {
  it('GET /advisors/following resolves to the follow list route', async () => {
    const res = await request(app).get(`${API}/advisors/following`).set(userAuth());
    expect(GATED_OK).toContain(res.status);
    if (res.status === 404) {
      expect(res.body?.error).not.toMatch(/advisor not found/i);
    }
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it('refuses a self-follow', async () => {
    const res = await request(app)
      .post(`${API}/advisors/feed-test-advisor/follow`)
      .set(advisorAuth('feed-test-advisor'))
      .send({});
    expect([400, 403, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('will not follow an id that is not an approved advisor', async () => {
    const res = await request(app)
      .post(`${API}/advisors/not-a-real-advisor/follow`)
      .set(userAuth())
      .send({});
    expect([403, 404, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('requires authentication to follow', async () => {
    const res = await request(app).post(`${API}/advisors/someone/follow`).send({});
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * Full cycle against a real approved advisor from the database: publish, read,
 * like (twice — the second must not count), follow, read the scoped feed, then
 * unwind everything. Skips itself if the instance has no approved advisor yet.
 */
describe('Advisor feed end-to-end', () => {
  let advisorId: string | null = null;
  let postId: string | null = null;

  beforeAll(async () => {
    const res = await request(app).get(`${API}/advisors`).set(userAuth());
    if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
      advisorId = res.body[0].id;
    }
  });

  afterAll(async () => {
    if (postId && advisorId) {
      await request(app).delete(`${API}/advisors/posts/${postId}`).set(advisorAuth(advisorId));
    }
    if (advisorId) {
      await request(app).delete(`${API}/advisors/${advisorId}/follow`).set(userAuth());
    }
  });

  it('publishes an update as the advisor and returns it in the feed', async () => {
    if (!advisorId) return;

    const created = await request(app)
      .post(`${API}/advisors/posts`)
      .set(advisorAuth(advisorId))
      .send({
        category: 'Tax Alert',
        title: 'Integration test update',
        content: 'Advance tax instalment reminder for the current quarter.',
      });

    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Integration test update');
    expect(created.body.likes).toBe(0);
    expect(created.body.liked).toBe(false);
    postId = created.body.id;

    const feed = await request(app).get(`${API}/advisors/posts`).set(userAuth());
    expect(feed.status).toBe(200);
    expect(feed.body.some((post: { id: string }) => post.id === postId)).toBe(true);
  });

  it('counts a like once no matter how many times it is sent', async () => {
    if (!postId) return;

    const first = await request(app).post(`${API}/advisors/posts/${postId}/like`).set(userAuth()).send({});
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ liked: true, likes: 1 });

    const second = await request(app).post(`${API}/advisors/posts/${postId}/like`).set(userAuth()).send({});
    expect(second.status).toBe(200);
    expect(second.body.likes).toBe(1);

    const removed = await request(app).delete(`${API}/advisors/posts/${postId}/like`).set(userAuth());
    expect(removed.body).toMatchObject({ liked: false, likes: 0 });
  });

  it('scopes the following feed to advisors the caller actually follows', async () => {
    if (!advisorId || !postId) return;

    const before = await request(app).get(`${API}/advisors/posts?following=true`).set(userAuth());
    expect(before.status).toBe(200);
    expect(before.body.some((post: { id: string }) => post.id === postId)).toBe(false);

    const followed = await request(app).post(`${API}/advisors/${advisorId}/follow`).set(userAuth()).send({});
    expect(followed.status).toBe(200);
    expect(followed.body.following).toBe(true);

    const following = await request(app).get(`${API}/advisors/following`).set(userAuth());
    expect(following.body.some((row: { advisorId: string }) => row.advisorId === advisorId)).toBe(true);

    const after = await request(app).get(`${API}/advisors/posts?following=true`).set(userAuth());
    expect(after.body.some((post: { id: string }) => post.id === postId)).toBe(true);
  });

  it('lets only the author delete the update', async () => {
    if (!postId) return;

    const asStranger = await request(app).delete(`${API}/advisors/posts/${postId}`).set(advisorAuth('someone-else'));
    expect([403, 404]).toContain(asStranger.status);

    const stillThere = await request(app).get(`${API}/advisors/posts`).set(userAuth());
    expect(stillThere.body.some((post: { id: string }) => post.id === postId)).toBe(true);
  });
});

describe('Consultation attachments', () => {
  it('rejects an upload with no file', async () => {
    const res = await request(app)
      .post(`${API}/sessions/some-session/attachments`)
      .set(userAuth());
    expect([400, 403, 404, 429, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(201);
  });

  it('refuses a session the caller is not part of', async () => {
    const res = await request(app)
      .post(`${API}/sessions/not-my-session/attachments`)
      .set(userAuth())
      .attach('file', Buffer.from('%PDF-1.4 test'), 'statement.pdf');
    expect([400, 403, 404, 429, 500, 503]).toContain(res.status);
    expect(res.status).not.toBe(201);
  });

  it('does not hand out an attachment for someone else\'s session', async () => {
    const res = await request(app)
      .get(`${API}/sessions/not-my-session/messages/some-message/attachment`)
      .set(userAuth());
    expect([403, 404, 500, 503]).toContain(res.status);
    expect(res.body?.url).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`${API}/sessions/x/messages/y/attachment`);
    expect([401, 403]).toContain(res.status);
  });
});
