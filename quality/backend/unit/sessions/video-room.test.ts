/**
 * Session video links. Without Jitsi token auth the link is just the secret room
 * name; with it, each participant's link carries a token for that room only,
 * expiring with the join window, and only the advisor is moderator.
 */
import jwt from 'jsonwebtoken';
import { sessionJoinUrl, sessionRoomName } from '../../../../backend/src/features/sessions/videoRoom';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('session video room', () => {
  it('is an unguessable room name, stable per session', () => {
    process.env.JWT_SECRET = 'room-secret-for-tests-at-least-32-chars';
    const a = sessionRoomName('session-1');
    expect(a).toMatch(/^Kanaku-[A-Za-z0-9_-]{32}$/);
    expect(sessionRoomName('session-1')).toBe(a);
    expect(sessionRoomName('session-2')).not.toBe(a);
    expect(a).not.toContain('session-1');
  });

  it('is a plain link when the Jitsi server has no token auth', () => {
    delete process.env.JITSI_APP_ID;
    delete process.env.JITSI_APP_SECRET;
    process.env.SESSION_VIDEO_BASE_URL = 'https://meet.jit.si';
    expect(sessionJoinUrl('s1', { id: 'u1', moderator: false })).toBe(`https://meet.jit.si/${sessionRoomName('s1')}`);
  });

  it('carries a room-scoped token that expires with the join window', () => {
    Object.assign(process.env, {
      JITSI_APP_ID: 'kanaku', JITSI_APP_SECRET: 'jitsi-shared-secret', SESSION_VIDEO_BASE_URL: 'https://meet.kanaku.example',
    });
    const closes = new Date(Date.now() + 45 * 60_000);
    const advisor = new URL(sessionJoinUrl('s1', { id: 'adv', name: 'Anna', moderator: true }, closes.toISOString()));
    const client = new URL(sessionJoinUrl('s1', { id: 'cli', name: 'Ravi', moderator: false }, closes));

    expect(advisor.pathname).toBe(`/${sessionRoomName('s1')}`);
    const a = jwt.verify(advisor.searchParams.get('jwt') as string, 'jitsi-shared-secret', { audience: 'jitsi', issuer: 'kanaku' }) as jwt.JwtPayload;
    const c = jwt.verify(client.searchParams.get('jwt') as string, 'jitsi-shared-secret') as jwt.JwtPayload;
    expect(a).toMatchObject({ room: sessionRoomName('s1'), sub: 'meet.kanaku.example', moderator: true, context: { user: { id: 'adv', name: 'Anna' } } });
    expect(c.moderator).toBe(false);
    expect(a.exp).toBe(Math.floor(closes.getTime() / 1000));
    expect(() => jwt.verify(client.searchParams.get('jwt') as string, 'wrong-secret')).toThrow();
  });
});
