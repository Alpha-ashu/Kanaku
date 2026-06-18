/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KANAKU CODEBASE - COMPREHENSIVE FINTECH ARCHITECTURE & SECURITY AUDIT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Scope: Financial application architecture, banking-grade security, scalability,
 *        real-time sync, offline-first design, group finance, borrow/lend workflows
 * 
 * Audit Date: June 1, 2026
 * Architecture Level: Enterprise FinTech
 * Target Scale: 1M+ users
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 1: FINANCIAL APPLICATION ARCHITECTURE ANALYSIS                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 1.1 CURRENT STATE: Strengths & Foundation
 * ─────────────────────────────────────────────
 */
export const financialArchitectureCurrentState = {
  strengths: [
    '✅ Account-centric design (users have multiple accounts)',
    '✅ Transaction atomicity via Prisma transactions',
    '✅ Balance tracking via database triggers (immutable)',
    '✅ Multi-currency support (USD, etc.)',
    '✅ Decimal precision (12,2) for monetary values',
    '✅ Account types: bank, card, cash, digital',
    '✅ Transaction import with dedup via dedupHash',
    '✅ Soft-delete support (deletedAt) for compliance',
    '✅ Device-level tracking for multi-device sync',
  ],

  weaknesses_and_gaps: [
    '⚠️ No explicit double-entry bookkeeping (critical for accuracy)',
    '⚠️ Balance computed by triggers - no reconciliation mechanism',
    '⚠️ No transaction reversals (only soft-delete)',
    '⚠️ No settlement states for transfers (in-transit status)',
    '⚠️ No failed transaction recovery queue',
    '⚠️ Group expense splits lack fractional cent handling',
    '⚠️ No idempotency keys for API requests (duplicate TX risk)',
    '⚠️ No transaction versioning (only version=1 field)',
    '⚠️ Loan interest calculation not automated (manual emiAmount)',
    '⚠️ No lock mechanism for concurrent account updates',
  ],
};

/**
 * 1.2 CRITICAL ISSUES: Double-Entry Bookkeeping Missing
 * ─────────────────────────────────────────────────────
 */
export const criticalIssue_NoDoubleEntryBookkeeping = {
  description: `
    Current: Transactions directly debit/credit account balances via triggers
    Risk: Silent accounting errors, reconciliation impossible, regulatory non-compliance
    Impact: 🔴 CRITICAL - Every financial transaction is at risk
  `,

  problem_detail: `
    When a transaction is created:
    1. Account balance is updated by trigger
    2. No corresponding entry in general ledger
    3. No audit trail of debits/credits
    4. No way to reconcile individual accounts against master ledger
    
    Example: User creates $100 expense from account A
    - Account A balance: -$100
    - But no "Expense Ledger" entry exists
    - If trigger fails, data is corrupted with no way to detect
  `,

  solution: `
    Implement double-entry bookkeeping (standard in all financial systems):
    
    1. Create LedgerEntry model:
       - journalId (groups entries for atomic transactions)
       - accountId (which account affected)
       - debitAmount (money leaving)
       - creditAmount (money entering)
       - entryType (transaction, transfer, loan_payment, etc)
       - ledgerCode (GL account: Assets, Liabilities, Equity, Income, Expense)
       - date, createdAt
       
    2. For every transaction, create 2+ ledger entries:
       - Expense tx: DEBIT Expense Account, CREDIT User's Account
       - Income tx: DEBIT User's Account, CREDIT Income Account
       - Transfer: DEBIT Target Account, CREDIT Source Account
       
    3. Add reconciliation job:
       - Sum all ledger entries by account
       - Compare to current account.balance
       - Alert on mismatch
       - Monthly reconciliation report
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create LedgerEntry & GeneralLedger schema',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code_outline: `
        model LedgerEntry {
          id String @id @default(uuid())
          journalId String // Groups related entries
          accountId String
          ledgerCode String // ASSET, LIABILITY, INCOME, EXPENSE, etc
          debitAmount Decimal @db.Decimal(12,2)
          creditAmount Decimal @db.Decimal(12,2)
          description String
          referenceTransactionId String?
          transactionType String // expense, income, transfer, loan_payment
          date DateTime
          createdAt DateTime @default(now())
          
          @@index([journalId])
          @@index([accountId])
          @@index([ledgerCode])
          @@index([date])
        }
        
        model GeneralLedger {
          id String @id @default(uuid())
          userId String
          ledgerCode String
          balance Decimal @db.Decimal(12,2)
          lastReconciled DateTime?
          createdAt DateTime @default(now())
          updatedAt DateTime @updatedAt
          
          @@unique([userId, ledgerCode])
        }
      `
    },
    {
      step: 2,
      task: 'Create transaction wrapper service',
      file_changes: 'backend/src/modules/transactions/transaction-ledger.service.ts',
      effort: '4 hours',
      responsibility: `
        - Accept transaction request
        - Create journal entry
        - Create 2+ ledger entries (debit/credit)
        - Update account balance
        - Store all in single DB transaction
        - Rollback on any error
      `
    },
    {
      step: 3,
      task: 'Create reconciliation job',
      file_changes: 'backend/src/workers/reconciliation.worker.ts',
      effort: '3 hours',
      responsibility: `
        - Run daily at 2 AM UTC
        - Sum ledger entries for each account
        - Compare to account.balance
        - Generate reconciliation report
        - Alert on mismatches
      `
    },
    {
      step: 4,
      task: 'Migrate existing transactions to ledger',
      file_changes: 'backend/prisma/migrations/',
      effort: '6 hours',
      responsibility: `
        - For each existing transaction:
        - Create journal entry
        - Create appropriate ledger entries
        - Validate balance matches
        - Backup before running
      `
    },
    {
      step: 5,
      task: 'Add ledger reconciliation API endpoint',
      file_changes: 'backend/src/modules/finance/finance.routes.ts',
      effort: '2 hours',
      responsibility: `
        - GET /api/v1/finance/reconciliation (admin only)
        - GET /api/v1/finance/ledger/:accountId (owner + admin)
        - POST /api/v1/finance/reconcile (admin only)
      `
    }
  ],

  database_migration: `
    ALTER TABLE accounts ADD COLUMN balance_ledger_verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE transactions ADD COLUMN journal_id UUID;
    
    CREATE TABLE ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      journal_id UUID NOT NULL REFERENCES ledger_entries(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      ledger_code VARCHAR(50),
      debit_amount DECIMAL(12,2) DEFAULT 0,
      credit_amount DECIMAL(12,2) DEFAULT 0,
      description TEXT,
      reference_transaction_id UUID,
      transaction_type VARCHAR(50),
      date TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    
    CREATE INDEX idx_ledger_journal ON ledger_entries(journal_id);
    CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
    CREATE INDEX idx_ledger_code ON ledger_entries(ledger_code);
  `,

  estimated_total_effort: '17 hours',
  priority: '🔴 CRITICAL',
  affects_compliance: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 2: BANKING-GRADE SECURITY ANALYSIS                                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 2.1 CURRENT SECURITY POSTURE: Strengths
 * ──────────────────────────────────────
 */
export const securityCurrentState = {
  strengths: [
    '✅ Supabase Auth + Custom JWT (dual auth)',
    '✅ Role-Based Access Control (RBAC)',
    '✅ Owner-only checks on resources',
    '✅ Audit logging in place',
    '✅ Rate limiting middleware',
    '✅ Input validation with Zod',
    '✅ Soft-deletes for compliance',
    '✅ PIN-based security with hash (bcrypt implied)',
    '✅ Device fingerprinting',
    '✅ Helmet + CORS configured',
  ],

  critical_vulnerabilities: [
    '🔴 No field-level encryption for sensitive data',
    '🔴 No request idempotency (duplicate TX risk)',
    '🔴 No database-level row security (RLS)',
    '🔴 No API signature verification for webhooks',
    '🔴 No secrets rotation mechanism',
    '🔴 No rate limiting per user (only global)',
    '🔴 No honeypot fields for bot detection',
    '🔴 No CSRF token validation visible',
    '🔴 No OAuth token expiry enforcement',
    '🔴 Transaction amounts not encrypted in logs',
  ],

  important_gaps: [
    '⚠️ No 2FA for advisor/admin operations',
    '⚠️ No IP whitelisting for admin routes',
    '⚠️ No concurrent session limits',
    '⚠️ No suspicious activity detection',
    '⚠️ No data masking in API responses (full PII returned)',
    '⚠️ No encryption key storage (env vars only)',
    '⚠️ No backup encryption',
    '⚠️ No data residency enforcement',
    '⚠️ No transaction dispute/chargeback workflow',
    '⚠️ No activity timeline for users to verify',
  ],
};

/**
 * 2.2 CRITICAL ISSUE: Field-Level Encryption for PII
 * ────────────────────────────────────────────────────
 */
export const criticalIssue_NoFieldEncryption = {
  description: `
    Risk: Plaintext sensitive data in database
    Fields at risk: email, phone, full names, salary, DOB, SSN (if stored)
    Compliance: GDPR, PCI-DSS, CCPA violation
    Impact: 🔴 CRITICAL - Data breach = regulatory fines + user lawsuits
  `,

  affected_models: [
    'User: email, name, dateOfBirth, salary, phone',
    'Friend: name, email, phone',
    'Payment: amount, method',
    'Transaction: description, merchant, amount',
    'LoanPayment: amount, notes',
    'Notification: message (may contain amounts)',
  ],

  solution: `
    Implement field-level encryption using NaCl (tweetnacl.js):
    
    1. Master Key Management:
       - Store only key hash in env
       - Rotate quarterly
       - Track key versions per record
       
    2. Encryption Wrapper Service:
       - Encrypt on write to database
       - Decrypt on read from database
       - Transparent to application code
       
    3. Fields to Encrypt (High Priority):
       - email, phone (PII)
       - salary (sensitive financial)
       - dateOfBirth (PII)
       - Transaction amounts, descriptions
       - Loan payment amounts
       - Notification messages
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create encryption service',
      file_changes: 'backend/src/utils/encryption.ts',
      effort: '3 hours',
      responsibility: `
        import nacl from 'tweetnacl';
        
        class EncryptionService {
          private masterKey: Buffer;
          
          constructor() {
            this.masterKey = Buffer.from(
              process.env.ENCRYPTION_KEY || nacl.randomBytes(32)
            );
          }
          
          encrypt(plaintext: string, keyVersion: number = 1): {
            ciphertext: string;
            nonce: string;
            keyVersion: number;
          } {
            const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
            const cipher = nacl.secretbox(
              Buffer.from(plaintext),
              nonce,
              this.masterKey
            );
            return {
              ciphertext: Buffer.from(cipher).toString('hex'),
              nonce: Buffer.from(nonce).toString('hex'),
              keyVersion
            };
          }
          
          decrypt(encrypted: {
            ciphertext: string;
            nonce: string;
            keyVersion: number;
          }): string {
            const cipher = Buffer.from(encrypted.ciphertext, 'hex');
            const nonce = Buffer.from(encrypted.nonce, 'hex');
            const plaintext = nacl.secretbox.open(cipher, nonce, this.masterKey);
            if (!plaintext) throw new Error('Decryption failed');
            return Buffer.from(plaintext).toString('utf8');
          }
        }
      `
    },
    {
      step: 2,
      task: 'Create Prisma middleware for transparent encryption',
      file_changes: 'backend/src/db/prisma-encryption.ts',
      effort: '4 hours',
      responsibility: `
        - Hook Prisma events: create, update, read
        - On write: encrypt sensitive fields
        - On read: decrypt sensitive fields
        - Apply to User, Transaction, Friend, etc models
      `
    },
    {
      step: 3,
      task: 'Add keyVersion tracking for rotation',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      responsibility: `
        Add to encrypted fields:
        - encryptionKeyVersion: Int @default(1)
        - encryptedAt: DateTime
      `
    },
    {
      step: 4,
      task: 'Create key rotation worker',
      file_changes: 'backend/src/workers/key-rotation.worker.ts',
      effort: '5 hours',
      responsibility: `
        - Quarterly scheduled job
        - Re-encrypt records with old key version
        - Update keyVersion field
        - Log all key rotation events
      `
    },
    {
      step: 5,
      task: 'Update API responses to mask data',
      file_changes: 'backend/src/utils/response-masking.ts',
      effort: '3 hours',
      responsibility: `
        - Mask email: u***@example.com
        - Mask phone: +1 (***) ***-5678
        - Mask salary: [REDACTED]
        - Return only necessary fields
      `
    }
  ],

  estimated_total_effort: '17 hours',
  priority: '🔴 CRITICAL',
  affects_compliance: true,
};

