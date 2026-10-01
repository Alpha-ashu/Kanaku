/**
 * The video room for an advisor session.
 *
 * The room name is derived from the session id with a server secret, so it
 * cannot be guessed from anything a client sees, and it is handed out only by
 * the access check (the client used to build it from the session id itself).
 *
 * On public meet.jit.si that name is the only protection: whoever has the link
 * can join. With a Jitsi server that uses token (JWT) authentication — self
 * hosted with `authentication = "token"`, or JaaS — set:
 *
 *   JITSI_APP_ID, JITSI_APP_SECRET  the app id / shared secret configured in Prosody
 *   SESSION_VIDEO_BASE_URL          https://meet.your-domain (the Jitsi server)
 *   JITSI_DOMAIN                    token `sub` (defaults to that host)
 *   JITSI_AUDIENCE                  token `aud` (default "jitsi")
 *
 * and each participant's link carries a token for THAT room only, expiring when
 * the session's join window closes; the server then refuses anyone without one.
 * The advisor joins as moderator.
 */
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';

const MAX_TOKEN_LIFETIME_S = 4 * 60 * 60;
const DEFAULT_TOKEN_LIFETIME_S = 2 * 60 * 60;

const baseUrl = () => (process.env.SESSION_VIDEO_BASE_URL || 'https://meet.jit.si').replace(/\/+$/, '');

export const sessionRoomName = (sessionId: string) => {
  const secret = process.env.SESSION_ROOM_SECRET || process.env.JWT_SECRET || 'kanaku-dev-room-secret';
  return `Kanaku-${createHmac('sha256', secret).update(`session-room:${sessionId}`).digest('base64url').slice(0, 32)}`;
};

export const videoRoomsUseTokens = () => Boolean(process.env.JITSI_APP_ID && process.env.JITSI_APP_SECRET);

export interface RoomParticipant {
  id: string;
  name?: string | null;
  moderator: boolean;
}

export function sessionJoinUrl(sessionId: string, participant: RoomParticipant, validUntil?: string | Date | null): string {
  const room = sessionRoomName(sessionId);
  const url = `${baseUrl()}/${room}`;
  if (!videoRoomsUseTokens()) return url;

  const now = Math.floor(Date.now() / 1000);
  const until = validUntil ? Math.floor(new Date(validUntil).getTime() / 1000) : NaN;
  const exp = Number.isFinite(until) && until > now
    ? Math.min(until, now + MAX_TOKEN_LIFETIME_S)
    : now + DEFAULT_TOKEN_LIFETIME_S;

  const token = jwt.sign(
    {
      aud: process.env.JITSI_AUDIENCE || 'jitsi',
      iss: process.env.JITSI_APP_ID,
      sub: process.env.JITSI_DOMAIN || new URL(baseUrl()).host,
      room,
      nbf: now - 60,
      exp,
      moderator: participant.moderator,
      context: {
        user: {
          id: participant.id,
          name: participant.name || (participant.moderator ? 'Advisor' : 'Client'),
          moderator: participant.moderator ? 'true' : 'false',
        },
      },
    },
    process.env.JITSI_APP_SECRET as string,
    { algorithm: 'HS256', noTimestamp: false },
  );
  return `${url}?jwt=${token}`;
}
