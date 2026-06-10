# Backend Skill Reference  KANAKU

> Stack: Node.js  TypeScript  Express  Prisma  PostgreSQL  Zod  Winston

---

## 1. Middleware Chain Order

The order of Express middleware registration in `backend/src/app.ts` is **critical**. Follow this sequence:

```
helmet()               Security headers
cors()                 CORS policy
rateLimit()            Global rate limiter
express.json()         Body parser
requestId middleware   Attach req.id
routes (/api/v1/...)   All feature routes
404 handler            Catch-all for unknown paths
errorHandler           Central error formatter (MUST be last)
```

>  The `errorHandler` must be registered **after** all routes. It will never be reached if mounted before them.

---

## 2. Routing Conventions

- All API routes are versioned under `/api/v1/`.
- Route files live in `backend/src/modules/<module>/`.
- Each module exposes: `<module>.routes.ts`, `<module>.controller.ts`, `<module>.service.ts`, `<module>.types.ts`.
- Validation middleware (`validate.ts`) wraps every mutating route.

```ts
// backend/src/modules/accounts/accounts.routes.ts
router.post('/', authenticate, validate(createAccountSchema), createAccount);
router.put('/:id', authenticate, validate(updateAccountSchema), updateAccount);
```

---

## 3. Error Handling  AppError Pattern

**Never** build inline `res.status(400).json({ error: '...' })` in controllers. Instead:

1. Throw an `AppError` from `backend/src/utils/AppError.ts`.
2. Pass it to `next(err)` so the central `errorHandler` formats and logs it.

```ts
import { AppError } from '../../utils/AppError';

export const createAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const account = await accountService.create(req.userId!, req.body);
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    next(err); // central errorHandler takes over
  }
};
```

### AppError factory methods
| Method | HTTP | Code |
|---|---|---|
| `AppError.badRequest(msg, code?)` | 400 | `BAD_REQUEST` |
| `AppError.unauthorized(msg?, code?)` | 401 | `UNAUTHORIZED` |
| `AppError.forbidden(msg?, code?)` | 403 | `FORBIDDEN` |
| `AppError.notFound(resource?, code?)` | 404 | `NOT_FOUND` |
| `AppError.conflict(msg, code?)` | 409 | `CONFLICT` |
| `AppError.tooManyRequests(msg?, code?)` | 429 | `RATE_LIMIT_EXCEEDED` |
| `AppError.internal(msg?, code?)` | 500 | `INTERNAL_ERROR` |

---

## 4. Prisma Conventions

- `prisma` client singleton is in `backend/src/db/prisma.ts`.
- Models use camelCase fields (Prisma default); DB columns follow snake_case (mapped via `@map`).
- Use **transactions** for any operation that updates a balance AND creates a record:

```ts
await prisma.$transaction(async (tx) => {
  const transaction = await tx.transaction.create({ data: { ... } });
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: amount } },
  });
  return transaction;
});
```

- Prisma errors `P2002` (unique), `P2025` (not found), `P2003` (FK) are caught centrally by `errorHandler`  no need to handle in controllers.

---

## 5. Validation Middleware (Zod)

- Import `validate` from `backend/src/middleware/validate.ts`.
- Define schemas in `<module>.types.ts` or a `<module>.schema.ts` file.
- Zod errors are caught by `errorHandler` and formatted into user-friendly messages automatically.

```ts
import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    category: z.string().min(1, 'Category is required'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    type: z.enum(['income', 'expense']),
  }),
});
```

---

## 6. Authentication Middleware

- `authenticate` middleware is in `backend/src/middleware/auth.ts`.
- It verifies the JWT via a multi-path strategy:
  1. Custom `JWT_SECRET`
  2. Supabase JWT secret
  3. Supabase API call (`/auth/v1/user`)
  4. Dev-mode bypass (only if `NODE_ENV !== 'production'`)
- Sets `req.userId` and `req.user` on success.
- Always use `req.userId!` (non-null assert) only after a `if (!req.userId) throw AppError.unauthorized()` guard.

---

## 7. Logging

- Winston logger is configured in `backend/src/config/logger.ts`.
- Use `logger.info`, `logger.warn`, `logger.error`  never `console.log` in production code.
- Structured logging: always pass a second argument object with context fields.

```ts
logger.error('Transaction creation failed', {
  userId: req.userId,
  amount: req.body.amount,
  code: err.code,
  message: err.message,
  stack: err.stack,
});
```

- HTTP request logging is handled by Morgan middleware  do not log `req`/`res` manually.

---

## 8. Database Transactions & Monetary Integrity

- All balance mutations **must** use `prisma.$transaction`.
- Monetary amounts are stored as integers (cents) or `Decimal`  never `Float`.
- Ownership checks must precede any read or write:

```ts
const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
if (!account) throw AppError.notFound('Account');
```

---

## 9. API Response Shape

Every response must follow this shape:

**Success**
```json
{ "success": true, "data": { ... }, "message": "Optional human message" }
```

**Error** (formatted by `errorHandler` automatically)
```json
{ "success": false, "error": "User-friendly message", "code": "ERROR_CODE" }
```

---

## 10. Pre-Deployment Checklist

- [ ] All new routes are under `/api/v1/`.
- [ ] All mutating routes have `validate(schema)` middleware.
- [ ] All protected routes have `authenticate` middleware.
- [ ] No secrets hardcoded  all from `process.env`.
- [ ] No `console.log`  replaced with `logger.*`.
- [ ] DB balance mutations wrapped in `prisma.$transaction`.

---

## 11. Intelligence Systems (OCR & Voice)

- **OCR Engine**: Uses a Hybrid Pipeline (Tesseract.js for text extraction + Gemini 1.5 Flash for semantic structuring).
- **Voice NLP**: Uses Keyword-based segmentation + Gemini enhancement for ambiguous transcripts.
- **Circuit Breaker**: All AI calls must be wrapped in `withCircuitBreaker` to handle service downtime without crashing the backend.
- **Lazy Initialization**: Critical environment variables for AI/Auth are resolved lazily to prevent `FUNCTION_STARTUP_ERROR` in serverless environments.