/**
 * 2.3 CRITICAL ISSUE: Request Idempotency for Transaction Safety
 * ──────────────────────────────────────────────────────────────
 */
export const criticalIssue_NoIdempotency = {
  description: `
    Risk: Duplicate financial transactions from network failures
    Scenario: User creates $500 transaction, network times out, client retries
    Current: 2 transactions created ($1000 total)
    Impact: 🔴 CRITICAL - User loses money, balance corruption
  `,

  solution: `
    Implement idempotency key mechanism (industry standard):
    
    1. Client sends: Idempotency-Key: <UUID>
    2. Server stores key + response hash
    3. On retry with same key:
       - Check if key exists
       - Return cached response
       - Don't create duplicate transaction
    4. Keys expire after 24 hours
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create IdempotencyKey model',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '1 hour',
      code: `
        model IdempotencyKey {
          id String @id @default(uuid())
          key String @unique // Idempotency-Key header value
          userId String
          endpoint String // e.g., /api/v1/transactions
          method String // POST, PUT, DELETE
          responseHash String // Hash of successful response
          responsePayload Json // Cached response
          expiresAt DateTime
          createdAt DateTime @default(now())
          
          @@index([userId])
          @@index([expiresAt])
        }
      `
    },
    {
      step: 2,
      task: 'Create idempotency middleware',
      file_changes: 'backend/src/middleware/idempotency.ts',
      effort: '3 hours',
      code: `
        export const idempotencyMiddleware = async (
          req: AuthRequest,
          res: Response,
          next: NextFunction
        ) => {
          if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
            return next();
          }
          
          const idempotencyKey = req.headers['idempotency-key'] as string;
          if (!idempotencyKey) {
            return res.status(400).json({
              error: 'Idempotency-Key header required for financial operations'
            });
          }
          
          // Check if key exists
          const existing = await prisma.idempotencyKey.findUnique({
            where: { key: idempotencyKey }
          });
          
          if (existing) {
            // Return cached response
            return res.status(200).json(JSON.parse(existing.responsePayload));
          }
          
          // Store original response
          const originalSend = res.json.bind(res);
          res.json = (body: any) => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              prisma.idempotencyKey.create({
                data: {
                  key: idempotencyKey,
                  userId: req.userId!,
                  endpoint: req.path,
                  method: req.method,
                  responseHash: hashObject(body),
                  responsePayload: JSON.stringify(body),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
              }).catch(err => logger.error('Idempotency store failed:', err));
            }
            return originalSend(body);
          };
          
          next();
        };
      `
    },
    {
      step: 3,
      task: 'Apply idempotency middleware to sensitive routes',
      file_changes: 'backend/src/modules/transactions/transaction.routes.ts',
      effort: '2 hours',
      code: `
        router.post(
          '/',
          authMiddleware,
          idempotencyMiddleware, // Add here
          validateRequest(transactionSchema),
          createTransactionHandler
        );
        
        router.put(
          '/:id',
          authMiddleware,
          idempotencyMiddleware,
          validateRequest(updateTransactionSchema),
          updateTransactionHandler
        );
      `
    },
    {
      step: 4,
      task: 'Create cleanup job for expired idempotency keys',
      file_changes: 'backend/src/workers/idempotency-cleanup.worker.ts',
      effort: '2 hours',
      responsibility: `
        - Run every 6 hours
        - Delete keys older than 24 hours
        - Log cleanup summary
      `
    },
    {
      step: 5,
      task: 'Document idempotency in frontend SDK',
      file_changes: 'frontend/src/lib/api-client.ts',
      effort: '2 hours',
      code: `
        export class ApiClient {
          async post<T>(path: string, data: any): Promise<T> {
            const idempotencyKey = uuidv4();
            const headers = {
              'Idempotency-Key': idempotencyKey,
              ...this.defaultHeaders
            };
            return axios.post(path, data, { headers });
          }
        }
      `
    }
  ],

  estimated_total_effort: '10 hours',
  priority: '🔴 CRITICAL',
  affects_compliance: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 3: DATABASE DESIGN & INTEGRITY                                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 3.1 CRITICAL ISSUE: Missing Constraints & Data Integrity
 * ──────────────────────────────────────────────────────────
 */
export const criticalIssue_MissingConstraints = {
  description: `
    Current State: Minimal database constraints
    Risks:
    - Negative balances (account.balance < 0 possible)
    - Duplicate transactions (no uniqueness constraint)
    - Orphaned records (soft-deletes without checks)
    - Circular transfers (A→B→C→A possible)
    - Impossible account types (type field has no enum)
  `,

  specific_issues: {
    account_balance: {
      issue: 'Can be negative without validation',
      current: 'balance Decimal @db.Decimal(12,2)',
      risk: 'Overdraft not tracked, users confused about actual balance',
      solution: `
        ALTER TABLE accounts ADD CONSTRAINT check_balance_non_negative 
          CHECK (balance >= 0);
          
        Add overdraft_limit DECIMAL(12,2) field for supported overdrafts
      `
    },

    transaction_amounts: {
      issue: 'No constraint on positive amounts',
      current: 'amount Decimal @db.Decimal(12,2)',
      risk: 'Negative amounts accepted, double-reversal attacks',
      solution: `
        ALTER TABLE transactions ADD CONSTRAINT check_amount_positive 
          CHECK (amount > 0);
      `
    },

    account_type: {
      issue: 'String field, no enum validation',
      current: 'type String @default("bank")',
      risk: 'Invalid types (typo: "bnak") silently accepted',
      solution: `
        enum AccountType {
          bank
          credit_card
          debit_card
          digital_wallet
          cash
        }
        
        Then: type AccountType @default(bank)
      `
    },

    loan_status: {
      issue: 'No validation of status transitions',
      current: 'status String @default("active")',
      risk: 'Active→Closed→Active loops, invalid states',
      solution: `
        enum LoanStatus {
          pending
          active
          paused
          closed
          defaulted
        }
        
        Add transition validation in LoanService
      `
    },

    group_expense_settlement: {
      issue: 'No settlement tracking for group expenses',
      current: 'No hasPaid tracking at group level',
      risk: 'Unclear who owes whom, settlement disputes',
      solution: `
        Add to GroupExpenseMember:
        - settlementStatus ENUM (pending, partial, settled)
        - settlementDate DateTime
        - settlementProofUrl String (receipt upload)
      `
    }
  },

  implementation_steps: [
    {
      step: 1,
      task: 'Create database constraint script',
      file_changes: 'backend/prisma/migrations/add_constraints.sql',
      effort: '2 hours',
      content: `
        -- Account constraints
        ALTER TABLE accounts
          ADD CONSTRAINT check_balance_non_negative CHECK (balance >= 0),
          ADD CONSTRAINT check_currency_not_empty CHECK (currency != '');
          
        -- Transaction constraints
        ALTER TABLE transactions
          ADD CONSTRAINT check_amount_positive CHECK (amount > 0),
          ADD CONSTRAINT check_date_not_future CHECK (date <= NOW());
          
        -- Loan constraints
        ALTER TABLE loans
          ADD CONSTRAINT check_principal_positive CHECK (principal_amount > 0),
          ADD CONSTRAINT check_balance_non_negative CHECK (outstanding_balance >= 0);
          
        -- Loan payment constraints
        ALTER TABLE loan_payments
          ADD CONSTRAINT check_payment_positive CHECK (amount > 0);
          
        -- Group expense constraints
        ALTER TABLE group_expenses
          ADD CONSTRAINT check_total_positive CHECK (total_amount > 0);
          
        -- Create indexes for common queries
        CREATE INDEX idx_accounts_user_active ON accounts(user_id, is_active);
        CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
        CREATE INDEX idx_loans_user_status ON loans(user_id, status);
      `
    },
    {
      step: 2,
      task: 'Create enum types in Prisma schema',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '3 hours',
      content: `
        enum AccountType {
          bank
          credit_card
          debit_card
          digital_wallet
          cash
        }
        
        enum TransactionType {
          expense
          income
          transfer
          loan_payment
        }
        
        enum LoanStatus {
          pending
          active
          paused
          closed
          defaulted
        }
        
        enum GroupExpenseStatus {
          draft
          active
          settled
          cancelled
        }
        
        enum SettlementStatus {
          pending
          partial
          settled
          disputed
        }
        
        -- Update models to use enums
        model Account {
          type AccountType @default(bank)
          ...
        }
      `
    },
    {
      step: 3,
      task: 'Create validation layer',
      file_changes: 'backend/src/modules/accounts/account-validation.ts',
      effort: '3 hours',
      responsibility: `
        - Validate balance never negative
        - Validate amount always positive
        - Validate transaction date not in future
        - Validate account ownership before updates
      `
    },
    {
      step: 4,
      task: 'Add trigger-based balance recalculation',
      file_changes: 'backend/src/workers/balance-reconciliation.worker.ts',
      effort: '4 hours',
      responsibility: `
        - Run daily
        - Recalculate account balance from all transactions
        - Verify against current balance
        - Log discrepancies
      `
    }
  ],

  estimated_total_effort: '12 hours',
  priority: '🔴 CRITICAL',
  affects_compliance: true,
};

/**
 * 3.2 IMPORTANT ISSUE: Missing Composite Indexes
 * ──────────────────────────────────────────────
 */
export const importantIssue_MissingCompositeIndexes = {
  description: `
    Current: Individual indexes on commonly-queried fields
    Problem: Multi-field queries do full table scans
    Impact: Slow queries, poor performance at scale (1M users)
  `,

  missing_indexes: [
    {
      query: 'Get user transactions by date range',
      fields: ['userId', 'date'],
      current: 'Two separate indexes',
      needed: 'Composite index (userId, date DESC)',
      expected_improvement: '100-1000x faster'
    },
    {
      query: 'Get user active accounts',
      fields: ['userId', 'isActive'],
      current: 'Two separate indexes',
      needed: 'Composite index (userId, isActive)',
      expected_improvement: '50-500x faster'
    },
    {
      query: 'Get pending syncs for device',
      fields: ['userId', 'deviceId', 'status'],
      current: 'No index',
      needed: 'Composite index (userId, deviceId, status)',
      expected_improvement: '1000x faster'
    },
    {
      query: 'Get user group expenses',
      fields: ['userId', 'date', 'status'],
      current: 'No composite index',
      needed: 'Composite index (userId, date DESC, status)',
      expected_improvement: '500-2000x faster'
    },
    {
      query: 'Get pending notifications',
      fields: ['userId', 'isRead', 'createdAt'],
      current: 'No composite index',
      needed: 'Composite index (userId, isRead, createdAt DESC)',
      expected_improvement: '100-500x faster'
    }
  ],

  solution: `
    Update Prisma schema with composite indexes:
    
    model Transaction {
      @@index([userId, date(sort: Desc)])
      @@index([accountId, date(sort: Desc)])
    }
    
    model Account {
      @@index([userId, isActive])
    }
    
    model SyncQueue {
      @@index([userId, deviceId, status])
    }
    
    model GroupExpense {
      @@index([userId, date(sort: Desc), status])
    }
    
    model Notification {
      @@index([userId, isRead, createdAt(sort: Desc)])
    }
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Analyze query patterns',
      file_changes: 'backend/src/modules/*/[entity].queries.ts',
      effort: '3 hours',
      responsibility: 'Identify all find queries and their filters'
    },
    {
      step: 2,
      task: 'Add composite indexes',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model Transaction {
          id String @id @default(uuid())
          userId String
          accountId String
          date DateTime
          // ... other fields
          
          @@index([userId, date(sort: Desc)])
          @@index([accountId, date(sort: Desc)])
          @@index([userId, category])
        }
        
        model Account {
          id String @id @default(uuid())
          userId String
          isActive Boolean
          
          @@index([userId, isActive])
        }
        
        model SyncQueue {
          userId String
          deviceId String
          status String
          
          @@index([userId, deviceId, status])
        }
      `
    },
    {
      step: 3,
      task: 'Test queries with EXPLAIN',
      file_changes: 'backend/tests/query-performance.test.ts',
      effort: '4 hours',
      responsibility: `
        - Run EXPLAIN ANALYZE on all queries
        - Verify indexes are used
        - Benchmark before/after
      `
    }
  ],

  estimated_total_effort: '9 hours',
  priority: '🟡 IMPORTANT',
  affects_performance: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 4: REAL-TIME SYNCHRONIZATION ARCHITECTURE                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 4.1 CRITICAL ISSUE: Conflict Resolution in Offline-First Sync
 * ──────────────────────────────────────────────────────────────
 */
export const criticalIssue_NoConflictResolution = {
  description: `
    Current: SyncQueue tracks pending syncs, but no conflict resolution
    Scenario: User edits transaction on Device A and Device B (offline)
    Risk: Last-write-wins (data loss), inconsistent state across devices
    Impact: 🔴 CRITICAL - Sync conflicts corrupt user data
  `,

  problem_detail: `
    Timeline:
    1. Device A: Edit transaction amount $100 → $200 (offline)
    2. Device B: Edit same transaction note (offline)
    3. Device A syncs: Server sees version 1 → 2
    4. Device B syncs: Server sees version 1 → 2 (overwrites A's change)
    
    Result: User's amount edit is lost, inconsistency
  `,

  solution: `
    Implement Operational Transformation (OT) or CRDT:
    
    1. Add versioning to all entities:
       - version: Int (increment on each update)
       - lastModifiedBy: String (deviceId)
       - lastModifiedAt: DateTime
       
    2. Track field-level changes (not full document):
       - transaction.amount changed by A at time T1
       - transaction.notes changed by B at time T2
       
    3. On sync conflict:
       - Keep all non-conflicting changes
       - Merge field-level edits
       - If same field edited: use latest timestamp + alert user
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Add versioning fields to all models',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model Transaction {
          id String @id @default(uuid())
          // ... existing fields
          version Int @default(1)
          lastModifiedBy String // deviceId
          lastModifiedAt DateTime @default(now())
          lastModifiedByUser String? // userId
          conflictResolved Boolean @default(false)
          conflictDetails Json? // { field, deviceAValue, deviceBValue, resolution }
        }
        
        model Account {
          id String @id @default(uuid())
          // ... existing fields
          version Int @default(1)
          lastModifiedBy String
          lastModifiedAt DateTime @default(now())
        }
        
        model Goal {
          // Same pattern
          version Int @default(1)
          lastModifiedBy String
          lastModifiedAt DateTime @default(now())
        }
      `
    },
    {
      step: 2,
      task: 'Create conflict detection service',
      file_changes: 'backend/src/services/conflict-detection.service.ts',
      effort: '5 hours',
      code: `
        export class ConflictDetectionService {
          detectConflict(
            localVersion: number,
            serverVersion: number,
            localChanges: Record<string, any>,
            serverChanges: Record<string, any>
          ): ConflictResult {
            // Extract field changes
            const localFields = Object.keys(localChanges);
            const serverFields = Object.keys(serverChanges);
            
            // Find conflicting fields
            const conflictingFields = localFields.filter(
              field => serverFields.includes(field)
            );
            
            if (conflictingFields.length === 0) {
              return {
                hasConflict: false,
                resolution: 'merge' // Merge non-conflicting changes
              };
            }
            
            // For each conflicting field, use timestamp-based resolution
            const resolutions = conflictingFields.map(field => ({
              field,
              localValue: localChanges[field],
              serverValue: serverChanges[field],
              winner: localChanges[field].timestamp > serverChanges[field].timestamp
                ? 'local' : 'server',
              action: 'alert_user' // Always alert on conflict
            }));
            
            return {
              hasConflict: true,
              conflictingFields,
              resolutions
            };
          }
        }
      `
    },
    {
      step: 3,
      task: 'Create conflict resolution worker',
      file_changes: 'backend/src/workers/conflict-resolution.worker.ts',
      effort: '6 hours',
      responsibility: `
        - Process SyncQueue entries with conflicts
        - Apply conflict resolution logic
        - Update conflictResolved field
        - Queue notification to user about conflicts
        - Log all conflict resolution decisions
      `
    },
    {
      step: 4,
      task: 'Add conflict resolution API endpoint',
      file_changes: 'backend/src/modules/sync/sync.routes.ts',
      effort: '3 hours',
      code: `
        // Get conflicts for user
        router.get('/conflicts', authMiddleware, async (req, res) => {
          const conflicts = await prisma.transaction.findMany({
            where: {
              userId: req.userId,
              conflictResolved: false
            }
          });
          res.json(conflicts);
        });
        
        // User resolves conflict
        router.post('/conflicts/:id/resolve', authMiddleware, async (req, res) => {
          const { resolution } = req.body;
          // Update transaction with user's choice
          const updated = await prisma.transaction.update({
            where: { id: req.params.id },
            data: {
              conflictResolved: true,
              conflictDetails: resolution
            }
          });
          res.json(updated);
        });
      `
    },
    {
      step: 5,
      task: 'Create frontend conflict UI',
      file_changes: 'frontend/src/components/ConflictResolver.tsx',
      effort: '4 hours',
      responsibility: `
        - Show conflict modal when detected
        - Display both versions side-by-side
        - Allow user to choose version or merge manually
        - Send resolution back to backend
      `
    }
  ],

  estimated_total_effort: '20 hours',
  priority: '🔴 CRITICAL',
  affects_reliability: true,
};

/**
 * 4.2 IMPORTANT ISSUE: Sync Queue Visibility and Reliability
 * ───────────────────────────────────────────────────────────
 */
export const importantIssue_SyncQueueGaps = {
  description: `
    Current: SyncQueue tracks pending syncs, but missing:
    - No retry strategy (maxRetries=3 but no backoff logic)
    - No dead-letter queue for failed syncs
    - No visibility for users (hidden backend process)
    - No priority system (all syncs equal importance)
  `,

  missing_features: [
    'Exponential backoff retry (1s, 2s, 4s → 5 min cap)',
    'Dead-letter queue for final failures',
    'Sync status API endpoint for frontend',
    'Priority levels (high=transaction, low=friend)',
    'Batch sync optimization',
    'Sync staleness alerts',
  ],

  solution: `
    Enhanced SyncQueue with:
    
    1. Retry Strategy:
       - Initial delay: 100ms
       - Backoff multiplier: 2x
       - Max delay: 5 minutes
       - Max retries: 10
       - Reset backoff on success
       
    2. Dead-Letter Queue:
       - SyncQueueDLQ model (failed syncs)
       - Reason for failure
       - Admin review capability
       
    3. Frontend Sync Status:
       - GET /api/v1/sync/status
       - Returns pending count, last sync time
       - Shows errors if any
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Add retry strategy fields to SyncQueue',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model SyncQueue {
          id String @id @default(uuid())
          userId String
          deviceId String
          entityType String
          entityId String
          status String @default("pending")
          priority String @default("normal") // high, normal, low
          
          // Retry tracking
          retryCount Int @default(0)
          maxRetries Int @default(10)
          nextRetryAt DateTime?
          lastRetryAt DateTime?
          backoffMultiplier Float @default(2)
          lastError String?
          
          // Metadata
          metadata Json?
          createdAt DateTime @default(now())
          processedAt DateTime?
          
          @@index([userId, status])
          @@index([priority, nextRetryAt])
        }
        
        model SyncQueueDLQ {
          id String @id @default(uuid())
          syncQueueId String // Reference to original
          userId String
          entityType String
          entityId String
          failureReason String
          failureDetails Json
          lastError String
          createdAt DateTime @default(now())
          
          @@index([userId, createdAt])
        }
      `
    },
    {
      step: 2,
      task: 'Create sync queue processor with retry logic',
      file_changes: 'backend/src/workers/sync-processor.worker.ts',
      effort: '6 hours',
      responsibility: `
        - Fetch SyncQueue items by priority + nextRetryAt
        - Apply entity sync logic
        - On failure: calculate nextRetryAt with exponential backoff
        - On max retries exceeded: move to SyncQueueDLQ
        - Update lastError for debugging
      `
    },
    {
      step: 3,
      task: 'Add sync status endpoint',
      file_changes: 'backend/src/modules/sync/sync.routes.ts',
      effort: '3 hours',
      code: `
        router.get('/status', authMiddleware, async (req, res) => {
          const [pending, dlq, lastSync] = await Promise.all([
            prisma.syncQueue.count({
              where: { userId: req.userId, status: 'pending' }
            }),
            prisma.syncQueueDLQ.count({
              where: { userId: req.userId }
            }),
            prisma.syncQueue.findFirst({
              where: { userId: req.userId, status: 'synced' },
              orderBy: { processedAt: 'desc' },
              select: { processedAt: true }
            })
          ]);
          
          res.json({
            pendingCount: pending,
            dlqCount: dlq,
            lastSyncTime: lastSync?.processedAt,
            isSyncing: pending > 0
          });
        });
      `
    },
    {
      step: 4,
      task: 'Add admin DLQ review interface',
      file_changes: 'backend/src/modules/admin/admin.routes.ts',
      effort: '3 hours',
      responsibility: `
        - GET /api/v1/admin/sync-dlq (list failed syncs)
        - POST /api/v1/admin/sync-dlq/:id/retry (manual retry)
        - POST /api/v1/admin/sync-dlq/:id/mark-reviewed
      `
    },
    {
      step: 5,
      task: 'Create frontend sync status UI',
      file_changes: 'frontend/src/components/SyncStatus.tsx',
      effort: '2 hours',
      responsibility: `
        - Show pending sync count
        - Show last sync time
        - Show errors if DLQ items exist
        - Manual sync button
      `
    }
  ],

  estimated_total_effort: '16 hours',
  priority: '🟡 IMPORTANT',
  affects_reliability: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 5: GROUP FINANCE & BORROW/LEND WORKFLOWS                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 5.1 CRITICAL ISSUE: Group Expense Settlement & Reconciliation
 * ──────────────────────────────────────────────────────────────
 */
export const criticalIssue_GroupExpenseSettlement = {
  description: `
    Current: GroupExpenseMember hasPaid flag, but no:
    - Reconciliation across multiple group expenses
    - Settlement transaction creation
    - Payment proof tracking
    - Settlement disputes
    - Circular debt resolution
  `,

  problem_example: `
    Group Trip: A, B, C, D
    - A pays $400 (entire cost)
    - Share: A=$100, B=$100, C=$100, D=$100
    - B owes A $100
    - C owes A $100
    - D owes A $100
    
    But what if:
    - C also owes B $50 from another group
    - B also owes D $75 from another group
    
    Optimal settlement: 
    - C pays B $50
    - D pays A $100 + C $50 = $150? NO!
    - Circular: D→A ($100), A→B ($0 net), B→C ($0 net)
    
    Current system: All three pay A = inefficient, confusing
  `,

  solution: `
    Implement graph-based settlement optimization:
    
    1. Create SettlementGraph model:
       - userId_from
       - userId_to
       - groupId
       - amount
       - reason (which group expense)
       
    2. Algorithm: Find minimum settlement transactions
       - Build directed graph of who owes whom
       - Find cycles and offset them
       - Recommend optimal payment order
       
    3. Settlement workflow:
       - User initiates settlement payment
       - Create Transaction record
       - Mark GroupExpenseMember hasPaid=true
       - Send notification to recipient
       - Auto-resolve circular debts
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create settlement models',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model Settlement {
          id String @id @default(uuid())
          fromUserId String // Payer
          toUserId String // Payee
          groupId String?
          amount Decimal @db.Decimal(12,2)
          reason String // Which group expense
          status String @default("pending") // pending, completed, disputed
          proofUrl String? // Receipt upload
          transactionId String? // Linked transaction
          disputedBy String?
          disputeReason String?
          createdAt DateTime @default(now())
          completedAt DateTime?
          
          @@index([fromUserId, status])
          @@index([toUserId, status])
          @@index([groupId])
        }
        
        model SettlementGraph {
          id String @id @default(uuid())
          userId String
          debtorId String // Who owes this user
          creditorId String // Who this user owes
          netAmount Decimal @db.Decimal(12,2) // Positive = owes us, Negative = we owe
          groupsInvolved String[] // Which group expenses
          createdAt DateTime @default(now())
          updatedAt DateTime @updatedAt
          
          @@unique([userId, debtorId, creditorId])
          @@index([userId])
        }
      `
    },
    {
      step: 2,
      task: 'Create settlement calculation service',
      file_changes: 'backend/src/services/settlement-calculator.service.ts',
      effort: '8 hours',
      code: `
        export class SettlementCalculatorService {
          /**
           * Build settlement graph for a user
           * Returns: minimum set of transactions to balance all debts
           */
          async calculateSettlements(userId: string): Promise<Settlement[]> {
            // Get all group expenses involving user
            const groupExpenses = await this.getGroupExpensesForUser(userId);
            
            // Build debt matrix
            const debtMatrix = this.buildDebtMatrix(userId, groupExpenses);
            
            // Find cycles and offset
            const cycles = this.findDebtCycles(debtMatrix);
            debtMatrix = this.offsetCycles(debtMatrix, cycles);
            
            // Convert to settlement transactions
            const settlements = this.matrixToSettlements(debtMatrix, userId);
            
            return settlements;
          }
          
          /**
           * Resolve circular debts
           * A owes B $100, B owes C $100, C owes A $50
           * Optimized: A pays C $50, C pays B $100 (instead of 3 transactions)
           */
          private offsetCycles(
            debtMatrix: Map<string, Map<string, number>>,
            cycles: Array<string[]>
          ): Map<string, Map<string, number>> {
            for (const cycle of cycles) {
              const minDebt = Math.min(...cycle.map((user, i) => {
                const next = cycle[(i + 1) % cycle.length];
                return debtMatrix.get(user)?.get(next) || 0;
              }));
              
              // Reduce all debts in cycle by minimum
              for (let i = 0; i < cycle.length; i++) {
                const from = cycle[i];
                const to = cycle[(i + 1) % cycle.length];
                const currentDebt = debtMatrix.get(from)?.get(to) || 0;
                debtMatrix.get(from)?.set(to, currentDebt - minDebt);
              }
            }
            
            return debtMatrix;
          }
        }
      `
    },
    {
      step: 3,
      task: 'Create settlement API endpoints',
      file_changes: 'backend/src/modules/groups/group.routes.ts',
      effort: '4 hours',
      code: `
        // Get settlement graph for user
        router.get('/settlements', authMiddleware, async (req, res) => {
          const settlements = await settlementService.calculateSettlements(
            req.userId!
          );
          res.json(settlements);
        });
        
        // Initiate settlement payment
        router.post('/settlements', authMiddleware, async (req, res) => {
          const { toUserId, amount, groupId } = req.body;
          
          // Create settlement + transaction
          const settlement = await prisma.settlement.create({
            data: {
              fromUserId: req.userId!,
              toUserId,
              amount,
              groupId,
              status: 'pending'
            }
          });
          
          // Create transaction to track payment
          const transaction = await transactionService.createSettlementTransaction({
            fromAccountId: req.body.fromAccountId,
            toAccountId: req.body.toAccountId,
            amount,
            settlementId: settlement.id
          });
          
          // Link transaction to settlement
          await prisma.settlement.update({
            where: { id: settlement.id },
            data: { transactionId: transaction.id }
          });
          
          // Notify recipient
          await notificationService.sendSettlementNotification(toUserId, amount);
          
          res.json(settlement);
        });
        
        // Mark settlement as paid (with proof)
        router.post(
          '/settlements/:id/complete',
          authMiddleware,
          upload.single('proof'),
          async (req, res) => {
            const { proofUrl } = req.file ? 
              { proofUrl: req.file.path } : 
              req.body;
            
            const settlement = await prisma.settlement.update({
              where: { id: req.params.id },
              data: {
                status: 'completed',
                completedAt: new Date(),
                proofUrl
              }
            });
            
            // Mark group expense member as paid
            if (settlement.groupId) {
              await markGroupExpenseAsPaid(settlement.groupId, settlement.fromUserId);
            }
            
            res.json(settlement);
          }
        );
        
        // Dispute settlement
        router.post('/settlements/:id/dispute', authMiddleware, async (req, res) => {
          const { reason } = req.body;
          const settlement = await prisma.settlement.update({
            where: { id: req.params.id },
            data: {
              status: 'disputed',
              disputedBy: req.userId!,
              disputeReason: reason
            }
          });
          
          // Notify admin
          await adminService.notifySettlementDispute(settlement);
          
          res.json(settlement);
        });
      `
    },
    {
      step: 4,
      task: 'Create settlement UI component',
      file_changes: 'frontend/src/components/SettlementView.tsx',
      effort: '5 hours',
      responsibility: `
        - Show settlement graph (who owes whom)
        - Visualization: network graph or list
        - Show optimized payment order
        - "Mark as Paid" button with proof upload
        - "Dispute" button for discrepancies
      `
    }
  ],

  estimated_total_effort: '19 hours',
  priority: '🔴 CRITICAL',
  affects_functionality: true,
};

/**
 * 5.2 IMPORTANT ISSUE: Loan Management & EMI Calculations
 * ────────────────────────────────────────────────────────
 */
export const importantIssue_LoanManagement = {
  description: `
    Current: Manual EMI tracking, no automation
    Gaps:
    - Interest calculation not automated
    - EMI amount hardcoded (not calculated from rate)
    - No amortization schedule
    - No overdue tracking
    - No auto-reminder for upcoming payments
  `,

  solution: `
    Implement loan amortization system:
    
    1. Calculate EMI from: P, R, N
       EMI = P × [R(1+R)^N] / [(1+R)^N - 1]
       
    2. Create amortization schedule on loan creation
    3. Auto-debit on EMI date (via scheduled job)
    4. Track principal + interest separately
    5. Send reminders 3 days before due date
    6. Mark as overdue after 15 days late
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create loan amortization service',
      file_changes: 'backend/src/services/loan-amortization.service.ts',
      effort: '6 hours',
      code: `
        export class LoanAmortizationService {
          /**
           * Calculate EMI (Equated Monthly Installment)
           * EMI = P × [R(1+R)^N] / [(1+R)^N - 1]
           */
          calculateEMI(
            principal: number,
            annualRate: number,
            months: number
          ): number {
            const monthlyRate = annualRate / 12 / 100;
            const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, months);
            const denominator = Math.pow(1 + monthlyRate, months) - 1;
            return numerator / denominator;
          }
          
          /**
           * Generate amortization schedule
           */
          generateSchedule(
            loanId: string,
            principal: number,
            annualRate: number,
            months: number,
            startDate: Date
          ): AmortizationSchedule[] {
            const emi = this.calculateEMI(principal, annualRate, months);
            const monthlyRate = annualRate / 12 / 100;
            
            let balance = principal;
            const schedule: AmortizationSchedule[] = [];
            
            for (let i = 1; i <= months; i++) {
              const interest = balance * monthlyRate;
              const principalPayment = emi - interest;
              balance -= principalPayment;
              
              schedule.push({
                installmentNumber: i,
                dueDate: addMonths(startDate, i),
                emi: emi,
                principal: principalPayment,
                interest: interest,
                balance: Math.max(0, balance), // Avoid negative due to rounding
                status: 'pending'
              });
            }
            
            return schedule;
          }
        }
      `
    },
    {
      step: 2,
      task: 'Create LoanPaymentSchedule model',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model LoanPaymentSchedule {
          id String @id @default(uuid())
          loanId String
          installmentNumber Int
          dueDate DateTime
          emiAmount Decimal @db.Decimal(12,2) // Total EMI
          principalAmount Decimal @db.Decimal(12,2) // Part going to principal
          interestAmount Decimal @db.Decimal(12,2) // Part going to interest
          outstandingBalance Decimal @db.Decimal(12,2)
          
          status String @default("pending") // pending, paid, overdue, partial
          paidAmount Decimal @default(0) @db.Decimal(12,2)
          paidDate DateTime?
          
          createdAt DateTime @default(now())
          loan Loan @relation(fields: [loanId], references: [id], onDelete: Cascade)
          
          @@index([loanId, status])
          @@index([dueDate])
        }
      `
    },
    {
      step: 3,
      task: 'Create loan payment worker',
      file_changes: 'backend/src/workers/loan-payment.worker.ts',
      effort: '5 hours',
      responsibility: `
        - Run daily at 6 AM
        - Find all loans with due date today
        - Check linked account for balance
        - Auto-debit if sufficient funds
        - Mark as paid or partial
        - Queue overdue notifications
      `
    },
    {
      step: 4,
      task: 'Create loan reminder job',
      file_changes: 'backend/src/workers/loan-reminders.worker.ts',
      effort: '3 hours',
      responsibility: `
        - Run daily
        - Find upcoming payments (3 days away)
        - Send reminders to user
        - For overdue: escalate to red alert
      `
    },
    {
      step: 5,
      task: 'Add loan management API',
      file_changes: 'backend/src/modules/loans/loan.routes.ts',
      effort: '4 hours',
      code: `
        // Get amortization schedule
        router.get('/:id/schedule', authMiddleware, async (req, res) => {
          const schedule = await prisma.loanPaymentSchedule.findMany({
            where: { loanId: req.params.id },
            orderBy: { installmentNumber: 'asc' }
          });
          res.json(schedule);
        });
        
        // Get loan details with interest calculation
        router.get('/:id/details', authMiddleware, async (req, res) => {
          const loan = await prisma.loan.findUnique({
            where: { id: req.params.id },
            include: {
              paymentSchedule: true,
              payments: { orderBy: { date: 'desc' } }
            }
          });
          
          // Calculate interest paid vs outstanding
          const totalPaid = loan.payments.reduce((sum, p) => sum + p.amount, 0);
          const totalInterest = loan.paymentSchedule
            .reduce((sum, s) => sum + s.interestAmount, 0);
          
          res.json({
            ...loan,
            totalPaid,
            totalInterest,
            interestPaid: loan.payments.reduce((sum, p) => {
              // Estimate interest from payment
              return sum + (p.amount * loan.interestRate / 100 / 12);
            }, 0)
          });
        });
        
        // Manual payment
        router.post('/:id/pay', authMiddleware, async (req, res) => {
          const { amount, accountId } = req.body;
          const loan = await prisma.loan.findUnique({
            where: { id: req.params.id }
          });
          
          // Create payment
          const payment = await prisma.loanPayment.create({
            data: {
              loanId: req.params.id,
              amount,
              accountId,
              date: new Date()
            }
          });
          
          // Update outstanding balance
          await prisma.loan.update({
            where: { id: req.params.id },
            data: {
              outstandingBalance: loan.outstandingBalance - amount
            }
          });
          
          // Mark schedule as paid
          const schedule = await prisma.loanPaymentSchedule.findFirst({
            where: { loanId: req.params.id, status: 'pending' }
          });
          
          if (schedule) {
            await prisma.loanPaymentSchedule.update({
              where: { id: schedule.id },
              data: {
                status: amount >= schedule.emiAmount ? 'paid' : 'partial',
                paidAmount: amount,
                paidDate: new Date()
              }
            });
          }
          
          res.json(payment);
        });
      `
    }
  ],

  estimated_total_effort: '20 hours',
  priority: '🟡 IMPORTANT',
  affects_functionality: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 6: API SECURITY & RATE LIMITING                                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 6.1 CRITICAL ISSUE: Per-User Rate Limiting
 * ──────────────────────────────────────────
 */
export const criticalIssue_NoPerUserRateLimit = {
  description: `
    Current: Global rate limiting only (if any)
    Risk: One user can exhaust limits for all users
    Attacks: Brute force auth, bulk API scraping, DoS
  `,

  solution: `
    Implement per-user + per-endpoint rate limiting:
    
    1. User limits: 100 requests/minute per user
    2. Endpoint limits:
       - /auth/login: 5 requests/minute per IP
       - /transactions/create: 10 requests/minute per user
       - /search: 30 requests/minute per user
       - /export: 1 request/minute per user
    3. Graceful degradation: 429 Too Many Requests + retry-after
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create Redis-backed rate limiter',
      file_changes: 'backend/src/utils/rate-limiter.ts',
      effort: '4 hours',
      code: `
        import Redis from 'ioredis';
        
        export class RateLimiter {
          private redis: Redis;
          
          constructor() {
            this.redis = new Redis(process.env.REDIS_URL);
          }
          
          /**
           * Token bucket algorithm
           */
          async checkLimit(
            key: string,
            limit: number,
            windowSeconds: number = 60
          ): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
            const now = Date.now();
            const windowKey = \`\${key}:\${Math.floor(now / (windowSeconds * 1000))}\`;
            
            const current = await this.redis.incr(windowKey);
            
            if (current === 1) {
              // First request in window, set expiry
              await this.redis.expire(windowKey, windowSeconds);
            }
            
            const allowed = current <= limit;
            const remaining = Math.max(0, limit - current);
            const retryAfter = allowed ? 0 : windowSeconds;
            
            return { allowed, remaining, retryAfter };
          }
        }
        
        export const rateLimiter = new RateLimiter();
      `
    },
    {
      step: 2,
      task: 'Create per-user rate limit middleware',
      file_changes: 'backend/src/middleware/per-user-rate-limit.ts',
      effort: '3 hours',
      code: `
        export const perUserRateLimit = (
          limit: number = 100,
          windowSeconds: number = 60
        ) => {
          return async (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.userId) return next(); // Only for authenticated users
            
            const key = \`ratelimit:user:\${req.userId}\`;
            const { allowed, remaining, retryAfter } = 
              await rateLimiter.checkLimit(key, limit, windowSeconds);
            
            res.set('X-RateLimit-Limit', limit.toString());
            res.set('X-RateLimit-Remaining', remaining.toString());
            res.set('X-RateLimit-Reset', 
              new Date(Date.now() + retryAfter * 1000).toISOString());
            
            if (!allowed) {
              return res.status(429).json({
                error: 'Too many requests',
                retryAfter
              });
            }
            
            next();
          };
        };
      `
    },
    {
      step: 3,
      task: 'Apply rate limits to sensitive endpoints',
      file_changes: 'backend/src/modules/auth/auth.routes.ts',
      effort: '2 hours',
      code: `
        // Login: 5 attempts per minute per IP
        router.post('/login', 
          ipRateLimit(5, 60),
          validateRequest(loginSchema),
          loginHandler
        );
        
        // Signup: 3 per minute per IP
        router.post('/signup',
          ipRateLimit(3, 60),
          validateRequest(signupSchema),
          signupHandler
        );
        
        // Refresh token: 20 per minute per user
        router.post('/refresh',
          authMiddleware,
          perUserRateLimit(20, 60),
          refreshHandler
        );
      `
    },
    {
      step: 4,
      task: 'Apply to transaction endpoints',
      file_changes: 'backend/src/modules/transactions/transaction.routes.ts',
      effort: '2 hours',
      code: `
        // Create transaction: 10 per minute per user
        router.post('/',
          authMiddleware,
          perUserRateLimit(10, 60),
          validateRequest(createTransactionSchema),
          createTransactionHandler
        );
        
        // Get transactions: 30 per minute per user
        router.get('/',
          authMiddleware,
          perUserRateLimit(30, 60),
          getTransactionsHandler
        );
        
        // Export: 1 per minute per user
        router.get('/export',
          authMiddleware,
          perUserRateLimit(1, 60),
          exportHandler
        );
      `
    }
  ],

  estimated_total_effort: '11 hours',
  priority: '🔴 CRITICAL',
  affects_security: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 7: SCALABILITY FOR 1M+ USERS                                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 7.1 IMPORTANT ISSUE: Query Performance at Scale
 * ──────────────────────────────────────────────
 */
