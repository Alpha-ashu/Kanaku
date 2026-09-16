/**
 * Forgot-PIN reset via emailed OTP (sensitive_action).
 *
 * Regression for "No active OTP found. Please request a new one." shown with a
 * correct code on the Reset-your-PIN dialog. Three paths led there:
 *   1. verify-security matched the OTP against the token's email claim, which
 *      can be a placeholder — the proof check failed and the user's retry of
 *      Verify found the code already consumed;
 *   2. re-verifying an already-accepted code reported "No active OTP";
 *   3. a failed resend expired the code the user had already received.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { testEmail, testUserId } from '../helpers/fixtures';

const API = '/api/v1';

import { otpService } from '../../../../backend/src/features/otp/otp.service';

jest.mock('../../../../backend/src/utils/email', () => ({
  sendEmail: jest.fn(async () => true),
  FROM_EMAIL: 'test@kanaku-test.invalid',
  FROM_NAME: 'Kanaku Test',
}));

describe('forgot-PIN OTP reset', () => {
  let userId: string;
  let email: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    userId = testUserId();
    email = testEmail();
    await prisma.otpRequest.deleteMany({ where: { destination: email } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: { id: userId, email, name: 'Pin Reset', password: 'x', emailVerified: true, isApproved: true },
    });
    const secret = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.JWT_SECRET = secret;
    // Placeholder email claim, as middleware/auth.ts produces when the claim is missing.
    const token = jwt.sign(
      { userId, id: userId, email: `user-${userId.slice(0, 8)}@noemail.invalid`, role: 'user', isApproved: true },
      secret,
      { expiresIn: '15m' },
    );
    headers = { Authorization: `Bearer ${token}` };
  });

  beforeEach(async () => {
    await prisma.otpRequest.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.otpRequest.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  const send = (destination: string) =>
    request(app).post(`${API}/otp/send`).set(headers).send({ destination, channel: 'email', purpose: 'sensitive_action' });
  const verify = (otp: string) =>
    request(app).post(`${API}/otp/verify`).set(headers).send({ destination: 'ignored@example.com', purpose: 'sensitive_action', otp });

  it('sends the code to the account email, not the client-supplied destination', async () => {
    const res = await send('someone-else@example.com');
    expect(res.status).toBe(200);
    const rows = await prisma.otpRequest.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].destination).toBe(email);
  });

  it('issues a security token after OTP verification even with a placeholder email claim', async () => {
    const sent = await send(email);
    expect(sent.status).toBe(200);
    expect(sent.body.code).toMatch(/^\d{6}$/);

    expect((await verify(sent.body.code)).status).toBe(200);

    const sec = await request(app).post(`${API}/pin/verify-security`).set(headers).send({});
    expect(sec.status).toBe(200);
    expect(sec.body.securityToken).toEqual(expect.any(String));
  });

  it('accepts the same code again after it was verified (retry after a later step failed)', async () => {
    const sent = await send(email);
    expect((await verify(sent.body.code)).status).toBe(200);

    const again = await verify(sent.body.code);
    expect(again.status).toBe(200);
    expect(again.body.message).not.toMatch(/No active OTP/);

    const wrong = await verify(sent.body.code === '000000' ? '111111' : '000000');
    expect(wrong.status).toBe(400);
  });

  it('keeps the delivered code valid when a later resend fails to deliver', async () => {
    const first = await send(email);
    expect(first.status).toBe(200);

    // Resend is past the 30s cooldown in real life; age the first row instead of waiting.
    await prisma.otpRequest.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    // Outside production a failed send is treated as delivered (dev fallback), so
    // simulate the production outcome at the delivery step itself.
    const deliver = jest.spyOn(otpService as any, 'deliverOtp').mockResolvedValueOnce(false);
    const resend = await send(email);
    deliver.mockRestore();
    expect(resend.status).toBe(502);

    const res = await verify(first.body.code);
    expect(res.status).toBe(200);
  });

  it('supersedes the earlier code once a resend is delivered', async () => {
    const first = await send(email);
    await prisma.otpRequest.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const second = await send(email);
    expect(second.status).toBe(200);

    if (first.body.code !== second.body.code) {
      expect((await verify(first.body.code)).status).toBe(400);
    }
    expect((await verify(second.body.code)).status).toBe(200);
  });

  it('refuses a security token without any recent proof', async () => {
    const sec = await request(app).post(`${API}/pin/verify-security`).set(headers).send({});
    expect(sec.status).toBe(403);
  });
});
