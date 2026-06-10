/**
 * KANAKU Full OpenAPI 3.0 Specification
 * Hand-crafted comprehensive spec covering ALL 150+ endpoints:
 * Auth, PIN, Accounts, Transactions, Goals, Loans, Investments,
 * Friends, Groups, Todos, Settings, Notifications, Sync, Dashboard,
 * Advisors, Bookings, Sessions, Payments, AI, Voice, Receipts,
 * Bills, Devices, Stocks, Categorization, Import, Avatars, Admin.
 *
 * Replaces the old dynamic parser-based approach with a
 * fully explicit, richly-documented spec suitable for Swagger UI.
 */

// ─── Shared reusable helpers ─────────────────────────────────────────────────

const _Envelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'object', additionalProperties: true },
    message: { type: 'string' },
  },
};

const _Error = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', example: 'Human-readable error' },
    code: { type: 'string', example: 'MISSING_FIELDS' },
    details: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } },
  },
};

function uuidParam(name: string, desc: string) {
  return { in: 'path' as const, name, required: true, description: desc, schema: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' } };
}

function strParam(name: string, desc: string) {
  return { in: 'path' as const, name, required: true, description: desc, schema: { type: 'string' } };
}

const sec = [{ bearerAuth: [] }];

function r200(desc: string, ex?: object) {
  return { '200': { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' }, ...(ex ? { example: ex } : {}) } } } };
}

function r201(desc: string, ex?: object) {
  return { '201': { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' }, ...(ex ? { example: ex } : {}) } } } };
}

const errs = {
  '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '403': { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '429': { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  '500': { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
};

function jbody(desc: string, props: object, required?: string[], ex?: object) {
  return {
    required: true, description: desc,
    content: { 'application/json': { schema: { type: 'object', ...(required ? { required } : {}), properties: props }, ...(ex ? { example: ex } : {}) } },
  };
}

function mpart(desc: string, props: Record<string, object>) {
  return { required: true, description: desc, content: { 'multipart/form-data': { schema: { type: 'object', properties: props } } } };
}

// ─── FULL PATHS ────────────────────────────────────────────────────────────────

const ALL_PATHS: Record<string, object> = {

  // HEALTH
  '/health': {
    get: { tags: ['System'], summary: 'Health check', operationId: 'getHealth', responses: { ...r200('Service healthy', { status: 'ok', timestamp: '2026-06-09T10:00:00Z', services: { redis: 'connected', database: { status: 'connected' } } }), '500': errs['500'] } },
  },

  // AUTH
  '/api/v1/auth/register': {
    post: {
      tags: ['Auth'], summary: 'Register new user', description: 'Creates account. JWT returned in Authorization response header.', operationId: 'authRegister',
      requestBody: jbody('Registration', { name: { type: 'string', maxLength: 120, example: 'Asha Sharma' }, email: { type: 'string', format: 'email', example: 'asha@example.com' }, password: { type: 'string', minLength: 8, example: 'StrongPass123!' } }, ['name', 'email', 'password']),
      responses: { ...r201('Registered', { success: true, data: { user: { id: 'uuid', email: 'asha@example.com', name: 'Asha Sharma', role: 'user' } } }), ...errs },
    },
  },
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'], summary: 'Login with email + password', operationId: 'authLogin',
      requestBody: jbody('Credentials', { email: { type: 'string', format: 'email', example: 'asha@example.com' }, password: { type: 'string', example: 'StrongPass123!' }, challengeCode: { type: 'string', description: 'Code from /auth/login/challenge' } }, ['email', 'password']),
      responses: { ...r200('Login ok', { success: true, data: { user: { id: 'uuid', email: 'asha@example.com', role: 'user' } } }), ...errs },
    },
  },
  '/api/v1/auth/login/challenge': {
    post: {
      tags: ['Auth'], summary: 'Request challenge code (2-phase login)', operationId: 'authChallenge',
      requestBody: jbody('Challenge request', { email: { type: 'string', format: 'email' }, password: { type: 'string' } }, ['email', 'password']),
      responses: { ...r200('Challenge issued', { success: true, data: { code: 'abc123' } }), ...errs },
    },
  },
  '/api/v1/auth/profile': {
    get: {
      tags: ['Auth'], summary: 'Get current user profile', operationId: 'authGetProfile', security: sec,
      parameters: [{ in: 'query', name: 'includePrivate', schema: { type: 'boolean' }, description: 'Include email/role' }],
      responses: { ...r200('Profile', { success: true, data: { id: 'uuid', email: 'asha@example.com', firstName: 'Asha', lastName: 'Sharma', role: 'user', country: 'India' } }), ...errs },
    },
    put: {
      tags: ['Auth'], summary: 'Update profile', operationId: 'authUpdateProfile', security: sec,
      requestBody: jbody('Profile fields', { firstName: { type: 'string' }, lastName: { type: 'string' }, country: { type: 'string' }, city: { type: 'string' }, phone: { type: 'string' }, occupation: { type: 'string' }, monthlyIncome: { type: 'number' }, avatarStyle: { type: 'string' }, avatarSeed: { type: 'string' } }),
      responses: { ...r200('Profile updated'), ...errs },
    },
  },
  '/api/v1/auth/otp/send': {
    post: { tags: ['Auth'], summary: 'Send OTP', operationId: 'authSendOtp', security: sec, requestBody: jbody('OTP request', { type: { type: 'string', enum: ['email', 'phone'] } }), responses: { ...r200('OTP sent'), ...errs } },
  },
  '/api/v1/auth/otp/verify': {
    post: { tags: ['Auth'], summary: 'Verify OTP', operationId: 'authVerifyOtp', security: sec, requestBody: jbody('OTP code', { otp: { type: 'string', minLength: 4, maxLength: 8 } }, ['otp']), responses: { ...r200('OTP verified'), ...errs } },
  },
  '/api/v1/auth/devices': {
    get: { tags: ['Auth'], summary: 'List authenticated devices', operationId: 'authGetDevices', security: sec, responses: { ...r200('Devices', { success: true, data: [{ id: 'uuid', deviceName: 'iPhone 15', platform: 'ios' }] }), ...errs } },
  },
  '/api/v1/auth/devices/{deviceId}': {
    delete: { tags: ['Auth'], summary: 'Revoke device', operationId: 'authRevokeDevice', security: sec, parameters: [strParam('deviceId', 'Device ID')], responses: { ...r200('Device revoked'), ...errs } },
  },
  '/api/v1/auth/account': {
    delete: { tags: ['Auth'], summary: 'Delete own account (3/min rate limit)', operationId: 'authDeleteAccount', security: sec, requestBody: jbody('Confirmation', { confirmPhrase: { type: 'string', example: 'DELETE MY ACCOUNT' } }), responses: { ...r200('Deleted'), ...errs } },
  },

  // PIN
  '/api/v1/pin/create': {
    post: {
      tags: ['PIN'], summary: 'Create PIN', description: 'Weak PINs (sequential, repeated, known) rejected with INVALID_PIN.', operationId: 'pinCreate', security: sec,
      requestBody: jbody('PIN hash', { pin: { type: 'string', description: 'SHA-256 of 6-digit PIN' } }, ['pin']),
      responses: { ...r200('PIN created'), ...errs, '400': { description: 'Weak PIN (INVALID_PIN)' } },
    },
  },
  '/api/v1/pin/verify': {
    post: {
      tags: ['PIN'], summary: 'Verify PIN', operationId: 'pinVerify', security: sec,
      requestBody: jbody('PIN check', { pin: { type: 'string' }, deviceId: { type: 'string' } }, ['pin']),
      responses: { ...r200('Correct'), ...errs, '401': { description: 'Wrong PIN' } },
    },
  },
  '/api/v1/pin/verify-security': {
    post: { tags: ['PIN'], summary: 'Issue security token (biometric)', operationId: 'pinVerifySecurity', security: sec, requestBody: jbody('Biometric', {}), responses: { ...r200('Security token', { success: true, securityToken: 'short-lived' }), ...errs } },
  },
  '/api/v1/pin/update': {
    post: { tags: ['PIN'], summary: 'Change PIN (requires X-Security-Token header)', operationId: 'pinUpdate', security: sec, requestBody: jbody('PIN change', { currentPin: { type: 'string' }, newPin: { type: 'string' } }, ['currentPin', 'newPin']), responses: { ...r200('PIN updated'), ...errs } },
  },
  '/api/v1/pin/status': {
    get: { tags: ['PIN'], summary: 'PIN setup status', operationId: 'pinStatus', security: sec, responses: { ...r200('Status', { success: true, isPinSet: true, lastChangedAt: '2026-01-01', expiresAt: '2026-12-31' }), ...errs } },
  },
  '/api/v1/pin/key-backup': {
    get: { tags: ['PIN'], summary: 'Get encrypted key backup', operationId: 'pinGetBackup', security: sec, responses: { ...r200('Backup', { success: true, backup: 'encrypted-string' }), ...errs, '404': { description: 'No backup' } } },
    post: { tags: ['PIN'], summary: 'Save key backup (requires X-Security-Token)', operationId: 'pinSaveBackup', security: sec, requestBody: jbody('Backup', { backup: { type: 'string' } }, ['backup']), responses: { ...r200('Saved'), ...errs } },
    delete: { tags: ['PIN'], summary: 'Clear key backup', operationId: 'pinClearBackup', security: sec, responses: { ...r200('Cleared'), ...errs } },
  },
  '/api/v1/pin/expiring-soon': {
    get: { tags: ['PIN'], summary: 'Check if PIN expiring soon', operationId: 'pinExpiringSoon', security: sec, responses: { ...r200('Expiry info', { success: true, isExpiringSoon: true, daysRemaining: 5 }), ...errs } },
  },
  '/api/v1/pin/reset': {
    post: { tags: ['PIN'], summary: 'Force reset PIN (Admin only)', operationId: 'pinAdminReset', security: sec, requestBody: jbody('Target', { userId: { type: 'string', format: 'uuid' } }, ['userId']), responses: { ...r200('PIN reset'), ...errs } },
  },
  '/api/v1/pin/self-reset': {
    post: { tags: ['PIN'], summary: 'Self-reset PIN (requires X-Security-Token)', operationId: 'pinSelfReset', security: sec, requestBody: jbody('Self reset', {}), responses: { ...r200('PIN reset'), ...errs } },
  },

  // ACCOUNTS
  '/api/v1/accounts': {
    get: { tags: ['Accounts'], summary: 'List all accounts', operationId: 'getAccounts', security: sec, responses: { ...r200('Accounts', { success: true, data: [{ id: 'uuid', name: 'HDFC Savings', type: 'bank', balance: 25000, currency: 'INR' }] }), ...errs } },
    post: {
      tags: ['Accounts'], summary: 'Create account', description: 'Duplicate name+type per user rejected.', operationId: 'createAccount', security: sec,
      requestBody: jbody('Account', { name: { type: 'string', maxLength: 120, example: 'HDFC Savings' }, type: { type: 'string', enum: ['bank', 'wallet', 'cash', 'credit', 'investment', 'other'], example: 'bank' }, provider: { type: 'string' }, country: { type: 'string' }, balance: { type: 'number', minimum: 0, example: 25000 }, currency: { type: 'string', minLength: 3, maxLength: 3, example: 'INR' }, clientRequestId: { type: 'string' } }, ['name', 'type']),
      responses: { ...r201('Created', { success: true, data: { id: 'uuid', name: 'HDFC Savings', type: 'bank', balance: 25000 } }), ...errs },
    },
  },
  '/api/v1/accounts/{id}': {
    get: { tags: ['Accounts'], summary: 'Get account', operationId: 'getAccount', security: sec, parameters: [uuidParam('id', 'Account UUID')], responses: { ...r200('Account'), ...errs } },
    put: { tags: ['Accounts'], summary: 'Update account', operationId: 'updateAccount', security: sec, parameters: [uuidParam('id', 'Account UUID')], requestBody: jbody('Update', { name: { type: 'string' }, type: { type: 'string' }, provider: { type: 'string' }, country: { type: 'string' }, currency: { type: 'string', minLength: 3, maxLength: 3 } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Accounts'], summary: 'Delete account (soft)', operationId: 'deleteAccount', security: sec, parameters: [uuidParam('id', 'Account UUID')], responses: { ...r200('Deleted'), ...errs } },
  },

  // TRANSACTIONS
  '/api/v1/transactions': {
    get: {
      tags: ['Transactions'], summary: 'List transactions', description: 'Supports accountId, date range, category, pagination.', operationId: 'getTransactions', security: sec,
      parameters: [
        { in: 'query', name: 'accountId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'startDate', schema: { type: 'string', example: '2026-01-01' }, description: 'YYYY-MM-DD or ISO 8601' },
        { in: 'query', name: 'endDate', schema: { type: 'string', example: '2026-12-31' } },
        { in: 'query', name: 'category', schema: { type: 'string', example: 'Food & Dining' } },
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 200, default: 20 } },
      ],
      responses: { ...r200('Transactions', { success: true, data: { transactions: [{ id: 'uuid', type: 'expense', amount: 450, category: 'Food & Dining', date: '2026-06-09' }], totalCount: 142, page: 1, limit: 20 } }), ...errs },
    },
    post: {
      tags: ['Transactions'], summary: 'Create transaction', description: 'Creates income, expense, or transfer. Updates account balance atomically. Dedup via `dedupHash`.', operationId: 'createTransaction', security: sec,
      requestBody: jbody('Transaction', {
        accountId: { type: 'string', format: 'uuid', description: 'Source account' },
        type: { type: 'string', enum: ['income', 'expense', 'transfer'], example: 'expense' },
        amount: { type: 'number', exclusiveMinimum: 0, maximum: 999999999, example: 450 },
        category: { type: 'string', maxLength: 80, example: 'Food & Dining' },
        subcategory: { type: 'string', maxLength: 80 },
        description: { type: 'string', maxLength: 200, example: 'Lunch at cafe' },
        merchant: { type: 'string', maxLength: 120, example: 'Swiggy' },
        date: { type: 'string', example: '2026-06-09', description: 'YYYY-MM-DD or ISO 8601' },
        tags: { type: 'array', items: { type: 'string', maxLength: 40 }, example: ['work'] },
        transferToAccountId: { type: 'string', format: 'uuid', description: 'Required when type=transfer' },
        transferType: { type: 'string', enum: ['self-transfer', 'other-transfer'] },
        expenseMode: { type: 'string', enum: ['individual', 'group', 'loan'] },
        groupExpenseId: { type: 'string', format: 'uuid' },
        dedupHash: { type: 'string', description: 'SHA-256 dedup key' },
      }, ['accountId', 'type', 'amount', 'category', 'date']),
      responses: { ...r201('Created', { success: true, data: { id: 'uuid', type: 'expense', amount: 450, category: 'Food & Dining' } }), ...errs },
    },
  },
  '/api/v1/transactions/{id}': {
    get: { tags: ['Transactions'], summary: 'Get transaction', operationId: 'getTransaction', security: sec, parameters: [uuidParam('id', 'Transaction UUID')], responses: { ...r200('Transaction'), ...errs } },
    put: {
      tags: ['Transactions'], summary: 'Update transaction', description: 'Re-calculates balance deltas.', operationId: 'updateTransaction', security: sec, parameters: [uuidParam('id', 'Transaction UUID')],
      requestBody: jbody('Update', { type: { type: 'string', enum: ['income', 'expense', 'transfer'] }, amount: { type: 'number', exclusiveMinimum: 0 }, category: { type: 'string', maxLength: 80 }, subcategory: { type: 'string' }, description: { type: 'string', maxLength: 200 }, merchant: { type: 'string' }, date: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, transferToAccountId: { type: 'string', format: 'uuid' } }),
      responses: { ...r200('Updated'), ...errs },
    },
    delete: { tags: ['Transactions'], summary: 'Delete transaction (reverses balance)', operationId: 'deleteTransaction', security: sec, parameters: [uuidParam('id', 'Transaction UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/transactions/account/{accountId}': {
    get: { tags: ['Transactions'], summary: 'Get transactions by account', operationId: 'getAccountTransactions', security: sec, parameters: [uuidParam('accountId', 'Account UUID')], responses: { ...r200('Account transactions'), ...errs } },
  },

  // GOALS
  '/api/v1/goals': {
    get: { tags: ['Goals'], summary: 'List savings goals', operationId: 'getGoals', security: sec, responses: { ...r200('Goals', { success: true, data: [{ id: 'uuid', name: 'Emergency Fund', targetAmount: 100000, currentAmount: 25000 }] }), ...errs } },
    post: {
      tags: ['Goals'], summary: 'Create savings goal', description: 'Duplicate names per user rejected.', operationId: 'createGoal', security: sec,
      requestBody: jbody('Goal', { name: { type: 'string', maxLength: 120, example: 'Emergency Fund' }, targetAmount: { type: 'number', exclusiveMinimum: 0, example: 100000 }, targetDate: { type: 'string', format: 'date', example: '2027-01-01' }, category: { type: 'string', maxLength: 80 }, isGroupGoal: { type: 'boolean', default: false }, clientRequestId: { type: 'string' } }, ['name', 'targetAmount', 'targetDate']),
      responses: { ...r201('Created', { success: true, data: { id: 'uuid', name: 'Emergency Fund', targetAmount: 100000, currentAmount: 0 } }), ...errs },
    },
  },
  '/api/v1/goals/{id}': {
    get: { tags: ['Goals'], summary: 'Get goal', operationId: 'getGoal', security: sec, parameters: [uuidParam('id', 'Goal UUID')], responses: { ...r200('Goal'), ...errs } },
    put: { tags: ['Goals'], summary: 'Update goal', operationId: 'updateGoal', security: sec, parameters: [uuidParam('id', 'Goal UUID')], requestBody: jbody('Update', { name: { type: 'string' }, targetAmount: { type: 'number', exclusiveMinimum: 0 }, currentAmount: { type: 'number', minimum: 0 }, targetDate: { type: 'string', format: 'date' }, category: { type: 'string' }, isGroupGoal: { type: 'boolean' } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Goals'], summary: 'Delete goal (soft)', operationId: 'deleteGoal', security: sec, parameters: [uuidParam('id', 'Goal UUID')], responses: { ...r200('Deleted', { success: true, message: 'Goal deleted' }), ...errs } },
  },

  // LOANS
  '/api/v1/loans': {
    get: { tags: ['Loans'], summary: 'List loans', description: 'All loans (borrowed & lent) with payment history.', operationId: 'getLoans', security: sec, responses: { ...r200('Loans', { success: true, data: [{ id: 'uuid', type: 'borrowed', name: 'Home Loan', principalAmount: 500000, outstandingBalance: 480000, status: 'active', payments: [] }] }), ...errs } },
    post: {
      tags: ['Loans'], summary: 'Create loan', description: 'Sets outstandingBalance = principalAmount on creation.', operationId: 'createLoan', security: sec,
      requestBody: jbody('Loan', { type: { type: 'string', enum: ['borrowed', 'lent'], example: 'borrowed' }, name: { type: 'string', maxLength: 120, example: 'Home Loan' }, principalAmount: { type: 'number', exclusiveMinimum: 0, example: 500000 }, interestRate: { type: 'number', minimum: 0, example: 8.5 }, emiAmount: { type: 'number', minimum: 0, example: 4800 }, dueDate: { type: 'string', format: 'date', example: '2026-07-05' }, frequency: { type: 'string', enum: ['monthly', 'quarterly', 'yearly', 'weekly', 'one-time'] }, contactPerson: { type: 'string', maxLength: 120 }, clientRequestId: { type: 'string' } }, ['type', 'name', 'principalAmount']),
      responses: { ...r201('Created', { success: true, data: { id: 'uuid', type: 'borrowed', principalAmount: 500000, outstandingBalance: 500000, status: 'active', payments: [] } }), ...errs },
    },
  },
  '/api/v1/loans/{id}': {
    get: { tags: ['Loans'], summary: 'Get loan', operationId: 'getLoan', security: sec, parameters: [uuidParam('id', 'Loan UUID')], responses: { ...r200('Loan with payments'), ...errs } },
    put: { tags: ['Loans'], summary: 'Update loan', operationId: 'updateLoan', security: sec, parameters: [uuidParam('id', 'Loan UUID')], requestBody: jbody('Update', { name: { type: 'string' }, type: { type: 'string', enum: ['borrowed', 'lent'] }, principalAmount: { type: 'number', exclusiveMinimum: 0 }, outstandingBalance: { type: 'number', minimum: 0 }, interestRate: { type: 'number', minimum: 0 }, emiAmount: { type: 'number', minimum: 0 }, dueDate: { type: 'string', format: 'date' }, frequency: { type: 'string' }, contactPerson: { type: 'string' }, status: { type: 'string', enum: ['active', 'completed', 'defaulted'] } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Loans'], summary: 'Delete loan (soft)', operationId: 'deleteLoan', security: sec, parameters: [uuidParam('id', 'Loan UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/loans/{id}/payment': {
    post: {
      tags: ['Loans'], summary: 'Record EMI / loan payment', description: 'Atomically creates payment and reduces outstanding balance. Marks completed at 0.', operationId: 'addLoanPayment', security: sec, parameters: [uuidParam('id', 'Loan UUID')],
      requestBody: jbody('Payment', { amount: { type: 'number', exclusiveMinimum: 0, example: 4800 }, accountId: { type: 'string', format: 'uuid', description: 'Account to debit' }, notes: { type: 'string', maxLength: 200, example: 'June EMI' } }, ['amount']),
      responses: { ...r201('Payment recorded', { success: true, data: { id: 'uuid', loanId: 'uuid', amount: 4800, date: '2026-06-09T00:00:00Z' } }), ...errs },
    },
  },

  // INVESTMENTS
  '/api/v1/investments': {
    get: { tags: ['Investments'], summary: 'List investments', description: 'Stocks, mutual funds, gold, FD/RD, crypto.', operationId: 'getInvestments', security: sec, responses: { ...r200('Investments', { success: true, data: [{ id: 'uuid', type: 'stocks', name: 'TATA MOTORS', units: 50, purchasePrice: 800, currentPrice: 950 }] }), ...errs } },
    post: {
      tags: ['Investments'], summary: 'Create investment', operationId: 'createInvestment', security: sec,
      requestBody: jbody('Investment', { type: { type: 'string', enum: ['stocks', 'mutualFunds', 'gold', 'fd', 'rd', 'crypto', 'bonds', 'other'], example: 'stocks' }, name: { type: 'string', maxLength: 120, example: 'TATA MOTORS' }, symbol: { type: 'string', maxLength: 20, example: 'TATAMOTORS' }, units: { type: 'number', minimum: 0, example: 50 }, purchasePrice: { type: 'number', minimum: 0, example: 800 }, currentPrice: { type: 'number', minimum: 0 }, purchaseDate: { type: 'string', format: 'date' }, accountId: { type: 'string', format: 'uuid' }, maturityDate: { type: 'string', format: 'date' }, interestRate: { type: 'number', minimum: 0 }, notes: { type: 'string', maxLength: 300 }, clientRequestId: { type: 'string' } }, ['type', 'name']),
      responses: { ...r201('Created'), ...errs },
    },
  },
  '/api/v1/investments/{id}': {
    put: { tags: ['Investments'], summary: 'Update investment', operationId: 'updateInvestment', security: sec, parameters: [uuidParam('id', 'Investment UUID')], requestBody: jbody('Update', { name: { type: 'string' }, units: { type: 'number', minimum: 0 }, currentPrice: { type: 'number', minimum: 0 }, purchasePrice: { type: 'number', minimum: 0 }, notes: { type: 'string' } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Investments'], summary: 'Delete investment', operationId: 'deleteInvestment', security: sec, parameters: [uuidParam('id', 'Investment UUID')], responses: { ...r200('Deleted'), ...errs } },
  },

  // FRIENDS
  '/api/v1/friends': {
    get: { tags: ['Friends'], summary: 'List contacts', operationId: 'getFriends', security: sec, responses: { ...r200('Friends', { success: true, data: [{ id: 'uuid', name: 'Raj Kumar', phone: '9876543210' }] }), ...errs } },
    post: { tags: ['Friends'], summary: 'Add contact', operationId: 'createFriend', security: sec, requestBody: jbody('Friend', { name: { type: 'string', maxLength: 120, example: 'Raj Kumar' }, phone: { type: 'string', maxLength: 20 }, email: { type: 'string', format: 'email' }, upiId: { type: 'string', maxLength: 60 }, linkedUserId: { type: 'string', format: 'uuid' } }, ['name']), responses: { ...r201('Added'), ...errs } },
  },
  '/api/v1/friends/{id}': {
    put: { tags: ['Friends'], summary: 'Update contact', operationId: 'updateFriend', security: sec, parameters: [uuidParam('id', 'Friend UUID')], requestBody: jbody('Update', { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' }, upiId: { type: 'string' } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Friends'], summary: 'Delete contact', operationId: 'deleteFriend', security: sec, parameters: [uuidParam('id', 'Friend UUID')], responses: { ...r200('Deleted'), ...errs } },
  },

  // GROUPS
  '/api/v1/groups': {
    get: { tags: ['Groups'], summary: 'List group expenses', operationId: 'getGroups', security: sec, responses: { ...r200('Groups', { success: true, data: [{ id: 'uuid', name: 'Goa Trip', totalAmount: 12000, splitType: 'equal' }] }), ...errs } },
    post: {
      tags: ['Groups'], summary: 'Create group expense', operationId: 'createGroup', security: sec,
      requestBody: jbody('Group', { name: { type: 'string', maxLength: 120, example: 'Goa Trip' }, description: { type: 'string' }, totalAmount: { type: 'number', minimum: 0 }, category: { type: 'string' }, accountId: { type: 'string', format: 'uuid' }, splitType: { type: 'string', enum: ['equal', 'custom', 'percentage'] }, members: { type: 'array', items: { type: 'object', properties: { friendId: { type: 'string', format: 'uuid' }, share: { type: 'number' }, percentage: { type: 'number' } } } } }, ['name']),
      responses: { ...r201('Created'), ...errs },
    },
  },
  '/api/v1/groups/{id}': {
    put: { tags: ['Groups'], summary: 'Update group expense', operationId: 'updateGroup', security: sec, parameters: [uuidParam('id', 'Group UUID')], requestBody: jbody('Update', { name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['active', 'settled', 'cancelled'] } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Groups'], summary: 'Delete group expense', operationId: 'deleteGroup', security: sec, parameters: [uuidParam('id', 'Group UUID')], responses: { ...r200('Deleted'), ...errs } },
  },

  // TODOS
  '/api/v1/todos': {
    get: { tags: ['Todos'], summary: 'List todos (legacy)', operationId: 'getTodos', security: sec, responses: { ...r200('Todos'), ...errs } },
    post: { tags: ['Todos'], summary: 'Create todo (legacy)', operationId: 'createTodo', security: sec, requestBody: jbody('Todo', { title: { type: 'string', maxLength: 200, example: 'Pay electricity bill' }, dueDate: { type: 'string', format: 'date' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }, ['title']), responses: { ...r201('Created'), ...errs } },
  },
  '/api/v1/todos/{id}': {
    put: { tags: ['Todos'], summary: 'Update todo (legacy)', operationId: 'updateTodo', security: sec, parameters: [uuidParam('id', 'Todo UUID')], requestBody: jbody('Update', { title: { type: 'string' }, completed: { type: 'boolean' }, dueDate: { type: 'string', format: 'date' } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Todos'], summary: 'Delete todo (legacy)', operationId: 'deleteTodo', security: sec, parameters: [uuidParam('id', 'Todo UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/todos/lists': {
    get: { tags: ['Todos'], summary: 'List todo lists (shared)', operationId: 'getTodoLists', security: sec, responses: { ...r200('Lists', { success: true, data: [{ id: 'uuid', title: 'Monthly Bills', itemCount: 5 }] }), ...errs } },
    post: { tags: ['Todos'], summary: 'Create todo list', operationId: 'createTodoList', security: sec, requestBody: jbody('List', { title: { type: 'string', maxLength: 200, example: 'Monthly Bills' }, color: { type: 'string' }, icon: { type: 'string' } }, ['title']), responses: { ...r201('Created'), ...errs } },
  },
  '/api/v1/todos/lists/{id}': {
    put: { tags: ['Todos'], summary: 'Update todo list', operationId: 'updateTodoList', security: sec, parameters: [uuidParam('id', 'List UUID')], requestBody: jbody('Update', { title: { type: 'string' }, color: { type: 'string' }, icon: { type: 'string' } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Todos'], summary: 'Delete todo list', operationId: 'deleteTodoList', security: sec, parameters: [uuidParam('id', 'List UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/todos/items': {
    get: { tags: ['Todos'], summary: 'All todo items across lists', operationId: 'getAllTodoItems', security: sec, responses: { ...r200('Items'), ...errs } },
    post: { tags: ['Todos'], summary: 'Create todo item', operationId: 'createTodoItem', security: sec, requestBody: jbody('Item', { listId: { type: 'string', format: 'uuid' }, title: { type: 'string', maxLength: 500, example: 'Pay internet bill' }, dueDate: { type: 'string', format: 'date' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, amount: { type: 'number', minimum: 0 } }, ['title', 'listId']), responses: { ...r201('Created'), ...errs } },
  },
  '/api/v1/todos/items/{id}': {
    put: { tags: ['Todos'], summary: 'Update todo item', operationId: 'updateTodoItem', security: sec, parameters: [uuidParam('id', 'Item UUID')], requestBody: jbody('Update', { title: { type: 'string' }, completed: { type: 'boolean' }, dueDate: { type: 'string', format: 'date' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Todos'], summary: 'Delete todo item', operationId: 'deleteTodoItem', security: sec, parameters: [uuidParam('id', 'Item UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/todos/lists/{listId}/items': {
    get: { tags: ['Todos'], summary: 'Items in a specific list', operationId: 'getTodoListItems', security: sec, parameters: [uuidParam('listId', 'List UUID')], responses: { ...r200('Items'), ...errs } },
  },
  '/api/v1/todos/shares': {
    get: { tags: ['Todos'], summary: 'My todo list shares', operationId: 'getTodoListShares', security: sec, responses: { ...r200('Shares'), ...errs } },
  },
  '/api/v1/todos/lists/{listId}/share': {
    post: { tags: ['Todos'], summary: 'Share todo list with user', operationId: 'shareTodoList', security: sec, parameters: [uuidParam('listId', 'List UUID')], requestBody: jbody('Share', { targetUserId: { type: 'string', format: 'uuid' }, permission: { type: 'string', enum: ['view', 'edit'], default: 'view' } }, ['targetUserId']), responses: { ...r201('Shared'), ...errs } },
  },
  '/api/v1/todos/shares/{id}': {
    put: { tags: ['Todos'], summary: 'Update share permission', operationId: 'updateTodoShare', security: sec, parameters: [uuidParam('id', 'Share UUID')], requestBody: jbody('Update', { permission: { type: 'string', enum: ['view', 'edit'] } }), responses: { ...r200('Updated'), ...errs } },
    delete: { tags: ['Todos'], summary: 'Remove share', operationId: 'deleteTodoShare', security: sec, parameters: [uuidParam('id', 'Share UUID')], responses: { ...r200('Removed'), ...errs } },
  },

  // SETTINGS
  '/api/v1/settings': {
    get: { tags: ['Settings'], summary: 'Get user preferences', operationId: 'getSettings', security: sec, responses: { ...r200('Settings', { success: true, data: { currency: 'INR', theme: 'light', notificationsEnabled: true, autoSync: true } }), ...errs } },
    put: {
      tags: ['Settings'], summary: 'Update user preferences', operationId: 'updateSettings', security: sec,
      requestBody: jbody('Settings', { currency: { type: 'string', minLength: 3, maxLength: 3, example: 'INR' }, theme: { type: 'string', enum: ['light', 'dark', 'system'] }, language: { type: 'string' }, notificationsEnabled: { type: 'boolean' }, budgetAlerts: { type: 'boolean' }, biometricAuth: { type: 'boolean' }, autoSync: { type: 'boolean' }, monthlyBudget: { type: 'number', minimum: 0 }, savingsTarget: { type: 'number', minimum: 0 }, fiscalMonthStart: { type: 'integer', minimum: 1, maximum: 28 } }),
      responses: { ...r200('Updated'), ...errs },
    },
  },

  // NOTIFICATIONS
  '/api/v1/notifications': {
    get: {
      tags: ['Notifications'], summary: 'List notifications', operationId: 'getNotifications', security: sec,
      parameters: [{ in: 'query', name: 'page', schema: { type: 'integer', default: 1 } }, { in: 'query', name: 'limit', schema: { type: 'integer', default: 20, maximum: 100 } }, { in: 'query', name: 'unreadOnly', schema: { type: 'boolean', default: false } }],
      responses: { ...r200('Notifications', { success: true, data: { notifications: [{ id: 'uuid', type: 'PAYMENT_RECEIVED', title: 'Payment received', isRead: false }], unreadCount: 3 } }), ...errs },
    },
    delete: { tags: ['Notifications'], summary: 'Clear all notifications', operationId: 'clearAllNotifications', security: sec, responses: { ...r200('Cleared'), ...errs } },
  },
  '/api/v1/notifications/unread/count': {
    get: { tags: ['Notifications'], summary: 'Unread notification count', operationId: 'getUnreadCount', security: sec, responses: { ...r200('Count', { success: true, data: { count: 5 } }), ...errs } },
  },
  '/api/v1/notifications/mark-all-read': {
    post: { tags: ['Notifications'], summary: 'Mark all as read', operationId: 'markAllNotificationsRead', security: sec, requestBody: jbody('Mark all', {}), responses: { ...r200('All marked read'), ...errs } },
  },
  '/api/v1/notifications/send': {
    post: { tags: ['Notifications'], summary: 'Send notification (Admin only)', operationId: 'adminSendNotification', security: sec, requestBody: jbody('Notification', { userId: { type: 'string', format: 'uuid' }, type: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, data: { type: 'object', additionalProperties: true } }, ['userId', 'type', 'title', 'body']), responses: { ...r201('Sent'), ...errs } },
  },
  '/api/v1/notifications/{id}': {
    get: { tags: ['Notifications'], summary: 'Get notification', operationId: 'getNotification', security: sec, parameters: [uuidParam('id', 'Notification UUID')], responses: { ...r200('Notification'), ...errs } },
    delete: { tags: ['Notifications'], summary: 'Delete notification', operationId: 'deleteNotification', security: sec, parameters: [uuidParam('id', 'Notification UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/notifications/{id}/read': {
    put: { tags: ['Notifications'], summary: 'Mark notification as read', operationId: 'markNotificationRead', security: sec, parameters: [uuidParam('id', 'Notification UUID')], responses: { ...r200('Marked read'), ...errs } },
  },

  // SYNC
  '/api/v1/sync/pull': {
    post: {
      tags: ['Sync'], summary: 'Pull delta changes from cloud', description: 'Returns records updated after `lastSyncedAt`. Used by Dexie offline-first sync engine.', operationId: 'syncPull', security: sec,
      requestBody: jbody('Pull params', {
        deviceId: { type: 'string', example: 'device_abc123' },
        lastSyncedAt: { type: 'string', format: 'date-time', example: '2026-06-08T10:00:00.000Z', description: 'ISO 8601 timestamp of last sync' },
        entityTypes: { type: 'array', items: { type: 'string', enum: ['accounts', 'transactions', 'goals', 'loans', 'investments', 'friends', 'group_expenses', 'to_do_lists', 'to_do_items', 'to_do_list_shares'] }, example: ['accounts', 'transactions'] },
      }, ['deviceId']),
      responses: { ...r200('Delta data', { success: true, data: { accounts: [], transactions: [{ id: 'uuid', updatedAt: '2026-06-09T10:00:00Z' }], syncedAt: '2026-06-09T10:01:00Z' } }), ...errs },
    },
  },
  '/api/v1/sync/push': {
    post: {
      tags: ['Sync'], summary: 'Push local changes to cloud', description: 'Upserts or deletes local device changes in the backend.', operationId: 'syncPush', security: sec,
      requestBody: jbody('Push payload', {
        deviceId: { type: 'string', example: 'device_abc123' },
        entities: { type: 'array', items: { type: 'object', required: ['entityType', 'operation', 'data'], properties: { entityType: { type: 'string', example: 'transaction' }, operation: { type: 'string', enum: ['upsert', 'delete'] }, data: { type: 'object', additionalProperties: true } } } },
      }, ['deviceId', 'entities']),
      responses: { ...r200('Push result', { success: true, data: { processed: 5, failed: 0, conflicts: [] } }), ...errs },
    },
  },
  '/api/v1/sync/register-device': {
    post: { tags: ['Sync'], summary: 'Register sync device (idempotent)', operationId: 'syncRegisterDevice', security: sec, requestBody: jbody('Registration', { deviceId: { type: 'string', example: 'device_abc123' }, deviceName: { type: 'string' }, deviceType: { type: 'string' }, platform: { type: 'string', enum: ['ios', 'android', 'web'] }, appVersion: { type: 'string' } }, ['deviceId']), responses: { ...r200('Registered'), ...errs } },
  },
  '/api/v1/sync/devices': {
    get: { tags: ['Sync'], summary: 'List sync devices', operationId: 'syncGetDevices', security: sec, responses: { ...r200('Devices', { success: true, devices: [{ id: 'uuid', deviceId: 'device_abc123', platform: 'ios', isActive: true }] }), ...errs } },
  },
  '/api/v1/sync/deactivate-device': {
    post: { tags: ['Sync'], summary: 'Deactivate sync device', operationId: 'syncDeactivateDevice', security: sec, requestBody: jbody('Deactivate', { deviceId: { type: 'string' } }, ['deviceId']), responses: { ...r200('Deactivated'), ...errs } },
  },

  // DASHBOARD
  '/api/v1/dashboard/summary': {
    get: {
      tags: ['Dashboard'], summary: 'Financial dashboard summary', description: 'Net worth, income/expense totals, top categories, recent transactions, goals progress.', operationId: 'getDashboardSummary', security: sec,
      responses: { ...r200('Summary', { success: true, data: { netWorth: 125000, totalIncome: 80000, totalExpenses: 45000, savingsRate: 43.75, topCategories: [{ category: 'Food & Dining', amount: 8500 }], goalsProgress: [{ id: 'uuid', name: 'Emergency Fund', progress: 25 }] } }), ...errs },
    },
  },
  '/api/v1/dashboard/cashflow': {
    get: {
      tags: ['Dashboard'], summary: 'Monthly cashflow breakdown', operationId: 'getDashboardCashflow', security: sec,
      parameters: [{ in: 'query', name: 'months', schema: { type: 'integer', minimum: 1, maximum: 24, default: 6 } }],
      responses: { ...r200('Cashflow', { success: true, data: { months: [{ month: 'Jun 2026', income: 80000, expenses: 45000, savings: 35000 }] } }), ...errs },
    },
  },

  // ADVISORS
  '/api/v1/advisors': {
    get: {
      tags: ['Advisors'], summary: 'List approved advisors (public)', operationId: 'listAdvisors',
      parameters: [{ in: 'query', name: 'specialization', schema: { type: 'string' } }, { in: 'query', name: 'language', schema: { type: 'string' } }, { in: 'query', name: 'minRating', schema: { type: 'number' } }],
      responses: { ...r200('Advisors', { success: true, data: [{ id: 'uuid', name: 'Priya Mehta', specialization: ['tax'], rating: 4.8, hourlyRate: 1500 }] }), ...errs },
    },
  },
  '/api/v1/advisors/{id}': {
    get: { tags: ['Advisors'], summary: 'Get advisor profile (public)', operationId: 'getAdvisor', parameters: [uuidParam('id', 'Advisor UUID')], responses: { ...r200('Advisor'), ...errs } },
  },
  '/api/v1/advisors/apply': {
    post: { tags: ['Advisors'], summary: 'Apply to become advisor', operationId: 'applyAsAdvisor', security: sec, requestBody: jbody('Application', { bio: { type: 'string', maxLength: 2000 }, specializations: { type: 'array', items: { type: 'string' } }, qualifications: { type: 'array', items: { type: 'string' } }, yearsExperience: { type: 'integer', minimum: 0 }, languages: { type: 'array', items: { type: 'string' } }, hourlyRate: { type: 'number', minimum: 0 } }, ['bio', 'specializations', 'qualifications']), responses: { ...r201('Application submitted'), ...errs } },
  },
  '/api/v1/advisors/availability': {
    post: { tags: ['Advisors'], summary: 'Set availability slot (Advisor only)', operationId: 'setAdvisorAvailability', security: sec, requestBody: jbody('Slot', { dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, example: 1 }, startTime: { type: 'string', example: '09:00' }, endTime: { type: 'string', example: '17:00' } }, ['dayOfWeek', 'startTime', 'endTime']), responses: { ...r201('Set'), ...errs } },
  },
  '/api/v1/advisors/availability/status': {
    put: { tags: ['Advisors'], summary: 'Toggle availability (Advisor only)', operationId: 'setAdvisorAvailabilityStatus', security: sec, requestBody: jbody('Status', { isActive: { type: 'boolean' } }, ['isActive']), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/advisors/{id}/availability': {
    get: { tags: ['Advisors'], summary: 'Get advisor availability', operationId: 'getAdvisorAvailability', parameters: [uuidParam('id', 'Advisor UUID')], responses: { ...r200('Slots'), ...errs } },
  },
  '/api/v1/advisors/availability/{id}': {
    delete: { tags: ['Advisors'], summary: 'Delete availability slot (Advisor only)', operationId: 'deleteAdvisorAvailability', security: sec, parameters: [uuidParam('id', 'Availability UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/advisors/me/sessions': {
    get: { tags: ['Advisors'], summary: 'My sessions (Advisor only)', operationId: 'getAdvisorSessions', security: sec, responses: { ...r200('Sessions'), ...errs } },
  },
  '/api/v1/advisors/sessions/{id}/rate': {
    put: { tags: ['Advisors'], summary: 'Rate session (Client)', operationId: 'rateAdvisorSession', security: sec, parameters: [uuidParam('id', 'Session UUID')], requestBody: jbody('Rating', { rating: { type: 'number', minimum: 1, maximum: 5, example: 4.5 }, feedback: { type: 'string', maxLength: 1000 } }, ['rating']), responses: { ...r200('Rated'), ...errs } },
  },
  '/api/v1/advisors/admin/applications': {
    get: { tags: ['Advisors'], summary: 'Pending advisor applications (Admin/Manager)', operationId: 'listPendingAdvisors', security: sec, responses: { ...r200('Applications'), ...errs } },
  },
  '/api/v1/advisors/admin/{id}/approve': {
    put: { tags: ['Advisors'], summary: 'Approve advisor (Admin/Manager)', operationId: 'approveAdvisorApplication', security: sec, parameters: [uuidParam('id', 'Advisor UUID')], responses: { ...r200('Approved'), ...errs } },
  },
  '/api/v1/advisors/admin/{id}/reject': {
    put: { tags: ['Advisors'], summary: 'Reject advisor (Admin/Manager)', operationId: 'rejectAdvisorApplication', security: sec, parameters: [uuidParam('id', 'Advisor UUID')], requestBody: jbody('Reason', { reason: { type: 'string', maxLength: 500 } }), responses: { ...r200('Rejected'), ...errs } },
  },

  // BOOKINGS
  '/api/v1/bookings': {
    get: {
      tags: ['Bookings'], summary: 'List bookings', description: 'Returns bookings for the authenticated user as client or advisor.', operationId: 'getBookings', security: sec,
      parameters: [{ in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'] } }, { in: 'query', name: 'role', schema: { type: 'string', enum: ['client', 'advisor'] } }],
      responses: { ...r200('Bookings', { success: true, data: [{ id: 'uuid', sessionType: 'video', status: 'pending', proposedDate: '2026-07-01' }] }), ...errs },
    },
    post: {
      tags: ['Bookings'], summary: 'Create booking request', description: 'Status starts as `pending`. Requires `bookAdvisor` feature.', operationId: 'createBooking', security: sec,
      requestBody: jbody('Booking', { advisorId: { type: 'string', format: 'uuid' }, sessionType: { type: 'string', enum: ['video', 'audio', 'chat', 'in-person'], example: 'video' }, description: { type: 'string', maxLength: 500 }, proposedDate: { type: 'string', format: 'date', example: '2026-07-01' }, proposedTime: { type: 'string', example: '18:00' }, duration: { type: 'integer', minimum: 15, example: 60 }, amount: { type: 'number', minimum: 0, example: 1499 } }, ['advisorId', 'sessionType', 'proposedDate', 'proposedTime', 'duration', 'amount']),
      responses: { ...r201('Booking created', { success: true, data: { id: 'uuid', status: 'pending', amount: 1499 } }), ...errs },
    },
  },
  '/api/v1/bookings/{id}': {
    get: { tags: ['Bookings'], summary: 'Get booking', operationId: 'getBooking', security: sec, parameters: [uuidParam('id', 'Booking UUID')], responses: { ...r200('Booking'), ...errs } },
  },
  '/api/v1/bookings/{id}/accept': {
    put: { tags: ['Bookings'], summary: 'Accept booking (Advisor only)', description: 'Creates AdvisorSession.', operationId: 'acceptBooking', security: sec, parameters: [uuidParam('id', 'Booking UUID')], requestBody: jbody('Accept', { notes: { type: 'string', maxLength: 300 } }), responses: { ...r200('Accepted, session created'), ...errs } },
  },
  '/api/v1/bookings/{id}/reject': {
    put: { tags: ['Bookings'], summary: 'Reject booking (Advisor only)', operationId: 'rejectBooking', security: sec, parameters: [uuidParam('id', 'Booking UUID')], requestBody: jbody('Reason', { reason: { type: 'string', maxLength: 500, example: 'Slot unavailable' } }, ['reason']), responses: { ...r200('Rejected'), ...errs } },
  },
  '/api/v1/bookings/{id}/reschedule': {
    put: { tags: ['Bookings'], summary: 'Reschedule booking (Advisor only)', operationId: 'rescheduleBooking', security: sec, parameters: [uuidParam('id', 'Booking UUID')], requestBody: jbody('New schedule', { proposedDate: { type: 'string', format: 'date' }, proposedTime: { type: 'string' }, reason: { type: 'string' } }, ['proposedDate', 'proposedTime']), responses: { ...r200('Rescheduled'), ...errs } },
  },
  '/api/v1/bookings/{id}/cancel': {
    put: { tags: ['Bookings'], summary: 'Cancel booking (any party)', operationId: 'cancelBooking', security: sec, parameters: [uuidParam('id', 'Booking UUID')], requestBody: jbody('Reason', { reason: { type: 'string', maxLength: 300 } }), responses: { ...r200('Cancelled'), ...errs } },
  },
  '/api/v1/bookings/workspace/clients': {
    get: { tags: ['Bookings'], summary: 'Advisor client list (Advisor only)', operationId: 'getAdvisorClients', security: sec, responses: { ...r200('Clients'), ...errs } },
  },
  '/api/v1/bookings/{bookingId}/fee/pay': {
    post: { tags: ['Bookings'], summary: 'Mark fee as paid (Advisor only)', operationId: 'markFeePaid', security: sec, parameters: [uuidParam('bookingId', 'Booking UUID')], requestBody: jbody('Fee', { paymentReference: { type: 'string' } }), responses: { ...r200('Marked paid'), ...errs } },
  },

  // SESSIONS
  '/api/v1/sessions/{id}': {
    get: { tags: ['Sessions'], summary: 'Get session details', operationId: 'getSession', security: sec, parameters: [uuidParam('id', 'Session UUID')], responses: { ...r200('Session', { success: true, data: { id: 'uuid', status: 'scheduled', startTime: '2026-07-01T18:00:00Z' } }), ...errs } },
  },
  '/api/v1/sessions/{id}/messages': {
    get: { tags: ['Sessions'], summary: 'Get chat messages', operationId: 'getSessionMessages', security: sec, parameters: [uuidParam('id', 'Session UUID'), { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } }, { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } }], responses: { ...r200('Messages', { success: true, data: [{ id: 'uuid', senderId: 'uuid', message: 'Hello!', timestamp: '2026-07-01T18:05:00Z' }] }), ...errs } },
    post: { tags: ['Sessions'], summary: 'Send chat message', operationId: 'sendSessionMessage', security: sec, parameters: [uuidParam('id', 'Session UUID')], requestBody: jbody('Message', { message: { type: 'string', minLength: 1, maxLength: 2000, example: 'Review my portfolio.' } }, ['message']), responses: { ...r201('Sent'), ...errs } },
  },
  '/api/v1/sessions/{id}/start': {
    post: { tags: ['Sessions'], summary: 'Start session (Advisor only)', operationId: 'startSession', security: sec, parameters: [uuidParam('id', 'Session UUID')], requestBody: jbody('Start', {}), responses: { ...r200('Started'), ...errs } },
  },
  '/api/v1/sessions/{id}/complete': {
    post: { tags: ['Sessions'], summary: 'Complete session (Advisor only)', operationId: 'completeSession', security: sec, parameters: [uuidParam('id', 'Session UUID')], requestBody: jbody('Completion', { notes: { type: 'string', maxLength: 2000 } }), responses: { ...r200('Completed'), ...errs } },
  },
  '/api/v1/sessions/{id}/cancel': {
    post: { tags: ['Sessions'], summary: 'Cancel session', operationId: 'cancelSession', security: sec, parameters: [uuidParam('id', 'Session UUID')], requestBody: jbody('Reason', { reason: { type: 'string', maxLength: 300 } }), responses: { ...r200('Cancelled'), ...errs } },
  },

  // PAYMENTS
  '/api/v1/payments/webhook': {
    post: { tags: ['Payments'], summary: 'Stripe webhook (public, no JWT)', description: 'Stripe signature verified internally.', operationId: 'paymentsWebhook', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Processed' }, '400': { description: 'Invalid signature' } } },
  },
  '/api/v1/payments': {
    get: { tags: ['Payments'], summary: 'List payments', operationId: 'getPayments', security: sec, responses: { ...r200('Payments', { success: true, data: [{ id: 'uuid', sessionId: 'uuid', amount: 1499, status: 'completed' }] }), ...errs } },
  },
  '/api/v1/payments/{id}': {
    get: { tags: ['Payments'], summary: 'Get payment', operationId: 'getPayment', security: sec, parameters: [uuidParam('id', 'Payment UUID')], responses: { ...r200('Payment'), ...errs } },
  },
  '/api/v1/payments/initiate': {
    post: { tags: ['Payments'], summary: 'Initiate Stripe checkout', description: 'Returns Stripe checkout URL.', operationId: 'initiatePayment', security: sec, requestBody: jbody('Initiate', { bookingId: { type: 'string', format: 'uuid' }, successUrl: { type: 'string', format: 'uri' }, cancelUrl: { type: 'string', format: 'uri' } }, ['bookingId']), responses: { ...r201('Checkout created', { success: true, data: { checkoutUrl: 'https://checkout.stripe.com/...' } }), ...errs } },
  },
  '/api/v1/payments/complete': {
    post: { tags: ['Payments'], summary: 'Confirm payment', operationId: 'completePayment', security: sec, requestBody: jbody('Confirm', { paymentIntentId: { type: 'string', example: 'pi_abc123' } }, ['paymentIntentId']), responses: { ...r200('Confirmed'), ...errs } },
  },
  '/api/v1/payments/fail': {
    post: { tags: ['Payments'], summary: 'Record payment failure', operationId: 'failPayment', security: sec, requestBody: jbody('Failure', { paymentIntentId: { type: 'string' }, reason: { type: 'string' } }, ['paymentIntentId']), responses: { ...r200('Recorded'), ...errs } },
  },
  '/api/v1/payments/refund': {
    post: { tags: ['Payments'], summary: 'Refund payment (Stripe)', operationId: 'refundPayment', security: sec, requestBody: jbody('Refund', { paymentId: { type: 'string', format: 'uuid' }, reason: { type: 'string', maxLength: 300 }, amount: { type: 'number', description: 'Partial amount; omit for full refund' } }, ['paymentId']), responses: { ...r200('Refund initiated'), ...errs } },
  },

  // AI
  '/api/v1/ai/events': {
    post: { tags: ['AI'], summary: 'Capture AI event', operationId: 'captureAIEvent', security: sec, requestBody: jbody('Event', { eventType: { type: 'string', example: 'transaction_categorized' }, payload: { type: 'object', additionalProperties: true } }, ['eventType']), responses: { ...r200('Captured'), ...errs } },
  },
  '/api/v1/ai/quota': {
    get: { tags: ['AI'], summary: 'AI usage quota', operationId: 'getAIQuota', security: sec, responses: { ...r200('Quota', { used: 45, limit: 200, resetAt: '2026-07-01T00:00:00Z', plan: 'standard' }), ...errs } },
  },
  '/api/v1/ai/insights': {
    get: {
      tags: ['AI'], summary: 'Consolidated AI insights (all agents)', description: 'Health score, recommendations, fraud alerts, bill predictions. Requires `aiAutomation` feature.', operationId: 'getAIInsights', security: sec,
      responses: { ...r200('Insights', { healthScore: 72, recommendations: [{ title: 'Reduce food spending', priority: 9 }], fraudAlerts: [], upcomingBills: [{ vendor: 'Netflix', predictedDate: '2026-06-20', amount: 649 }] }), ...errs },
    },
  },
  '/api/v1/ai/health-score': {
    get: { tags: ['AI'], summary: 'Financial health score (0-100)', operationId: 'getFinancialHealthScore', security: sec, responses: { ...r200('Score', { score: 72, breakdown: { savings: 80, debt: 60, spending: 70, goals: 78 }, trend: 'improving' }), ...errs } },
  },
  '/api/v1/ai/recommendations': {
    get: { tags: ['AI'], summary: 'AI recommendations (budget, goals, investments)', operationId: 'getAIRecommendations', security: sec, responses: { ...r200('Recommendations', { recommendations: [{ title: 'Increase SIP by ₹2,000', category: 'investments', priority: 8 }] }), ...errs } },
  },
  '/api/v1/ai/fraud-alerts': {
    get: { tags: ['AI'], summary: 'Fraud detection alerts', operationId: 'getAIFraudAlerts', security: sec, responses: { ...r200('Alerts', { flags: [{ transactionId: 'uuid', reason: 'Unusual merchant', severity: 'high', amount: 5000 }] }), ...errs } },
  },
  '/api/v1/ai/bill-predictions': {
    get: { tags: ['AI'], summary: 'Predicted upcoming bills', operationId: 'getAIBillPredictions', security: sec, responses: { ...r200('Predictions', { predictions: [{ vendor: 'Netflix', predictedDate: '2026-06-20', predictedAmount: 649, confidence: 0.95 }] }), ...errs } },
  },
  '/api/v1/ai/spending-patterns': {
    get: { tags: ['AI'], summary: 'Spending pattern analysis', operationId: 'getAISpendingPatterns', security: sec, responses: { ...r200('Patterns', { insights: [{ type: 'weekend_spike', message: 'You spend 40% more on weekends' }] }), ...errs } },
  },

  // VOICE
  '/api/v1/voice/process': {
    post: { tags: ['Voice'], summary: 'Parse voice transcript to financial intents', description: 'NLP parses text and extracts actions. Requires `voiceAssistant` feature.', operationId: 'processVoice', security: sec, requestBody: jbody('Transcript', { transcript: { type: 'string', minLength: 1, maxLength: 5000, example: 'I spent 450 rupees on lunch at Swiggy today' } }, ['transcript']), responses: { ...r200('Intents', { success: true, data: { intents: [{ action: 'add_expense', amount: 450, category: 'Food & Dining', merchant: 'Swiggy' }], confidence: 0.92 } }), ...errs } },
  },
  '/api/v1/voice/process-audio': {
    post: { tags: ['Voice'], summary: 'Transcribe + process audio file', description: 'Uploads audio → transcribes → parses as voice command.', operationId: 'processVoiceAudio', security: sec, requestBody: mpart('Audio upload', { audio: { type: 'string', format: 'binary', description: 'wav, mp3, webm, ogg' } }), responses: { ...r200('Intents'), ...errs } },
  },
  '/api/v1/voice/learn': {
    post: { tags: ['Voice'], summary: 'Record voice correction', operationId: 'voiceLearn', security: sec, requestBody: jbody('Correction', { originalSegment: { type: 'string', example: 'fifty rupees food' }, correctedType: { type: 'string', enum: ['income', 'expense', 'transfer'] }, correctedCategory: { type: 'string' }, correctedAmount: { type: 'number' } }, ['originalSegment']), responses: { ...r200('Recorded'), ...errs } },
  },

  // RECEIPTS
  '/api/v1/receipts/start': {
    post: { tags: ['Receipts'], summary: 'Start async receipt OCR scan', description: 'Queues image for OCR. Poll /receipts/status/:jobId. Rate: 10/min.', operationId: 'startReceiptScan', security: sec, requestBody: mpart('Receipt', { file: { type: 'string', format: 'binary', description: 'jpg, png, webp, pdf. Max 10MB.' } }), responses: { ...r201('Queued', { success: true, data: { jobId: 'job_abc123', status: 'queued' } }), ...errs } },
  },
  '/api/v1/receipts/status/{jobId}': {
    get: { tags: ['Receipts'], summary: 'Get receipt scan status', operationId: 'getReceiptScanStatus', security: sec, parameters: [strParam('jobId', 'Job ID from /receipts/start')], responses: { ...r200('Status', { success: true, data: { jobId: 'job_abc123', status: 'completed', result: { merchant: 'Swiggy', total: 450, date: '2026-06-09', category: 'Food & Dining' } } }), ...errs } },
  },
  '/api/v1/receipts/scan': {
    post: { tags: ['Receipts'], summary: 'Synchronous receipt scan (deprecated)', description: 'Legacy sync OCR. Use /receipts/start for new integrations. Rate: 8/min.', operationId: 'scanReceiptSync', security: sec, parameters: [{ in: 'query', name: 'engine', schema: { type: 'string', enum: ['tesseract', 'cloud', 'auto'] } }], requestBody: mpart('Receipt', { file: { type: 'string', format: 'binary', description: 'jpg, png, webp, pdf. Max 10MB.' } }), responses: { ...r200('OCR result', { success: true, data: { merchant: 'Swiggy', total: 450, date: '2026-06-09', category: 'Food & Dining' } }), ...errs } },
  },

  // BILLS
  '/api/v1/bills': {
    get: { tags: ['Bills'], summary: 'List uploaded bills', operationId: 'getBills', security: sec, responses: { ...r200('Bills', { success: true, data: [{ id: 'uuid', filename: 'electricity-bill.pdf', vendor: 'BESCOM', amount: 1250, status: 'processed' }] }), ...errs } },
    post: { tags: ['Bills'], summary: 'Upload bill document (rate: 10/min)', operationId: 'uploadBill', security: sec, requestBody: mpart('Bill', { file: { type: 'string', format: 'binary', description: 'jpg, png, pdf. Max 10MB.' } }), responses: { ...r201('Uploaded', { success: true, data: { id: 'uuid', filename: 'bill.pdf', status: 'processing' } }), ...errs } },
  },
  '/api/v1/bills/{id}': {
    delete: { tags: ['Bills'], summary: 'Delete bill', operationId: 'deleteBill', security: sec, parameters: [uuidParam('id', 'Bill UUID')], responses: { ...r200('Deleted'), ...errs } },
  },

  // DEVICES
  '/api/v1/devices': {
    get: { tags: ['Devices'], summary: 'List registered devices', operationId: 'getDevices', security: sec, responses: { ...r200('Devices', { success: true, data: [{ id: 'uuid', deviceId: 'device_abc', deviceName: 'iPhone 15', platform: 'ios', isActive: true }] }), ...errs } },
    post: { tags: ['Devices'], summary: 'Register or update device', description: 'Registers device for push notifications and sync.', operationId: 'registerDevice', security: sec, requestBody: jbody('Device', { deviceId: { type: 'string', example: 'device_abc123' }, deviceName: { type: 'string' }, deviceType: { type: 'string' }, osType: { type: 'string', enum: ['ios', 'android', 'web'] }, osVersion: { type: 'string' }, fcmToken: { type: 'string', description: 'Firebase token (Android/Web)' }, apnsToken: { type: 'string', description: 'APNS token (iOS)' } }, ['deviceId']), responses: { ...r200('Registered'), ...errs } },
  },
  '/api/v1/devices/{deviceId}': {
    get: { tags: ['Devices'], summary: 'Get device', operationId: 'getDevice', security: sec, parameters: [strParam('deviceId', 'Device ID')], responses: { ...r200('Device'), ...errs } },
    delete: { tags: ['Devices'], summary: 'Delete device', operationId: 'deleteDevice', security: sec, parameters: [strParam('deviceId', 'Device ID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/devices/{deviceId}/sync': {
    post: { tags: ['Devices'], summary: 'Update device sync timestamp', operationId: 'updateDeviceSync', security: sec, parameters: [strParam('deviceId', 'Device ID')], requestBody: jbody('Sync', { lastSyncAt: { type: 'string', format: 'date-time' } }), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/devices/{deviceId}/tokens': {
    put: { tags: ['Devices'], summary: 'Update push notification tokens', operationId: 'updateDeviceTokens', security: sec, parameters: [strParam('deviceId', 'Device ID')], requestBody: jbody('Tokens', { fcmToken: { type: 'string' }, apnsToken: { type: 'string' } }), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/devices/{deviceId}/deactivate': {
    post: { tags: ['Devices'], summary: 'Deactivate device', operationId: 'deactivateDevice', security: sec, parameters: [strParam('deviceId', 'Device ID')], requestBody: jbody('Deactivate', {}), responses: { ...r200('Deactivated'), ...errs } },
  },

  // STOCKS
  '/api/v1/stocks/markets': {
    get: { tags: ['Stocks'], summary: 'Get market indices (public)', description: 'NIFTY 50, SENSEX, global indices.', operationId: 'getMarkets', responses: { ...r200('Markets', { success: true, data: [{ index: 'NIFTY 50', value: 24500, change: 125, changePercent: 0.51 }] }), ...errs } },
  },
  '/api/v1/stocks/search': {
    get: { tags: ['Stocks'], summary: 'Search stocks (public)', operationId: 'searchStocks', parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string', minLength: 1 }, description: 'Company or ticker', example: 'TATA' }], responses: { ...r200('Results', { success: true, data: [{ symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE', type: 'equity' }] }), ...errs } },
  },
  '/api/v1/stocks/stock': {
    get: { tags: ['Stocks'], summary: 'Get stock quote (public)', operationId: 'getStockQuote', parameters: [{ in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, example: 'TATAMOTORS' }, { in: 'query', name: 'exchange', schema: { type: 'string' }, example: 'NSE' }], responses: { ...r200('Quote', { symbol: 'TATAMOTORS', lastPrice: 950.5, change: 15.3, changePercent: 1.63, volume: 2500000 }), ...errs } },
  },
  '/api/v1/stocks/batch': {
    get: { tags: ['Stocks'], summary: 'Batch stock quotes (public)', operationId: 'getBatchStockQuotes', parameters: [{ in: 'query', name: 'symbols', required: true, schema: { type: 'string' }, description: 'Comma-separated tickers', example: 'TATAMOTORS,INFY,RELIANCE' }], responses: { ...r200('Batch quotes', { TATAMOTORS: { lastPrice: 950, change: 15 }, INFY: { lastPrice: 1650, change: -5 } }), ...errs } },
  },

  // CATEGORIZATION
  '/api/v1/categorize': {
    post: { tags: ['Categorization'], summary: 'Auto-categorize transaction', description: 'ML model predicts category from description, merchant, amount.', operationId: 'categorizeTransaction', security: sec, requestBody: jbody('Input', { description: { type: 'string', example: 'Swiggy order #12345' }, merchant: { type: 'string' }, amount: { type: 'number' } }, ['description']), responses: { ...r200('Prediction', { success: true, data: { category: 'Food & Dining', subcategory: 'Restaurant', confidence: 0.94 } }), ...errs } },
  },
  '/api/v1/learn': {
    post: { tags: ['Categorization'], summary: 'Record categorization correction', description: 'Improves future accuracy.', operationId: 'learnCategorization', security: sec, requestBody: jbody('Correction', { description: { type: 'string' }, merchant: { type: 'string' }, correctCategory: { type: 'string', example: 'Food & Dining' }, correctSubcategory: { type: 'string' } }, ['description', 'correctCategory']), responses: { ...r200('Recorded'), ...errs } },
  },

  // IMPORT
  '/api/v1/import/upload': {
    post: { tags: ['Import'], summary: 'Upload bank statement (CSV/Excel) for preview', description: 'Parses statement with AI categorization. Max 10MB.', operationId: 'uploadImport', security: sec, requestBody: mpart('Statement', { file: { type: 'string', format: 'binary', description: '.csv, .xlsx, .xls' } }), responses: { ...r201('Preview', { success: true, data: { sessionId: 'session_abc123', transactions: [{ row: 1, date: '2026-06-01', description: 'ATM Withdrawal', amount: -2000, suggestedCategory: 'Cash' }], totalRows: 45, validRows: 43 } }), ...errs } },
  },
  '/api/v1/import/confirm': {
    post: { tags: ['Import'], summary: 'Confirm and save imported transactions', operationId: 'confirmImport', security: sec, requestBody: jbody('Confirm', { sessionId: { type: 'string', example: 'session_abc123' }, overrides: { type: 'object', additionalProperties: { type: 'object', properties: { category: { type: 'string' }, subcategory: { type: 'string' }, amount: { type: 'number' }, description: { type: 'string' } } }, example: { '1': { category: 'Food & Dining' } } } }, ['sessionId']), responses: { ...r200('Imported', { success: true, data: { imported: 43, skipped: 2, duplicatesSkipped: 1 } }), ...errs } },
  },
  '/api/v1/import/{sessionId}': {
    get: { tags: ['Import'], summary: 'Get import session preview', operationId: 'getImportSession', security: sec, parameters: [strParam('sessionId', 'Session ID')], responses: { ...r200('Session'), ...errs } },
  },

  // AVATARS
  '/api/v1/avatars/dicebear/{style}/svg': {
    get: {
      tags: ['Avatars'], summary: 'Get DiceBear avatar SVG (public)', description: 'XSS-sanitized SVG proxy. Cached 1 week.', operationId: 'getDiceBearAvatar',
      parameters: [
        { in: 'path', name: 'style', required: true, schema: { type: 'string', enum: ['avataaars', 'micah', 'lorelei', 'big-smile', 'bottts'] }, example: 'avataaars' },
        { in: 'query', name: 'seed', required: true, schema: { type: 'string', maxLength: 100, pattern: '^[a-zA-Z0-9\\-_ ]+$' }, description: 'Deterministic seed', example: 'asha-sharma' },
      ],
      responses: { '200': { description: 'SVG image', content: { 'image/svg+xml': { schema: { type: 'string', format: 'binary' } } } }, '400': { description: 'Invalid style/seed' }, '502': { description: 'DiceBear upstream error' } },
    },
  },

  // ADMIN
  '/api/v1/admin/features': {
    get: { tags: ['Admin'], summary: 'Get feature flags (any authenticated user)', description: 'Used by frontend to gate UI features.', operationId: 'adminGetFeatureFlags', security: sec, responses: { ...r200('Flags', { success: true, data: { accounts: true, transactions: true, aiInsights: true, voiceAssistant: false } }), ...errs } },
  },
  '/api/v1/admin/ai-features': {
    get: { tags: ['Admin'], summary: 'Get AI feature flags (any authenticated user)', operationId: 'adminGetAIFeatureFlags', security: sec, responses: { ...r200('AI flags', { success: true, data: { aiAutomation: { enabled: true, healthScoring: true, smartCategorization: true }, voiceAssistant: { enabled: false }, ocrEngine: { enabled: true } } }), ...errs } },
  },
  '/api/v1/admin/users': {
    get: { tags: ['Admin'], summary: 'List all users (Admin only)', operationId: 'adminGetAllUsers', security: sec, parameters: [{ in: 'query', name: 'page', schema: { type: 'integer', default: 1 } }, { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }, { in: 'query', name: 'role', schema: { type: 'string', enum: ['user', 'advisor', 'manager', 'admin'] } }, { in: 'query', name: 'status', schema: { type: 'string', enum: ['active', 'suspended'] } }, { in: 'query', name: 'search', schema: { type: 'string' } }], responses: { ...r200('Users', { success: true, data: { users: [], total: 0, page: 1 } }), ...errs } },
  },
  '/api/v1/admin/users/pending': { get: { tags: ['Admin'], summary: 'Pending advisor applications (Admin only)', operationId: 'adminGetPendingAdvisors', security: sec, responses: { ...r200('Pending'), ...errs } } },
  '/api/v1/admin/users/activity': { get: { tags: ['Admin'], summary: 'User activity stats (Admin only)', operationId: 'adminGetUserActivity', security: sec, responses: { ...r200('Activity'), ...errs } } },
  '/api/v1/admin/users/{advisorId}/approve': {
    post: { tags: ['Admin'], summary: 'Approve advisor (Admin only)', operationId: 'adminApproveAdvisor', security: sec, parameters: [uuidParam('advisorId', 'Advisor UUID')], requestBody: jbody('Approval', {}), responses: { ...r200('Approved'), ...errs } },
  },
  '/api/v1/admin/users/{advisorId}/reject': {
    post: { tags: ['Admin'], summary: 'Reject advisor (Admin only)', operationId: 'adminRejectAdvisor', security: sec, parameters: [uuidParam('advisorId', 'Advisor UUID')], requestBody: jbody('Reason', { reason: { type: 'string' } }), responses: { ...r200('Rejected'), ...errs } },
  },
  '/api/v1/admin/users/{userId}/status': {
    post: { tags: ['Admin'], summary: 'Toggle user status (Admin only)', operationId: 'adminToggleUserStatus', security: sec, parameters: [uuidParam('userId', 'User UUID')], requestBody: jbody('Status', { status: { type: 'string', enum: ['active', 'suspended'] } }, ['status']), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/admin/users/{userId}/role': {
    post: { tags: ['Admin'], summary: 'Update user role (Admin only)', operationId: 'adminUpdateUserRole', security: sec, parameters: [uuidParam('userId', 'User UUID')], requestBody: jbody('Role', { role: { type: 'string', enum: ['user', 'advisor', 'manager', 'admin'] } }, ['role']), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/admin/users/{userId}': {
    delete: { tags: ['Admin'], summary: 'Delete user (Admin only)', operationId: 'adminDeleteUser', security: sec, parameters: [uuidParam('userId', 'User UUID')], responses: { ...r200('Deleted'), ...errs } },
  },
  '/api/v1/admin/users/{userId}/storage': {
    get: { tags: ['Admin'], summary: 'User storage stats (Admin only)', operationId: 'adminGetUserStorage', security: sec, parameters: [uuidParam('userId', 'User UUID')], responses: { ...r200('Storage', { success: true, data: { receipts: 24, bills: 12, totalMb: 48.5 } }), ...errs } },
  },
  '/api/v1/admin/stats': {
    get: { tags: ['Admin'], summary: 'Platform statistics (Admin only)', operationId: 'adminGetStats', security: sec, responses: { ...r200('Stats', { success: true, data: { totalUsers: 5420, activeUsers: 3100, totalTransactions: 285000, mrrINR: 450000 } }), ...errs } },
  },
  '/api/v1/admin/cache/metrics': {
    get: { tags: ['Admin'], summary: 'Cache metrics (Admin only)', operationId: 'adminGetCacheMetrics', security: sec, parameters: [{ in: 'query', name: 'prefix', schema: { type: 'string' } }], responses: { ...r200('Metrics', { success: true, data: { hits: 12400, misses: 1200, hitRate: 0.91, keys: 450 } }), ...errs } },
  },
  '/api/v1/admin/features/toggle': {
    post: { tags: ['Admin'], summary: 'Toggle feature flag (Admin only)', operationId: 'adminToggleFeature', security: sec, requestBody: jbody('Toggle', { feature: { type: 'string' }, enabled: { type: 'boolean' }, userTier: { type: 'string' } }, ['feature', 'enabled']), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/admin/ai-features/toggle': {
    post: { tags: ['Admin'], summary: 'Toggle AI feature flag (Admin only)', operationId: 'adminToggleAIFeature', security: sec, requestBody: jbody('Toggle', { feature: { type: 'string' }, subFeature: { type: 'string' }, enabled: { type: 'boolean' } }, ['feature', 'enabled']), responses: { ...r200('Updated'), ...errs } },
  },
  '/api/v1/admin/reports/users': { get: { tags: ['Admin'], summary: 'Users report (Admin only)', operationId: 'adminGetUsersReport', security: sec, parameters: [{ in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }], responses: { ...r200('Report'), ...errs } } },
  '/api/v1/admin/reports/revenue': { get: { tags: ['Admin'], summary: 'Revenue report (Admin only)', operationId: 'adminGetRevenueReport', security: sec, parameters: [{ in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }], responses: { ...r200('Report'), ...errs } } },
  '/api/v1/admin/ai/overview': { get: { tags: ['Admin'], summary: 'AI overview (Admin only)', operationId: 'adminAIOverview', security: sec, responses: { ...r200('Overview'), ...errs } } },
  '/api/v1/admin/ai/users': { get: { tags: ['Admin'], summary: 'AI users (Admin only)', operationId: 'adminAIUsers', security: sec, parameters: [{ in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }], responses: { ...r200('Users'), ...errs } } },
  '/api/v1/admin/ai/insights': { get: { tags: ['Admin'], summary: 'AI insights summary (Admin only)', operationId: 'adminAIInsightsSummary', security: sec, parameters: [{ in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }], responses: { ...r200('Insights'), ...errs } } },
  '/api/v1/admin/ai/patterns': { get: { tags: ['Admin'], summary: 'AI patterns (Admin only)', operationId: 'adminAIPatterns', security: sec, responses: { ...r200('Patterns'), ...errs } } },
  '/api/v1/admin/ai/accuracy': { get: { tags: ['Admin'], summary: 'AI accuracy (Admin only)', operationId: 'adminAIAccuracy', security: sec, responses: { ...r200('Accuracy'), ...errs } } },
  '/api/v1/admin/ai/raw/{userId}': { get: { tags: ['Admin'], summary: 'AI raw user data (Admin only)', operationId: 'adminAIRawUserData', security: sec, parameters: [uuidParam('userId', 'User UUID')], responses: { ...r200('Raw data'), ...errs } } },
  '/api/v1/admin/ai/run/features': { post: { tags: ['Admin'], summary: 'Refresh AI features (Admin only)', operationId: 'adminAIRunFeatures', security: sec, requestBody: jbody('Config', { userIds: { type: 'array', items: { type: 'string' } } }), responses: { ...r200('Refreshed'), ...errs } } },
  '/api/v1/admin/ai/run/predictions': { post: { tags: ['Admin'], summary: 'Refresh AI predictions (Admin only)', operationId: 'adminAIRunPredictions', security: sec, requestBody: jbody('Config', { userIds: { type: 'array', items: { type: 'string' } } }), responses: { ...r200('Refreshed'), ...errs } } },
  '/api/v1/admin/ai/config': {
    get: { tags: ['Admin'], summary: 'Get AI config (Admin only)', operationId: 'adminGetAIConfig', security: sec, responses: { ...r200('Config'), ...errs } },
    post: { tags: ['Admin'], summary: 'Update AI config (Admin only)', operationId: 'adminUpdateAIConfig', security: sec, requestBody: jbody('Config', { model: { type: 'string', example: 'gemini-pro' }, maxTokens: { type: 'integer', example: 2048 }, temperature: { type: 'number', example: 0.7 } }), responses: { ...r200('Updated'), ...errs } },
  },
};

// ─── Public generators ────────────────────────────────────────────────────────

export function generateOpenApiDocument(baseUrl?: string) {
  const totalOps = Object.values(ALL_PATHS).reduce<number>((n, p) => n + Object.keys(p as object).length, 0);
  const totalPaths = Object.keys(ALL_PATHS).length;

  return {
    openapi: '3.0.3',
    info: {
      title: 'KANAKU Backend API',
      version: '1.0.0',
      description: `# KANAKU Personal Finance API\n\n**${totalOps} operations** across **${totalPaths} paths** — fully documented end-to-end.\n\n## Authenticate\n1. \`POST /api/v1/auth/register\` or \`POST /api/v1/auth/login\`\n2. Copy the JWT from the \`Authorization\` response header\n3. Click **Authorize 🔓** → enter: \`Bearer <token>\`\n\n## Roles\n| Role | Access |\n|------|--------|\n| \`user\` | Personal finance |\n| \`advisor\` | User + advisor workspace |\n| \`manager\` | Advisor verification |\n| \`admin\` | Full system access |\n\n## Rate Limits\n| Scope | Limit |\n|-------|-------|\n| /auth/* | 5/min |\n| /bills POST | 10/min |\n| /receipts/scan | 8/min |\n| /sync/* | 100/min |\n| All other | 60/min (prod) |`,
      contact: { name: 'KANAKU API', email: 'api@KANAKU.in' },
    },
    servers: [
      { url: baseUrl || 'http://localhost:3000', description: 'Development' },
      { url: 'https://api.KANAKU.in', description: 'Production' },
    ],
    tags: [
      { name: 'System' }, { name: 'Auth' }, { name: 'PIN' }, { name: 'Accounts' },
      { name: 'Transactions' }, { name: 'Goals' }, { name: 'Loans' }, { name: 'Investments' },
      { name: 'Friends' }, { name: 'Groups' }, { name: 'Todos' }, { name: 'Settings' },
      { name: 'Notifications' }, { name: 'Sync' }, { name: 'Dashboard' }, { name: 'Advisors' },
      { name: 'Bookings' }, { name: 'Sessions' }, { name: 'Payments' }, { name: 'AI' },
      { name: 'Voice' }, { name: 'Receipts' }, { name: 'Bills' }, { name: 'Devices' },
      { name: 'Stocks' }, { name: 'Categorization' }, { name: 'Import' }, { name: 'Avatars' }, { name: 'Admin' },
    ],
    paths: ALL_PATHS,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT from POST /api/v1/auth/login (Authorization response header)' },
      },
      schemas: {
        Envelope: _Envelope,
        ApiError: _Error,
        Account: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, type: { type: 'string', enum: ['bank', 'wallet', 'cash', 'credit', 'investment', 'other'] }, balance: { type: 'number' }, currency: { type: 'string' }, isActive: { type: 'boolean' }, provider: { type: 'string' } } },
        Transaction: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['income', 'expense', 'transfer'] }, amount: { type: 'number' }, category: { type: 'string' }, description: { type: 'string' }, merchant: { type: 'string' }, date: { type: 'string', format: 'date-time' }, syncStatus: { type: 'string', enum: ['synced', 'pending', 'failed'] } } },
        Goal: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, targetAmount: { type: 'number' }, currentAmount: { type: 'number' }, targetDate: { type: 'string', format: 'date-time' } } },
        Loan: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['borrowed', 'lent'] }, name: { type: 'string' }, principalAmount: { type: 'number' }, outstandingBalance: { type: 'number' }, status: { type: 'string', enum: ['active', 'completed', 'defaulted'] } } },
        LoanPayment: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, loanId: { type: 'string', format: 'uuid' }, amount: { type: 'number' }, date: { type: 'string', format: 'date-time' }, notes: { type: 'string' } } },
        Notification: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, type: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, isRead: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' } } },
        BookingRequest: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, sessionType: { type: 'string', enum: ['video', 'audio', 'chat', 'in-person'] }, status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'] }, proposedDate: { type: 'string', format: 'date-time' }, amount: { type: 'number' } } },
        AdvisorSession: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['scheduled', 'in-progress', 'completed', 'cancelled'] }, startTime: { type: 'string', format: 'date-time' }, rating: { type: 'number', minimum: 1, maximum: 5 } } },
      },
    },
  };
}

export function generateApiTestingGuide(baseUrl: string) {
  const totalOps = Object.values(ALL_PATHS).reduce<number>((n, p) => n + Object.keys(p as object).length, 0);
  return `# KANAKU API Testing Guide\n\nBase URL: \`${baseUrl}/api/v1\`\nSwagger UI: \`${baseUrl}/api-docs\`\nOpenAPI JSON: \`${baseUrl}/api-docs/openapi.json\`\n\n**Total operations: ${totalOps}**\n\n## 1. Authentication\n\n\`\`\`bash\ncurl -si -X POST ${baseUrl}/api/v1/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"test@example.com","password":"TestPass123!"}' \\\n  | grep -i authorization\n\`\`\`\nIn Swagger UI: Click **Authorize 🔓** → enter: \`Bearer <token>\`\n\n## 2. Core User Journey\n1. Register → JWT\n2. POST /pin/create → Set PIN\n3. POST /accounts → Create bank account\n4. POST /transactions (income) → Add salary\n5. POST /transactions (expense) → Add expense\n6. GET /dashboard/summary → Net worth + categories\n7. POST /goals → Savings goal\n8. POST /loans → EMI loan\n9. POST /loans/:id/payment → Record EMI\n10. GET /ai/insights → AI financial advice\n\n## 3. Advisor Journey\n1. POST /advisors/apply → Submit application\n2. (Admin approves) PUT /admin/users/:id/approve\n3. POST /advisors/availability → Set working hours\n4. GET /bookings → Incoming requests\n5. PUT /bookings/:id/accept → Accept → Session created\n6. POST /sessions/:id/start → Start session\n7. POST /sessions/:id/messages → Chat\n8. POST /sessions/:id/complete → Complete\n\n## 4. Import Journey\n1. POST /import/upload → Upload CSV\n2. GET /import/:sessionId → Review\n3. POST /import/confirm → Save\n\n## 5. Error Codes\n| Code | HTTP | Cause |\n|------|------|-------|\n| MISSING_FIELDS | 400 | Required field absent |\n| INVALID_EMAIL | 400 | Email format invalid |\n| PASSWORD_TOO_SHORT | 400 | Password < 8 chars |\n| INVALID_AMOUNT | 400 | Amount ≤ 0 |\n| INVALID_TRANSFER | 400 | Same source/target account |\n| INVALID_PIN | 400 | Weak PIN |\n| NOT_FOUND | 404 | Resource missing |\n| DUPLICATE_ACCOUNT | 409 | Name+type exists |\n| ACCOUNT_SUSPENDED | 403 | User suspended |\n\n## 6. Rate Limits\n| Scope | Limit |\n|-------|-------|\n| /auth/* | 5/min |\n| /bills POST | 10/min |\n| /receipts/scan | 8/min |\n| /sync/* | 100/min |\n| Everything else | 60/min |\n`;
}

// ─── Legacy exports kept for backward compatibility ────────────────────────────
// The old dynamic-parser exports below are no longer used for generation
// but kept to avoid breaking any potential import references.

import fs from 'fs';
import path from 'path';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type RouteMount = {
  prefix: string;
  folder: string;
  fileBase: string;
  tag: string;
};

type OpenApiOperation = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security?: Array<Record<string, string[]>>;
  parameters?: any[];
  requestBody?: any;
  responses: Record<string, any>;
};

type EndpointOverride = Partial<OpenApiOperation> & {
  requestExample?: Record<string, unknown>;
  responseExample?: Record<string, unknown>;
};

const API_TITLE = 'KANAKU Backend API';
const API_VERSION = '1.0.0';

const ROUTE_MOUNTS: RouteMount[] = [
  { prefix: '/auth', folder: 'auth', fileBase: 'auth.routes', tag: 'Auth' },
  { prefix: '/sync', folder: 'sync', fileBase: 'sync.routes', tag: 'Sync' },
  { prefix: '/pin', folder: 'pin', fileBase: 'pin.routes', tag: 'PIN' },
  { prefix: '/transactions', folder: 'transactions', fileBase: 'transaction.routes', tag: 'Transactions' },
  { prefix: '/accounts', folder: 'accounts', fileBase: 'account.routes', tag: 'Accounts' },
  { prefix: '/goals', folder: 'goals', fileBase: 'goal.routes', tag: 'Goals' },
  { prefix: '/loans', folder: 'loans', fileBase: 'loan.routes', tag: 'Loans' },
  { prefix: '/settings', folder: 'settings', fileBase: 'settings.routes', tag: 'Settings' },
  { prefix: '/friends', folder: 'friends', fileBase: 'friend.routes', tag: 'Friends' },
  { prefix: '/investments', folder: 'investments', fileBase: 'investment.routes', tag: 'Investments' },
  { prefix: '/todos', folder: 'todos', fileBase: 'todo.routes', tag: 'Todos' },
  { prefix: '/groups', folder: 'groups', fileBase: 'group.routes', tag: 'Groups' },
  { prefix: '/ai', folder: 'ai', fileBase: 'ai.routes', tag: 'AI' },
  { prefix: '/receipts', folder: 'receipts', fileBase: 'receipt.routes', tag: 'Receipts' },
  { prefix: '/bookings', folder: 'bookings', fileBase: 'booking.routes', tag: 'Bookings' },
  { prefix: '/advisors', folder: 'advisors', fileBase: 'advisor.routes', tag: 'Advisors' },
  { prefix: '/sessions', folder: 'sessions', fileBase: 'session.routes', tag: 'Sessions' },
  { prefix: '/payments', folder: 'payments', fileBase: 'payment.routes', tag: 'Payments' },
  { prefix: '/notifications', folder: 'notifications', fileBase: 'notification.routes', tag: 'Notifications' },
  { prefix: '/bills', folder: 'bills', fileBase: 'bills.routes', tag: 'Bills' },
  { prefix: '/dashboard', folder: 'dashboard', fileBase: 'dashboard.routes', tag: 'Dashboard' },
  { prefix: '/admin', folder: 'admin', fileBase: 'admin.routes', tag: 'Admin' },
  { prefix: '/stocks', folder: 'stocks', fileBase: 'stock.routes', tag: 'Stocks' },
];

const ENDPOINT_OVERRIDES: Record<string, EndpointOverride> = {
  'post /api/v1/auth/register': {
    summary: 'Register a new user',
    description: 'Creates a KANAKU account and returns authentication data.',
    requestExample: {
      name: 'Asha Sharma',
      email: 'asha@example.com',
      password: 'StrongPassword123!',
    },
    responseExample: {
      user: { id: 'uuid', email: 'asha@example.com', name: 'Asha Sharma' },
      accessToken: 'jwt-token',
      refreshToken: 'refresh-token',
    },
  },
  'post /api/v1/auth/login': {
    summary: 'Login with email and password',
    description: 'Authenticates the user and returns access credentials.',
    requestExample: {
      email: 'asha@example.com',
      password: 'StrongPassword123!',
    },
    responseExample: {
      user: { id: 'uuid', email: 'asha@example.com', name: 'Asha Sharma' },
      accessToken: 'jwt-token',
      refreshToken: 'refresh-token',
    },
  },
  'get /api/v1/auth/profile': {
    summary: 'Get current user profile',
    description: 'Returns the authenticated user profile used by the app shell and onboarding flows.',
    responseExample: {
      id: 'uuid',
      email: 'asha@example.com',
      name: 'Asha Sharma',
      firstName: 'Asha',
      lastName: 'Sharma',
      role: 'user',
    },
  },
  'put /api/v1/auth/profile': {
    summary: 'Update current user profile',
    description: 'Updates the authenticated user profile.',
    requestExample: {
      firstName: 'Asha',
      lastName: 'Sharma',
      country: 'India',
      city: 'Bengaluru',
    },
  },
  'post /api/v1/sync/pull': {
    summary: 'Pull server-side changes',
    description: 'Returns cloud data changed since the last sync timestamp for the requesting device.',
    requestExample: {
      deviceId: 'device_123',
      lastSyncedAt: '2026-04-25T10:00:00.000Z',
      entityTypes: ['accounts', 'transactions', 'goals'],
    },
    responseExample: {
      success: true,
      data: {
        accounts: [],
        transactions: [],
        goals: [],
      },
    },
  },
  'post /api/v1/sync/push': {
    summary: 'Push local changes',
    description: 'Pushes local device changes into the backend sync queue/source of truth.',
    requestExample: {
      deviceId: 'device_123',
      entities: [
        {
          entityType: 'transaction',
          operation: 'upsert',
          data: { localId: 42, amount: 1200, category: 'Food & Dining' },
        },
      ],
    },
  },
  'get /api/v1/accounts': {
    summary: 'List accounts',
    description: 'Returns all active accounts for the authenticated user.',
  },
  'post /api/v1/accounts': {
    summary: 'Create account',
    requestExample: {
      name: 'HDFC Bank',
      type: 'bank',
      balance: 25000,
      currency: 'INR',
    },
  },
  'get /api/v1/transactions': {
    summary: 'List transactions',
    description: 'Supports account, date-range, and category filtering.',
  },
  'post /api/v1/transactions': {
    summary: 'Create transaction',
    requestExample: {
      accountId: 'account-uuid',
      type: 'expense',
      amount: 450,
      category: 'Food & Dining',
      description: 'Lunch',
      date: '2026-04-25T12:30:00.000Z',
    },
  },
  'post /api/v1/goals': {
    summary: 'Create goal',
    requestExample: {
      name: 'Emergency Fund',
      targetAmount: 100000,
      currentAmount: 15000,
      targetDate: '2026-12-31T00:00:00.000Z',
      category: 'savings',
    },
  },
  'post /api/v1/loans': {
    summary: 'Create loan',
    requestExample: {
      type: 'borrowed',
      name: 'Personal Loan',
      principalAmount: 50000,
      emiAmount: 4500,
      dueDate: '2026-06-05T00:00:00.000Z',
      status: 'active',
    },
  },
  'post /api/v1/loans/:id/payment': {
    summary: 'Add loan payment',
    requestExample: {
      amount: 4500,
      accountId: 'account-uuid',
      notes: 'April EMI',
    },
  },
  'post /api/v1/bookings': {
    summary: 'Create advisor booking request',
    requestExample: {
      advisorId: 'advisor-uuid',
      sessionType: 'video',
      description: 'Tax planning for FY 2026',
      proposedDate: '2026-05-01',
      proposedTime: '18:00',
      duration: 60,
      amount: 1499,
    },
  },
  'put /api/v1/bookings/:id/accept': {
    summary: 'Accept booking request',
  },
  'put /api/v1/bookings/:id/reject': {
    summary: 'Reject booking request',
    requestExample: {
      reason: 'Requested slot is unavailable.',
    },
  },
  'put /api/v1/bookings/:id/reschedule': {
    summary: 'Reschedule booking request',
    requestExample: {
      proposedDate: '2026-05-03',
      proposedTime: '19:30',
      reason: 'Can we move this to the weekend?',
    },
  },
  'get /api/v1/sessions/:id/messages': {
    summary: 'List session chat messages',
  },
  'post /api/v1/sessions/:id/messages': {
    summary: 'Send session chat message',
    requestExample: {
      message: 'Please share your last three months of statements before the call.',
    },
  },
  'get /api/v1/dashboard/summary': {
    summary: 'Get dashboard summary',
  },
  'get /api/v1/dashboard/cashflow': {
    summary: 'Get dashboard cashflow',
  },
};

function resolveRouteFile(mount: RouteMount): string {
  const candidateRoots = [
    path.join(__dirname, '..', 'modules'),
    path.join(process.cwd(), 'backend', 'src', 'modules'),
    path.join(process.cwd(), 'backend', 'dist', 'modules'),
  ];

  const candidates = candidateRoots.flatMap((root) => [
    path.join(root, mount.folder, `${mount.fileBase}.ts`),
    path.join(root, mount.folder, `${mount.fileBase}.js`),
  ]);

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to locate route file for ${mount.fileBase}`);
  }

  return match;
}

function buildOperationId(method: HttpMethod, fullPath: string): string {
  return `${method}_${fullPath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function buildSummary(method: HttpMethod, fullPath: string, fallbackTag: string): string {
  const override = ENDPOINT_OVERRIDES[`${method} ${fullPath}`];
  if (override?.summary) {
    return override.summary;
  }

  const readablePath = fullPath
    .replace('/api/v1/', '')
    .replace(/\/:/g, ' by ')
    .replace(/\//g, ' ')
    .trim();

  return `${method.toUpperCase()} ${readablePath || fallbackTag}`;
}

function buildParameters(fullPath: string): any[] {
  const matches = fullPath.match(/:([A-Za-z0-9_]+)/g) || [];
  return matches.map((match) => ({
    in: 'path',
    name: match.slice(1),
    required: true,
    schema: { type: 'string' },
  }));
}

function buildResponses(method: HttpMethod, override?: EndpointOverride): Record<string, any> {
  const successCode = method === 'post' ? '201' : '200';
  const responses: Record<string, any> = {
    [successCode]: {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: { oneOf: [{ $ref: '#/components/schemas/SuccessEnvelope' }, { type: 'object' }] },
        },
      },
    },
    '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '403': { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '429': { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
  };

  if (override?.responseExample) {
    responses[successCode].content['application/json'].example = override.responseExample;
  }

  return responses;
}

function buildRequestBody(method: HttpMethod, fullPath: string, override?: EndpointOverride) {
  if (!['post', 'put', 'patch'].includes(method)) {
    return undefined;
  }

  const example = override?.requestExample || {
    note: `Provide request payload for ${fullPath}`,
  };

  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        example,
      },
    },
  };
}

function extractOperations(mount: RouteMount): Record<string, Record<string, OpenApiOperation>> {
  const filePath = resolveRouteFile(mount);
  const content = fs.readFileSync(filePath, 'utf8');
  const operations: Record<string, Record<string, OpenApiOperation>> = {};
  const protectedByDefault = /router\.use\(\s*authMiddleware\s*\)/.test(content);
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const matches = [...content.matchAll(routePattern)];

  matches.forEach((match, index) => {
    const method = match[1] as HttpMethod;
    const routePath = match[2];
    const nextIndex = matches[index + 1]?.index ?? content.length;
    const segment = content.slice(match.index ?? 0, nextIndex);
    const normalizedRoute = routePath === '/' ? '' : routePath;
    const fullPath = `/api/v1${mount.prefix}${normalizedRoute}`;
    const override = ENDPOINT_OVERRIDES[`${method} ${fullPath}`];
    const authRequired = protectedByDefault || /authMiddleware/.test(segment);

    const operation: OpenApiOperation = {
      tags: [mount.tag],
      summary: buildSummary(method, fullPath, mount.tag),
      description: override?.description,
      operationId: buildOperationId(method, fullPath),
      security: authRequired ? [{ bearerAuth: [] }] : undefined,
      parameters: buildParameters(fullPath),
      requestBody: buildRequestBody(method, fullPath, override),
      responses: buildResponses(method, override),
    };

    operations[fullPath] = operations[fullPath] || {};
    operations[fullPath][method] = operation;
  });

  return operations;
}

function mergeOperations() {
  return ROUTE_MOUNTS.reduce<Record<string, Record<string, OpenApiOperation>>>((acc, mount) => {
    const next = extractOperations(mount);
    Object.entries(next).forEach(([pathKey, methods]) => {
      acc[pathKey] = acc[pathKey] || {};
      Object.assign(acc[pathKey], methods);
    });
    return acc;
  }, {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns API, Redis, and circuit breaker status.',
        operationId: 'get_health',
        responses: {
          '200': {
            description: 'Service status',
            content: {
              'application/json': {
                example: {
                  status: 'ok',
                  timestamp: '2026-04-25T12:00:00.000Z',
                  services: {
                    redis: 'connected',
                    circuitBreakers: {},
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
