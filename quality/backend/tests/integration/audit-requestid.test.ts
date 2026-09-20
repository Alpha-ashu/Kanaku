/**
 * PHASE 2 — Request-ID propagation & Audit Foundation
 *
 * Verifies, without requiring a live DB:
 *   1. AUDIT_MODELS covers every financial / collaboration entity, so the Prisma
 *      interceptor audits ALL create/update/delete on them.
 *   2. Request-ID flows Frontend → API: a valid incoming X-Request-Id is honored
 *      end-to-end and echoed back; an invalid one is replaced; one is always set.
 *   3. Request-ID reaches the audit layer: getRequestActor() (the source the
 *      interceptor + audit() use) exposes the active request's id/actor.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { app } from '../../../../backend/src/app';
import {
  AUDIT_MODELS,
  AUDIT_MODELS_FULL,
  AUDIT_MODELS_LIGHT,
  AUDIT_MODELS_EXCLUDED,
} from '../../../../backend/src/db/prisma';
import { requestContext, getRequestActor } from '../../../../backend/src/middleware/requestContext';

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

/** Every `model X {` declared in the Prisma schema. */
const schemaModels = (): string[] => {
  const schema = readFileSync(
    join(__dirname, '../../../../backend/prisma/schema.prisma'),
    'utf8',
  );
  return [...schema.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm)].map((m) => m[1]);
};

describe('PHASE 2 — Audit coverage', () => {
  // Every financial / collaboration entity the spec requires to be audited.
  const REQUIRED_AUDITED_ENTITIES = [
    'Account', 'Transaction',
    'Loan', 'LoanPayment',
    'Goal', 'GoalContribution', 'GoalMember',
    'Investment', 'GoldAsset',
    'Budget', 'RecurringTransaction', 'ExpenseBill',
    'GroupExpense', 'GroupExpenseMember', 'CollaborationParticipant', 'Friend',
    'AaTransaction',
  ];

  it.each(REQUIRED_AUDITED_ENTITIES)('audits all mutations of %s', (model) => {
    expect(AUDIT_MODELS.has(model)).toBe(true);
  });

  // The guard that keeps "every action is recorded" true over time: adding a
  // model to schema.prisma without classifying it fails here rather than
  // silently creating a table whose writes leave no trace.
  it('classifies every model in the schema as audited or explicitly excluded', () => {
    const unclassified = schemaModels().filter(
      (m) => !AUDIT_MODELS.has(m) && !AUDIT_MODELS_EXCLUDED.has(m),
    );
    expect(unclassified).toEqual([]);
  });

  it('never lists a model in both audit tiers', () => {
    const inBoth = [...AUDIT_MODELS_FULL].filter((m) => AUDIT_MODELS_LIGHT.has(m));
    expect(inBoth).toEqual([]);
  });

  it('never audits the audit trail itself (the interceptor would recurse)', () => {
    expect(AUDIT_MODELS.has('AuditLog')).toBe(false);
    expect(AUDIT_MODELS_EXCLUDED.has('AuditLog')).toBe(true);
  });

  it('captures before/after for money and permissions, not just the action', () => {
    for (const model of ['Transaction', 'Account', 'Loan', 'Payment', 'User', 'ApprovalRequest']) {
      expect(AUDIT_MODELS_FULL.has(model)).toBe(true);
    }
  });
});

describe('PHASE 2 — Request-ID propagation to the audit actor', () => {
  it('exposes the active request id + actor via getRequestActor()', () => {
    const fakeReq: any = {
      id: 'frontend-req-abc12345',
      userId: 'user-1',
      ip: '203.0.113.5',
      headers: { 'user-agent': 'jest-agent' },
    };
    let actor: ReturnType<typeof getRequestActor> | undefined;
    requestContext(fakeReq, {} as any, () => {
      actor = getRequestActor();
    });
    expect(actor?.requestId).toBe('frontend-req-abc12345');
    expect(actor?.userId).toBe('user-1');
    expect(actor?.ip).toBe('203.0.113.5');
    expect(actor?.userAgent).toBe('jest-agent');
  });

  it('returns an empty actor outside any request context', () => {
    expect(getRequestActor()).toEqual({});
  });
});

describe('PHASE 2 — End-to-end X-Request-Id honoring at the API boundary', () => {
  it('honors and echoes a valid caller-supplied X-Request-Id', async () => {
    const id = 'frontend-req-12345678';
    const res = await request(app).get('/health').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('replaces a malformed X-Request-Id with a fresh one', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'bad id!!');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toBe('bad id!!');
    expect(res.headers['x-request-id']).toMatch(REQUEST_ID_RE);
  });

  it('always stamps an X-Request-Id even when none is supplied', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(REQUEST_ID_RE);
  });
});