export const importantIssue_QueryPerformance = {
  description: `
    Current: Individual queries, N+1 problem in some places
    Scale risk: At 1M users with 50M transactions
    Impact: 
    - User profile page: 20+ queries (should be 1-2)
    - Transaction list: N+1 on categories (1 + N queries)
    - Dashboard: Multiple independent queries (should be combined)
  `,

  specific_problems: {
    user_profile: {
      current: `
        1. Get user
        2. Get accounts (N queries for balances)
        3. Get transactions summary
        4. Get goals
        5. Get investments
        6. Get loans
        7. Get notifications (unread count)
        8. Get advisor info (if applicable)
      `,
      queries: 8,
      solution: 'Combine into 2 queries via Prisma include'
    },

    transaction_list: {
      current: `
        1. Get transactions
        2. For each: Get account (N queries)
        3. For each: Get category
        4. For each: Get group (if group expense)
      `,
      queries: '1 + N + N + N = 1 + 3N',
      solution: 'Single query with nested includes'
    },

    dashboard: {
      current: `
        1. Sum transactions by category
        2. Sum by account
        3. Get top spending categories
        4. Get recent transactions
        5. Get upcoming bills
        6. Get goals progress
      `,
      queries: 6,
      solution: 'Aggregate query + computed fields in DB'
    }
  },

  solution: `
    1. Use Prisma select + include strategically
    2. Create database views for common aggregations
    3. Add materialized views for expensive queries
    4. Cache hot data (user preferences, settings)
    5. Batch queries with Promise.all where safe
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Optimize user profile query',
      file_changes: 'backend/src/modules/users/user.service.ts',
      effort: '3 hours',
      before: `
        // BAD: 8+ queries
        const user = await prisma.user.findUnique({ where: { id } });
        const accounts = await prisma.account.findMany({ where: { userId: id } });
        const transactions = await prisma.transaction.findMany({ ... });
        // etc
      `,
      after: `
        // GOOD: 1 query with includes
        const user = await prisma.user.findUnique({
          where: { id },
          include: {
            accounts: {
              select: {
                id: true,
                name: true,
                type: true,
                balance: true,
                currency: true
              }
            },
            transactions: {
              take: 10,
              orderBy: { date: 'desc' },
              include: { account: true, category: true }
            },
            goals: { take: 5 },
            loans: { where: { status: 'active' } },
            investments: { where: { deletedAt: null } },
            notifications: {
              where: { isRead: false },
              take: 5
            }
          }
        });
      `
    },
    {
      step: 2,
      task: 'Create database view for user statistics',
      file_changes: 'backend/src/db/views.sql',
      effort: '3 hours',
      code: `
        CREATE VIEW user_statistics AS
        SELECT
          u.id,
          COUNT(DISTINCT a.id) as account_count,
          COUNT(DISTINCT t.id) as transaction_count,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expenses,
          COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
          COALESCE(SUM(a.balance), 0) as total_balance,
          MAX(t.date) as last_transaction_date,
          COUNT(DISTINCT CASE WHEN n.is_read = false THEN n.id END) as unread_notifications
        FROM users u
        LEFT JOIN accounts a ON u.id = a.user_id AND a.deleted_at IS NULL
        LEFT JOIN transactions t ON u.id = t.user_id AND t.deleted_at IS NULL
        LEFT JOIN notifications n ON u.id = n.user_id
        GROUP BY u.id;
        
        CREATE VIEW dashboard_data AS
        SELECT
          u.id,
          json_agg(json_build_object(
            'category', t.category,
            'amount', SUM(t.amount),
            'count', COUNT(*)
          ) ORDER BY SUM(t.amount) DESC) as spending_by_category,
          json_agg(json_build_object(
            'account', a.name,
            'balance', a.balance,
            'type', a.type
          )) as accounts,
          json_agg(json_build_object(
            'description', t.description,
            'amount', t.amount,
            'date', t.date
          ) ORDER BY t.date DESC LIMIT 10) as recent_transactions
        FROM users u
        LEFT JOIN accounts a ON u.id = a.user_id
        LEFT JOIN transactions t ON u.id = t.user_id AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
        GROUP BY u.id;
      `
    },
    {
      step: 3,
      task: 'Create query cache layer',
      file_changes: 'backend/src/cache/query-cache.ts',
      effort: '4 hours',
      code: `
        export class QueryCache {
          async getUserProfile(userId: string) {
            const cacheKey = \`user:profile:\${userId}\`;
            
            // Try cache first
            let cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
            
            // Fetch from DB
            const profile = await prisma.user.findUnique({
              where: { id: userId },
              include: { /* optimized includes */ }
            });
            
            // Cache for 5 minutes
            await redis.setex(cacheKey, 300, JSON.stringify(profile));
            
            return profile;
          }
          
          // Invalidate on user update
          async invalidateUserProfile(userId: string) {
            await redis.del(\`user:profile:\${userId}\`);
          }
        }
      `
    }
  ],

  estimated_total_effort: '10 hours',
  priority: '🟡 IMPORTANT',
  affects_performance: true,
};

