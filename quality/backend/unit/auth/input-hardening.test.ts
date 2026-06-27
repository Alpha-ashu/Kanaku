import { containsSqlInjection, sanitize } from '../../../../backend/src/utils/sanitize';
import { updateProfileSchema, MAX_ANNUAL_INCOME, MAX_MONTHLY_INCOME } from '../../../../backend/src/features/auth/auth.validation';
import { accountCreateSchema } from '../../../../backend/src/features/accounts/account.validation';

describe('Input hardening: SQL-injection guard', () => {
  it('flags classic injection payloads', () => {
    const payloads = [
      'SELECT * FROM users WHERE username = ? AND password = ?;',
      "'; DROP TABLE users; --",
      "admin' OR 1=1 --",
      'x UNION SELECT * FROM accounts',
      '1; DELETE FROM transactions',
    ];
    for (const p of payloads) {
      expect(containsSqlInjection(p)).toBe(true);
    }
  });

  it('does not flag ordinary financial text', () => {
    const ok = [
      'HDFC Bank - Salary Account',
      'Chennai, Tamil Nadu, India',
      "O'Brien Savings",
      'Software Engineer',
      'My Emergency Fund 2026',
    ];
    for (const v of ok) {
      expect(containsSqlInjection(v)).toBe(false);
    }
  });
});

describe('updateProfileSchema', () => {
  it('rejects SQL-injection in free-text fields', () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Robert'); DROP TABLE students; --",
    });
    expect(result.success).toBe(false);
  });

  it('clamps an oversized salary out of validation (rejects above the cap)', () => {
    const result = updateProfileSchema.safeParse({ salary: 100_000_000_000 });
    expect(result.success).toBe(false);
  });

  it('rejects monthly income above the column-safe maximum', () => {
    const result = updateProfileSchema.safeParse({ monthlyIncome: MAX_MONTHLY_INCOME + 1 });
    expect(result.success).toBe(false);
  });

  it('accepts a realistic onboarding payload', () => {
    const result = updateProfileSchema.safeParse({
      firstName: 'Shaik',
      lastName: 'Ashraf',
      gender: 'male',
      country: 'India',
      state: 'Tamil Nadu',
      city: 'Chennai',
      jobType: 'Full-time Employment',
      monthlyIncome: 50_000,
      salary: 600_000,
      dateOfBirth: '1995-05-15',
      avatarId: 'new-1',
      avatarUrl: '/api/v1/avatars/dicebear/avataaars/svg?seed=Xavier',
    });
    expect(result.success).toBe(true);
  });

  it('accepts (and drops) null optional fields sent by the local profile sync', () => {
    // The frontend sends empty optional fields as `null`. These must NOT 400 —
    // they should be treated as "not provided" (stripped), never written.
    const result = updateProfileSchema.safeParse({
      firstName: 'Shaik',
      gender: null,
      phone: null,
      dateOfBirth: null,
      jobType: null,
      country: null,
      state: null,
      city: null,
      monthlyIncome: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('gender');
      expect(result.data).not.toHaveProperty('phone');
      expect(result.data).not.toHaveProperty('monthlyIncome');
      expect(result.data.firstName).toBe('Shaik');
    }
  });

  it('keeps the annual cap consistent with the monthly cap', () => {
    expect(MAX_MONTHLY_INCOME).toBe(Math.floor(MAX_ANNUAL_INCOME / 12));
  });
});

describe('accountCreateSchema', () => {
  it('rejects an account name carrying an SQL-injection payload', () => {
    const result = accountCreateSchema.safeParse({
      name: 'HDFC Bank - SELECT * FROM users WHERE username = ? AND password = ?;',
      type: 'bank',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a normal bank account name', () => {
    const result = accountCreateSchema.safeParse({
      name: 'HDFC Bank - Salary Account',
      type: 'bank',
      balance: 1500,
      currency: 'INR',
    });
    expect(result.success).toBe(true);
  });
});

describe('sanitize() still strips XSS', () => {
  it('removes script/HTML', () => {
    expect(sanitize('<script>alert(1)</script>Hello')).toBe('Hello');
    expect(sanitize('<img src=x onerror=alert(1)>Name')).toBe('Name');
  });
});

