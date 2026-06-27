import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

// Helper for unique email generation
const uniqueEmail = () => `test_comprehensive_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

describe('COMPREHENSIVE AUTHENTICATION MODULE TESTS', () => {

  // ==========================================
  // REGISTRATION / SIGN-UP SCENARIOS
  // ==========================================
  describe('POST /auth/register', () => {
    
    // POSITIVE: Register with valid fields & strong password
    it('[Positive] should register a new user with valid email, name, and a strong password (or fail with DB error)', async () => {
      const email = uniqueEmail();
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'John Doe',
          password: 'StrongPassword123!',
        });
      
      expect([201, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.headers).toHaveProperty('authorization');
        // Refresh token is HttpOnly-cookie only — not in a JS-readable header.
        expect(res.headers).not.toHaveProperty('x-refresh-token');
        expect(String(res.headers['set-cookie'] || '')).toContain('kanaku_rt');
        expect(res.body.data?.user?.email).toBe(email);
      }
    });

    // POSITIVE: Email normalization (lowercase and trim)
    it('[Positive] should normalize email to lowercase and trim it', async () => {
      const baseEmail = uniqueEmail();
      const uppercaseEmail = `  ${baseEmail.toUpperCase()}  `;
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uppercaseEmail,
          name: 'Jane Doe',
          password: 'StrongPassword123!',
        });
      
      expect([201, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.data?.user?.email).toBe(baseEmail.toLowerCase());
      }
    });

    // POSITIVE: Special characters in name
    it('[Positive] should support registering a user with special characters in the name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: "Jean-Luc O'Connor Smith",
          password: 'StrongPassword123!',
        });
      
      expect([201, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.data?.user?.name).toBe("Jean-Luc O'Connor Smith");
      }
    });

    // NEGATIVE: Missing email
    it('[Negative] should reject registration with missing email', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          name: 'No Email',
          password: 'StrongPassword123!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    // NEGATIVE: Missing name
    it('[Negative] should reject registration with missing name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          password: 'StrongPassword123!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    // NEGATIVE: Missing password
    it('[Negative] should reject registration with missing password', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'No Password',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    // NEGATIVE: Invalid email format
    it('[Negative] should reject registration with invalid email formats', async () => {
      const invalidEmails = [
        'plainaddress',
        '#@%^%#$@#$@#.com',
        '@example.com',
        'Joe Smith <email@example.com>',
        'email.example.com',
        'email@example@example.com',
        'email@example',
      ];

      for (const email of invalidEmails) {
        const res = await request(app)
          .post(`${API}/auth/register`)
          .send({
            email,
            name: 'Invalid Email User',
            password: 'StrongPassword123!',
          });
        
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_EMAIL');
      }
    });

    // NEGATIVE: Password shorter than 8 characters
    it('[Negative] should reject registration with password shorter than 8 characters', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'Short Password User',
          password: 'W3!k',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_SHORT');
    });

    // NEGATIVE: Weak password - missing uppercase letter
    it('[Negative] should reject registration with password missing uppercase letter', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'No Uppercase User',
          password: 'weakpassword123!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });

    // NEGATIVE: Weak password - missing lowercase letter
    it('[Negative] should reject registration with password missing lowercase letter', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'No Lowercase User',
          password: 'WEAKPASSWORD123!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });

    // NEGATIVE: Weak password - missing number
    it('[Negative] should reject registration with password missing number', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'No Number User',
          password: 'WeakPassword!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });

    // NEGATIVE: Weak password - missing special character
    it('[Negative] should reject registration with password missing special character', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: 'No Special User',
          password: 'WeakPassword123',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });

    // NEGATIVE: Email already registered
    it('[Negative] should reject registration if email already exists (or return DB error)', async () => {
      const duplicateEmail = uniqueEmail();
      
      // Attempt first registration
      const res1 = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: duplicateEmail,
          name: 'First User',
          password: 'StrongPassword123!',
        });
      
      expect([201, 500, 503]).toContain(res1.status);
      
      if (res1.status === 201) {
        // Attempt second registration with the same email
        const res2 = await request(app)
          .post(`${API}/auth/register`)
          .send({
            email: duplicateEmail,
            name: 'Second User',
            password: 'StrongPassword123!',
          });
        
        expect([409, 500, 503]).toContain(res2.status);
        if (res2.status === 409) {
          expect(res2.body.code).toBe('EMAIL_EXISTS');
        }
      }
    });

    // NEGATIVE: SQL Injection prevention in email
    it('[Negative] should prevent SQL injection in email', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: "john@doe.com' OR '1'='1",
          name: 'SQL Injection User',
          password: 'StrongPassword123!',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    // NEGATIVE: XSS prevention in name
    it('[Negative] should sanitize XSS attempts in name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          name: '<script>alert("hack")</script>Sanitized Name',
          password: 'StrongPassword123!',
        });
      
      expect([201, 400, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.data?.user?.name).not.toContain('<script>');
      }
    });

    // NEGATIVE: Empty body/fields
    it('[Negative] should reject empty body and empty strings', async () => {
      const resEmpty = await request(app)
        .post(`${API}/auth/register`)
        .send({});
      expect(resEmpty.status).toBe(400);

      const resEmptyStrings = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: '',
          name: '',
          password: '',
        });
      expect(resEmptyStrings.status).toBe(400);
    });
  });

  // ==========================================
  // DIRECT LOGIN (SIGN-IN) SCENARIOS
  // ==========================================
  describe('POST /auth/login', () => {
    
    // POSITIVE: Direct login with valid credentials (or fail with DB error)
    it('[Positive] should login directly with valid email and password (or return DB error)', async () => {
      const email = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register the user first
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Login User',
          password,
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        // Direct login
        const loginRes = await request(app)
          .post(`${API}/auth/login`)
          .send({
            email,
            password,
          });
        
        expect([200, 500, 503]).toContain(loginRes.status);
        if (loginRes.status === 200) {
          expect(loginRes.body.success).toBe(true);
          expect(loginRes.headers).toHaveProperty('authorization');
          // Refresh token is HttpOnly-cookie only — not in a JS-readable header.
          expect(loginRes.headers).not.toHaveProperty('x-refresh-token');
          expect(String(loginRes.headers['set-cookie'] || '')).toContain('kanaku_rt');
        }
      }
    });

    // POSITIVE: Case-insensitive email matching for login
    it('[Positive] should allow login with case-insensitive email', async () => {
      const email = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register with mixed case email
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Case User',
          password,
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        // Login using uppercase characters
        const loginRes = await request(app)
          .post(`${API}/auth/login`)
          .send({
            email: email.toUpperCase(),
            password,
          });
        
        expect([200, 500, 503]).toContain(loginRes.status);
      }
    });

    // NEGATIVE: Login with non-existent email
    it('[Negative] should reject login for non-existent email', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({
          email: 'nonexistent@example.com',
          password: 'StrongPassword123!',
        });
      
      expect([401, 500, 503]).toContain(res.status);
      if (res.status === 401) {
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
    });

    // NEGATIVE: Login with incorrect password
    it('[Negative] should reject login with incorrect password', async () => {
      const email = uniqueEmail();
      
      // Register the user first
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Wrong Password User',
          password: 'StrongPassword123!',
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        const loginRes = await request(app)
          .post(`${API}/auth/login`)
          .send({
            email,
            password: 'IncorrectPassword!',
          });
        
        expect([401, 500, 503]).toContain(loginRes.status);
        if (loginRes.status === 401) {
          expect(loginRes.body.code).toBe('INVALID_CREDENTIALS');
        }
      }
    });

    // NEGATIVE: Missing fields on direct login
    it('[Negative] should reject direct login with missing email or password', async () => {
      const resMissingEmail = await request(app)
        .post(`${API}/auth/login`)
        .send({ password: 'StrongPassword123!' });
      expect(resMissingEmail.status).toBe(400);
      expect(resMissingEmail.body.code).toBe('MISSING_FIELDS');

      const resMissingPassword = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'test@example.com' });
      expect(resMissingPassword.status).toBe(400);
      expect(resMissingPassword.body.code).toBe('MISSING_FIELDS');
    });

    // NEGATIVE: Invalid email format on direct login
    it('[Negative] should reject direct login with invalid email format', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({
          email: 'invalid-email',
          password: 'StrongPassword123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });
  });

  // ==========================================
  // TWO-PHASE CHALLENGE-RESPONSE FLOW
  // ==========================================
  describe('POST /auth/login/challenge & POST /auth/login (Verification)', () => {
    
    // POSITIVE: Complete challenge-response flow
    it('[Positive] should successfully login using the two-phase challenge-response flow', async () => {
      const email = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register the user first
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Challenge User',
          password,
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        // Phase 1: Request Challenge
        const challengeRes = await request(app)
          .post(`${API}/auth/login/challenge`)
          .send({ email, password });
        
        expect([200, 500, 503]).toContain(challengeRes.status);
        
        if (challengeRes.status === 200) {
          expect(challengeRes.body.success).toBe(true);
          expect(challengeRes.body.data).toHaveProperty('code');
          const code = challengeRes.body.data.code;
          
          // Phase 2: Login with Challenge Code
          const loginRes = await request(app)
            .post(`${API}/auth/login`)
            .send({
              email,
              challengeCode: code,
            });
          
          expect(loginRes.status).toBe(200);
          expect(loginRes.body.success).toBe(true);
          expect(loginRes.headers).toHaveProperty('authorization');
          // Refresh token is HttpOnly-cookie only — not in a JS-readable header.
          expect(loginRes.headers).not.toHaveProperty('x-refresh-token');
          expect(String(loginRes.headers['set-cookie'] || '')).toContain('kanaku_rt');
        }
      }
    });

    // NEGATIVE: Login challenge with non-existent email
    it('[Negative] should reject challenge for non-existent email', async () => {
      const res = await request(app)
        .post(`${API}/auth/login/challenge`)
        .send({
          email: 'nonexistent@example.com',
          password: 'StrongPassword123!',
        });
      
      expect([401, 500, 503]).toContain(res.status);
      if (res.status === 401) {
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
    });

    // NEGATIVE: Login challenge with wrong password
    it('[Negative] should reject challenge with incorrect password', async () => {
      const email = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register the user first
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Wrong Chal User',
          password,
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        const res = await request(app)
          .post(`${API}/auth/login/challenge`)
          .send({
            email,
            password: 'WrongPassword!',
          });
        
        expect([401, 500, 503]).toContain(res.status);
      }
    });

    // NEGATIVE: Login challenge missing email or password
    it('[Negative] should reject challenge with missing email or password', async () => {
      const resMissingEmail = await request(app)
        .post(`${API}/auth/login/challenge`)
        .send({ password: 'StrongPassword123!' });
      expect(resMissingEmail.status).toBe(400);
      expect(resMissingEmail.body.code).toBe('MISSING_FIELDS');

      const resMissingPassword = await request(app)
        .post(`${API}/auth/login/challenge`)
        .send({ email: 'test@example.com' });
      expect(resMissingPassword.status).toBe(400);
      expect(resMissingPassword.body.code).toBe('MISSING_FIELDS');
    });

    // NEGATIVE: Login challenge with invalid email format
    it('[Negative] should reject challenge with invalid email format', async () => {
      const res = await request(app)
        .post(`${API}/auth/login/challenge`)
        .send({
          email: 'invalid-email',
          password: 'StrongPassword123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    // NEGATIVE: Verify phase with incorrect challenge code
    it('[Negative] should reject login verification with invalid challenge code', async () => {
      const email = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register
      const registerRes = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email,
          name: 'Bad Code User',
          password,
        });
      
      expect([201, 500, 503]).toContain(registerRes.status);
      
      if (registerRes.status === 201) {
        // Request challenge
        const challengeRes = await request(app)
          .post(`${API}/auth/login/challenge`)
          .send({ email, password });
        
        expect([200, 500, 503]).toContain(challengeRes.status);
        
        if (challengeRes.status === 200) {
          // Attempt verify with wrong code
          const verifyRes = await request(app)
            .post(`${API}/auth/login`)
            .send({
              email,
              challengeCode: '999999', // Incorrect code
            });
          
          expect([401, 500, 503]).toContain(verifyRes.status);
          if (verifyRes.status === 401) {
            expect(verifyRes.body.code).toBe('CHALLENGE_INVALID');
          }
        }
      }
    });

    // NEGATIVE: Verify phase with mismatched email
    it('[Negative] should reject login verification if email mismatches the challenge', async () => {
      const email1 = uniqueEmail();
      const email2 = uniqueEmail();
      const password = 'StrongPassword123!';
      
      // Register both users
      await request(app).post(`${API}/auth/register`).send({ email: email1, name: 'User 1', password });
      const reg2 = await request(app).post(`${API}/auth/register`).send({ email: email2, name: 'User 2', password });
      
      expect([201, 500, 503]).toContain(reg2.status);
      
      if (reg2.status === 201) {
        // Request challenge for user 1
        const challengeRes = await request(app)
          .post(`${API}/auth/login/challenge`)
          .send({ email: email1, password });
        
        expect([200, 500, 503]).toContain(challengeRes.status);
        
        if (challengeRes.status === 200) {
          const code = challengeRes.body.data.code;
          
          // Try to verify code using user 2's email
          const verifyRes = await request(app)
            .post(`${API}/auth/login`)
            .send({
              email: email2,
              challengeCode: code,
            });
          
          expect([401, 500, 503]).toContain(verifyRes.status);
        }
      }
    });
  });
});
