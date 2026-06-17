# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-registration.spec.ts >> Login – Verify All Accounts Work >> Login U2: priya.test@kanaku.app
- Location: tests\e2e\01-registration.spec.ts:44:5

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED ::1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/login/challenge
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - x-pw-encoding: sha256
    - Content-Type: application/json
    - content-length: 111

```