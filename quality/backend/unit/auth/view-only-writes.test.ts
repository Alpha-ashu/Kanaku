/**
 * View-Only Mode is enforced by the API on every money surface. Loans, goals,
 * investments, gold, groups, budgets and recurring had the rule only in the web
 * app, so a direct API call from an unverified account could still add records
 * or move money (a goal contribution debits an account).
 */
import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { requireVerifiedForWrites, AuthRequest } from '../../../../backend/src/middleware/auth';

const unverified = {
  id: 'usr-1', email: 'x@example.com', role: 'user', isApproved: true,
  emailVerified: false, status: 'pending_verification', isVerified: false, isViewOnly: true,
} as AuthRequest['user'];

const run = (method: string) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  requireVerifiedForWrites({ method, user: unverified } as AuthRequest, res as unknown as Response, next);
  return { res, next };
};

describe('requireVerifiedForWrites', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses %s from a view-only account', (method) => {
    const { res, next } = run(method);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PROFILE_VERIFICATION_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a view-only account read', () => {
    expect(run('GET').next).toHaveBeenCalled();
  });

  it.each(['loans/loan', 'goals/goal', 'investments/investment', 'gold/gold', 'groups/group', 'budgets/budget', 'recurring/recurring'])(
    'is mounted on the %s router',
    (name) => {
      const src = fs.readFileSync(path.resolve(__dirname, `../../../../backend/src/features/${name}.routes.ts`), 'utf8');
      expect(src).toMatch(/router\.use\(requireVerifiedForWrites\)/);
    },
  );
});