/**
 * 7.2 IMPORTANT ISSUE: Horizontal Scaling Architecture
 * ────────────────────────────────────────────────────
 */
export const importantIssue_HorizontalScaling = {
  description: `
    Current: Single-instance server architecture (assumed)
    Scale risk: At 1M users, single instance bottleneck
    Needs: 
    - Load balancing across multiple servers
    - Distributed caching
    - Database read replicas
    - Separate queue processing
  `,

  solution: `
    1. Load Balancing: Use AWS ALB or similar
    2. Session Persistence: Store sessions in Redis (not memory)
    3. File Storage: Use S3/Cloud Storage (not local disk)
    4. Database: Read replicas for reporting queries
    5. Queue Workers: Separate service instances for workers
    6. Cache: Redis cluster for distributed caching
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Extract sessions to Redis',
      file_changes: 'backend/src/config/session.ts',
      effort: '3 hours',
      code: `
        import session from 'express-session';
        import RedisStore from 'connect-redis';
        
        export const configureSession = (app: Express) => {
          const redisClient = redis.createClient({
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379')
          });
          
          const store = new RedisStore({ client: redisClient });
          
          app.use(session({
            store,
            secret: process.env.SESSION_SECRET!,
            resave: false,
            saveUninitialized: false,
            cookie: {
              secure: process.env.NODE_ENV === 'production',
              httpOnly: true,
              sameSite: 'strict',
              maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
          }));
        };
      `
    },
    {
      step: 2,
      task: 'Move file uploads to cloud storage',
      file_changes: 'backend/src/config/storage.ts',
      effort: '3 hours',
      code: `
        import AWS from 'aws-sdk';
        
        export const uploadToS3 = async (
          file: Express.Multer.File
        ): Promise<string> => {
          const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          });
          
          const params = {
            Bucket: process.env.S3_BUCKET!,
            Key: \`uploads/\${Date.now()}-\${file.originalname}\`,
            Body: file.buffer,
            ContentType: file.mimetype,
            ServerSideEncryption: 'AES256'
          };
          
          const result = await s3.upload(params).promise();
          return result.Location;
        };
      `
    },
    {
      step: 3,
      task: 'Configure database read replica',
      file_changes: 'backend/src/db/prisma-replica.ts',
      effort: '2 hours',
      code: `
        export const createReplicaClient = () => {
          return new PrismaClient({
            datasources: {
              db: {
                url: process.env.DATABASE_REPLICA_URL
              }
            }
          });
        };
        
        // Use for read-only queries
        export const prismaReplica = createReplicaClient();
        
        // In queries:
        const transactions = await prismaReplica.transaction.findMany({
          where: { userId: id }
        });
      `
    },
    {
      step: 4,
      task: 'Create Docker compose for distributed setup',
      file_changes: 'docker-compose.prod.yml',
      effort: '3 hours',
      code: `
        version: '3.8'
        services:
          app-1:
            image: KANAKU-backend:latest
            ports: ["3001:3000"]
            depends_on: [redis, postgres, postgres-replica]
            
          app-2:
            image: KANAKU-backend:latest
            ports: ["3002:3000"]
            depends_on: [redis, postgres, postgres-replica]
            
          app-3:
            image: KANAKU-backend:latest
            ports: ["3003:3000"]
            depends_on: [redis, postgres, postgres-replica]
            
          redis:
            image: redis:latest
            ports: ["6379:6379"]
            
          postgres:
            image: postgres:15
            environment:
              POSTGRES_PASSWORD: ${DB_PASSWORD}
              POSTGRES_DB: KANAKU
            ports: ["5432:5432"]
            
          postgres-replica:
            image: postgres:15
            environment:
              POSTGRES_PASSWORD: ${DB_PASSWORD}
            ports: ["5433:5432"]
            
          load-balancer:
            image: nginx:latest
            ports: ["80:80"]
            volumes:
              - ./nginx.conf:/etc/nginx/nginx.conf
      `
    }
  ],

  estimated_total_effort: '11 hours',
  priority: '🟡 IMPORTANT',
  affects_scalability: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ SECTION 8: AUDIT, COMPLIANCE & OPERATIONAL READINESS                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * 8.1 IMPORTANT ISSUE: Comprehensive Audit Logging
 * ──────────────────────────────────────────────────
 */
