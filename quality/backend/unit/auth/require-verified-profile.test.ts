import { Request, Response, NextFunction } from 'express';
import { requireVerifiedProfile, AuthRequest } from '../../../../backend/src/middleware/auth';

describe('requireVerifiedProfile Middleware & View-Only Mode', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('rejects an unverified user (emailVerified: false) with 403 PROFILE_VERIFICATION_REQUIRED', () => {
    mockReq = {
      user: {
        id: 'usr-1',
        email: 'test@example.com',
        role: 'user',
        isApproved: true,
        emailVerified: false,
        status: 'pending_verification',
        isVerified: false,
        isViewOnly: true,
      },
    };

    requireVerifiedProfile(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PROFILE_VERIFICATION_REQUIRED',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('rejects a user with pending_verification status with 403 PROFILE_VERIFICATION_REQUIRED', () => {
    mockReq = {
      user: {
        id: 'usr-2',
        email: 'pending@example.com',
        role: 'user',
        isApproved: true,
        emailVerified: true,
        status: 'pending_verification',
        isVerified: false,
        isViewOnly: true,
      },
    };

    requireVerifiedProfile(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PROFILE_VERIFICATION_REQUIRED',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('allows verified users (emailVerified: true, status: verified) through with next()', () => {
    mockReq = {
      user: {
        id: 'usr-3',
        email: 'verified@example.com',
        role: 'user',
        isApproved: true,
        emailVerified: true,
        status: 'verified',
        isVerified: true,
        isViewOnly: false,
      },
    };

    requireVerifiedProfile(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });
});
