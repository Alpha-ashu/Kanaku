# Environment Reference

Use environment files by ownership boundary. Do not put every variable into one global file unless the runtime actually reads it there.

## Files

- Root: [`/.env.example`](../../.env.example)
  Use for repo-level local orchestration and root Vite/dev commands.
- Backend: [`/backend/.env.example`](../../backend/.env.example)
  Use for server secrets, DB connectivity, storage, upload policy, and backend integrations.
- Frontend: [`/frontend/.env.example`](../../frontend/.env.example)
  Use for browser-safe public configuration only.

## Rules

- Commit only `*.example` templates.
- Keep real secrets in local `.env` files that are already gitignored.
- Never put service-role keys or JWT secrets into frontend env files.
- Treat backend profile/PIN services as authoritative; do not add client-only role or PIN flags.

## Current public vs secret split

### Safe for frontend/public env

- API base URL
- Supabase public URL
- Supabase publishable/anon key
- feature flags that do not grant privilege
- optional public market-data key if intentionally exposed

### Backend-only secrets

- `JWT_SECRET`
- database credentials
- Supabase service-role key
- Gemini/Google keys
- Redis credentials
- storage moderation/malware scanner credentials

## Current cleanup in this pass

The following legacy client-authority env flags were removed from example files because they no longer match the code path:

- `VITE_ADMIN_EMAILS`
- `VITE_ADVISOR_EMAILS`
- `VITE_SUPABASE_USER_PINS_ENABLED`

## Recommended workflow

1. Copy the relevant example file into its local `.env` sibling.
2. Fill only the variables required for that runtime.
3. Keep production credentials in your deployment provider secret manager.
4. Rotate any credential that was ever stored in a shared local file or accidentally committed.