export const importantIssue_AuditLogging = {
  description: `
    Current: auditLogger exists but coverage may be incomplete
    Needs: Comprehensive logging of all financial operations
    Compliance: GDPR audit trails, tax deductibility, dispute resolution
  `,

  what_to_audit: [
    'User login/logout (who, when, IP)',
    'Transaction creation/modification/deletion',
    'Account opening/closing',
    'Balance adjustments (manual)',
    'Loan creation/payment',
    'Permission changes',
    'Sensitive data access (PII reads)',
    'Failed login attempts',
    'Group expense settlements',
    'Admin actions (user suspension, data export)',
    'API key generation/rotation',
    'Bulk operations (imports)',
  ],

  implementation: `
    Audit entry should contain:
    - userId (who)
    - action (what)
    - resourceType & resourceId (which)
    - timestamp (when)
    - ipAddress (where)
    - userAgent (browser/device)
    - resultStatus (success/failure)
    - changedFields (before/after for modifications)
    - severity (high/medium/low)
  `,

  implementation_steps: [
    {
      step: 1,
      task: 'Create comprehensive audit model',
      file_changes: 'backend/prisma/schema.prisma',
      effort: '2 hours',
      code: `
        model AuditLog {
          id String @id @default(uuid())
          userId String
          action String // create, read, update, delete, login, export
          resourceType String // transaction, account, loan, user, etc
          resourceId String?
          severity String @default("info") // info, warning, critical
          
          // Before/After for modifications
          changesBefore Json?
          changesAfter Json?
          
          // Context
          ipAddress String?
          userAgent String?
          status String // success, failure
          errorMessage String?
          
          createdAt DateTime @default(now())
          
          @@index([userId, createdAt])
          @@index([resourceType, resourceId])
          @@index([action])
          @@index([severity])
        }
      `
    },
    {
      step: 2,
      task: 'Create audit wrapper service',
      file_changes: 'backend/src/utils/audit-wrapper.ts',
      effort: '4 hours',
      code: `
        export async function auditOperation<T>(
          userId: string,
          action: string,
          resourceType: string,
          fn: () => Promise<T>,
          options: {
            resourceId?: string;
            severity?: string;
            changeBefore?: any;
            changeAfter?: any;
          } = {}
        ): Promise<T> {
          const startTime = Date.now();
          
          try {
            const result = await fn();
            
            // Log success
            await auditLog.create({
              userId,
              action,
              resourceType,
              resourceId: options.resourceId,
              severity: options.severity || 'info',
              changesBefore: options.changeBefore,
              changesAfter: options.changeAfter,
              status: 'success'
            });
            
            return result;
          } catch (error) {
            // Log failure
            await auditLog.create({
              userId,
              action,
              resourceType,
              severity: 'warning',
              status: 'failure',
              errorMessage: (error as Error).message
            });
            
            throw error;
          }
        }
      `
    },
    {
      step: 3,
      task: 'Apply to all financial operations',
      file_changes: 'backend/src/modules/transactions/transaction.service.ts',
      effort: '5 hours',
      code: `
        async createTransaction(userId: string, data: any) {
          return auditOperation(
            userId,
            'create',
            'transaction',
            async () => {
              const transaction = await prisma.transaction.create({
                data: { ...data, userId }
              });
              return transaction;
            },
            {
              resourceId: transaction.id,
              changeAfter: transaction
            }
          );
        }
        
        async updateTransaction(userId: string, id: string, data: any) {
          const before = await prisma.transaction.findUnique({ where: { id } });
          
          return auditOperation(
            userId,
            'update',
            'transaction',
            async () => {
              return prisma.transaction.update({
                where: { id },
                data
              });
            },
            {
              resourceId: id,
              changeBefore: before,
              changeAfter: data
            }
          );
        }
      `
    },
    {
      step: 4,
      task: 'Create audit report API',
      file_changes: 'backend/src/modules/audit/audit.routes.ts',
      effort: '3 hours',
      code: `
        // Get user's audit log
        router.get('/logs/:userId', authMiddleware, async (req, res) => {
          // Only user or admin can view
          if (req.userId !== req.params.userId && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
          }
          
          const logs = await prisma.auditLog.findMany({
            where: { userId: req.params.userId },
            orderBy: { createdAt: 'desc' },
            take: 100
          });
          
          res.json(logs);
        });
        
        // Get suspicious activity (admin only)
        router.get('/suspicious', requireRole('admin'), async (req, res) => {
          const suspicious = await prisma.auditLog.findMany({
            where: {
              OR: [
                { status: 'failure', action: 'login' },
                { severity: 'critical' },
                { action: 'export' } // Bulk data access
              ]
            },
            orderBy: { createdAt: 'desc' },
            take: 50
          });
          
          res.json(suspicious);
        });
        
        // Export audit trail for compliance
        router.get('/export/:userId', requireRole('admin'), async (req, res) => {
          const logs = await prisma.auditLog.findMany({
            where: { userId: req.params.userId }
          });
          
          const csv = convertToCSV(logs);
          res.set('Content-Type', 'text/csv');
          res.set('Content-Disposition', 'attachment; filename=audit-log.csv');
          res.send(csv);
        });
      `
    }
  ],

  estimated_total_effort: '14 hours',
  priority: '🟡 IMPORTANT',
  affects_compliance: true,
};

