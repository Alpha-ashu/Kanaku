# User Registration Test Case Catalog

This document details the test cases designed for comprehensive validation of the **User Registration** feature in Kanaku.

---

## 1. Functional Testing (FT)

| Test Case ID | Name | Description | Pre-conditions | Test Steps | Expected Result |
|--------------|------|-------------|----------------|------------|-----------------|
| FT-01 | Standard New Registration | Verify a new user can sign up with valid required details. | No active session. | 1. Go to signup form.<br>2. Enter name, unique email, unique phone, valid password.<br>3. Accept terms and submit. | User is registered, default profile/settings are created, and user is redirected to onboarding/dashboard. |
| FT-02 | Signup with Optional Fields | Verify registration works when optional profile details are provided. | No active session. | 1. Fill signup form.<br>2. Fill optional fields (e.g. salary, job type, DOB during onboarding).<br>3. Submit. | Account successfully registered and onboarding values saved accurately. |
| FT-03 | Logged-in Session Navigation | Verify registration details auto-login the user immediately. | No active session. | 1. Perform successful registration.<br>2. Check for presence of `auth_token` and `refresh_token` in local storage. | Token exists; user does not need to log in manually after sign up. |
| FT-04 | Register with Different Email Providers | Verify email strings from different major domains work. | No active session. | 1. Register users with `@gmail.com`, `@yahoo.com`, `@outlook.com`. | All users are successfully registered. |

---

## 2. API Testing (API)

| Test Case ID | Name | Description | Method & Endpoint | Payload | Expected Result |
|--------------|------|-------------|-------------------|---------|-----------------|
| API-01 | Register Valid Payload | Verify POST `/auth/register` works with a valid payload. | `POST /api/v1/auth/register` | Valid JSON payload with name, email, mobile, password. | `201 Created` with success status, user object, and bearer token in headers. |
| API-02 | Reject Missing Fields | Verify registration fails when required payload fields are missing. | `POST /api/v1/auth/register` | Missing email or password. | `400 Bad Request` with `MISSING_FIELDS` code. |
| API-03 | Reject Duplicate Email | Verify registration fails when registering with an already existing email. | `POST /api/v1/auth/register` | Email of an existing user. | `409 Conflict` with `EMAIL_EXISTS` code. |
| API-04 | Input Validation Hardening | Verify API rejects incorrect data types (e.g. number for email). | `POST /api/v1/auth/register` | Email is a number or boolean. | `400 Bad Request` with schema validation error. |

---

## 3. UI Testing (UI)

| Test Case ID | Name | Description | Steps | Expected Result |
|--------------|------|-------------|-------|-----------------|
| UI-01 | UI Elements Verification | Verify form inputs (first name, last name, email, mobile, password, confirmPassword, terms) and submit button are present. | 1. Load signup page. | All inputs and buttons visible with correct placeholders/labels. |
| UI-02 | Live Field Validation Visuals | Verify validation errors appear in red under fields as they are incorrectly filled. | 1. Input invalid email format.<br>2. Tab out. | Inline error "Invalid email format" or similar appears immediately. |
| UI-03 | Button Loading/Disabled State | Verify submit button shows a loading spinner or is disabled while submitting. | 1. Click submit with valid form. | Button is disabled during submission to prevent double requests. |

---

## 4. Validation Testing (VAL)

| Test Case ID | Name | Description | Field | Input Value | Expected Result |
|--------------|------|-------------|-------|-------------|-----------------|
| VAL-01 | Email - Empty | Verify empty email is blocked. | Email | `""` | Blocked (required field validation). |
| VAL-02 | Email - Invalid Format | Verify email without `@` or domain is blocked. | Email | `invalidemail.com` | Blocked (invalid format). |
| VAL-03 | Password - Short | Verify password under 8 characters is rejected. | Password | `Short1!` | Blocked (too short). |
| VAL-04 | Password - Weak | Verify password missing digits/specials is rejected. | Password | `weakpassword` | Blocked (too weak). |
| VAL-05 | Name - Empty | Verify empty name is blocked. | Name | `""` | Blocked. |
| VAL-06 | Name - SQL Injection Payload | Verify input sanitization blocks/handles SQL payloads. | Name | `' OR '1'='1` | Handled safely as literal name string, no database script execution. |

---

## 5. Database Validation (DB)

| Test Case ID | Name | Description | Verification Query | Expected Database State |
|--------------|------|-------------|--------------------|-------------------------|
| DB-01 | User Records Persistence | Verify user record is inserted with correct attributes. | `SELECT * FROM public."User" WHERE email = ?` | Record exists; password is encrypted/hashed; role defaults to `user`. |
| DB-02 | default User Settings Creation | Verify `UserSettings` row is auto-generated for the new user. | `SELECT * FROM public."UserSettings" WHERE "userId" = ?` | Default settings row exists (theme: light, currency: USD). |
| DB-03 | No Orphan Records on Rollback | Verify database rollback occurs if profile creation fails during registration transaction. | Simulate database write failure on profile setup. | User creation is rolled back cleanly. No partial records remain. |

---

## 6. Security Testing (SEC)

| Test Case ID | Name | Description | Expected Outcome |
|--------------|------|-------------|------------------|
| SEC-01 | Password Hashing | Verify passwords are never stored in plain text. | Password stored is a secure bcrypt or argon2 hash. |
| SEC-02 | Rate Limiting | Verify endpoint rate limits excessive registration requests from same IP. | Returns `429 Too Many Requests` after threshold exceeded. |
| SEC-03 | Enumeration Protection | Verify duplicate registration returns generic messages instead of confirmation of account existence. | Success-like generic prompt or generic toast error without disclosing active status. |
| SEC-04 | Secure Cookies | Verify refresh token cookie is flagged with secure attributes. | `HttpOnly`, `Secure`, `SameSite=Lax/Strict`. |