/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ PRIORITY MATRIX & IMPLEMENTATION ROADMAP                                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

export const recommendationsSummary = {
  critical: [
    {
      issue: 'No Double-Entry Bookkeeping',
      effort: '17 hours',
      reason: 'All financial transactions at risk',
      urgency: 'ASAP'
    },
    {
      issue: 'Field-Level Encryption for PII',
      effort: '17 hours',
      reason: 'GDPR/PCI-DSS compliance violation',
      urgency: 'ASAP'
    },
    {
      issue: 'Request Idempotency',
      effort: '10 hours',
      reason: 'Prevents duplicate transactions',
      urgency: 'ASAP'
    },
    {
      issue: 'Conflict Resolution in Offline-First Sync',
      effort: '20 hours',
      reason: 'Data corruption from sync conflicts',
      urgency: '1 week'
    },
    {
      issue: 'Database Constraints & Data Integrity',
      effort: '12 hours',
      reason: 'Silent data corruption risks',
      urgency: '1 week'
    },
    {
      issue: 'Per-User Rate Limiting',
      effort: '11 hours',
      reason: 'Prevent brute force/DoS attacks',
      urgency: '1 week'
    },
  ],

  important: [
    {
      issue: 'Composite Database Indexes',
      effort: '9 hours',
      reason: 'Query performance at 1M users',
      urgency: '2 weeks'
    },
    {
      issue: 'Query Performance Optimization',
      effort: '10 hours',
      reason: 'N+1 problems, slow page loads',
      urgency: '2 weeks'
    },
    {
      issue: 'Sync Queue with Retry Logic',
      effort: '16 hours',
      reason: 'Reliable cross-device sync',
      urgency: '2 weeks'
    },
    {
      issue: 'Group Expense Settlement',
      effort: '19 hours',
      reason: 'Complete group finance workflow',
      urgency: '3 weeks'
    },
    {
      issue: 'Loan Management & Amortization',
      effort: '20 hours',
      reason: 'Automated loan payment processing',
      urgency: '3 weeks'
    },
    {
      issue: 'Horizontal Scaling Architecture',
      effort: '11 hours',
      reason: 'Single-instance bottleneck',
      urgency: '2-3 weeks'
    },
    {
      issue: 'Comprehensive Audit Logging',
      effort: '14 hours',
      reason: 'Compliance & dispute resolution',
      urgency: '3 weeks'
    }
  ],

  nice_to_have: [
    {
      issue: '2FA for Admin/Advisor Operations',
      effort: '6 hours',
      reason: 'Enhanced security for privileged users'
    },
    {
      issue: 'Suspicious Activity Detection',
      effort: '12 hours',
      reason: 'Fraud prevention'
    },
    {
      issue: 'Advanced Search & Analytics',
      effort: '10 hours',
      reason: 'Better user insights'
    },
    {
      issue: 'Data Export with Encryption',
      effort: '5 hours',
      reason: 'User data portability'
    },
  ]
};

/**
 * 8-WEEK IMPLEMENTATION ROADMAP
 * ────────────────────────────
 */
export const implementationRoadmap = {
  week_1_2: {
    name: 'Security & Integrity Foundation',
    tasks: [
      'Double-Entry Bookkeeping (17h)',
      'Request Idempotency (10h)',
      'Per-User Rate Limiting (11h)'
    ],
    total_effort: '38 hours',
    team_size: '2-3 engineers'
  },

  week_3_4: {
    name: 'Data Protection & Compliance',
    tasks: [
      'Field-Level Encryption (17h)',
      'Database Constraints (12h)',
      'Audit Logging (14h)'
    ],
    total_effort: '43 hours',
    team_size: '2 engineers'
  },

  week_5_6: {
    name: 'Sync & Performance',
    tasks: [
      'Conflict Resolution (20h)',
      'Sync Queue Retry Logic (16h)',
      'Database Indexes (9h)',
      'Query Optimization (10h)'
    ],
    total_effort: '55 hours',
    team_size: '2-3 engineers'
  },

  week_7_8: {
    name: 'Financial Features & Scale',
    tasks: [
      'Group Expense Settlement (19h)',
      'Loan Amortization (20h)',
      'Horizontal Scaling (11h)'
    ],
    total_effort: '50 hours',
    team_size: '3 engineers'
  }
};

/**
 * TOTAL EFFORT ESTIMATE: 186 hours = ~4.5 weeks (full team of 2-3)
 */
