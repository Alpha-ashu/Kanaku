/**
 * Booking transitions, exhaustively.
 *
 * The flow had a dead end: `rescheduleBooking` could move a booking into
 * `reschedule`, but no endpoint let the other party accept or decline, so the
 * only way out was cancellation. It also validated almost nothing — a
 * `completed` booking could be rescheduled, and the proposer could answer their
 * own proposal.
 *
 * `checkTransition` is pure, so every state/actor pair can be enumerated rather
 * than sampled. The table below is the specification; if a transition is added
 * to the machine without being added here, `covers every state` fails.
 */
import {
  checkTransition,
  normalizeStatus,
  failureHttpStatus,
  MAX_RESCHEDULE_ROUNDS,
  type BookingStatus,
} from '../../../../backend/src/features/bookings/booking.stateMachine';

const ADVISOR = 'advisor-1';
const CLIENT = 'client-1';

const ALL_STATES: BookingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'reschedule',
  'completed',
  'cancelled',
];

describe('normalizeStatus', () => {
  it('maps the legacy spellings found in production data', () => {
    // Two live rows carry 'confirmed' from a build that predates 'accepted'.
    expect(normalizeStatus('confirmed')).toBe('accepted');
    expect(normalizeStatus('reschedule_proposed')).toBe('reschedule');
    expect(normalizeStatus('declined')).toBe('rejected');
  });

  it('is case- and whitespace-insensitive, and defaults to pending', () => {
    expect(normalizeStatus('  ACCEPTED ')).toBe('accepted');
    expect(normalizeStatus(null)).toBe('pending');
    expect(normalizeStatus(undefined)).toBe('pending');
  });
});

describe('terminal states admit nothing', () => {
  for (const from of ['completed', 'rejected', 'cancelled'] as BookingStatus[]) {
    for (const to of ALL_STATES) {
      it(`${from} → ${to} is refused`, () => {
        const failure = checkTransition({ from, to, actor: 'advisor', actorId: ADVISOR });
        expect(failure).not.toBeNull();
        expect(failure!.code).toBe('INVALID_TRANSITION');
      });
    }
  }

  it('refuses to reschedule a completed booking', () => {
    // The specific hole the old handler had: it checked ownership and nothing else.
    const failure = checkTransition({
      from: 'completed', to: 'reschedule', actor: 'advisor', actorId: ADVISOR,
    });
    expect(failure?.code).toBe('INVALID_TRANSITION');
    expect(failureHttpStatus(failure!)).toBe(400);
  });
});

describe('pending', () => {
  it('lets the advisor accept, reject or propose a new time', () => {
    for (const to of ['accepted', 'rejected', 'reschedule'] as BookingStatus[]) {
      expect(checkTransition({ from: 'pending', to, actor: 'advisor', actorId: ADVISOR })).toBeNull();
    }
  });

  it('lets the client cancel', () => {
    expect(checkTransition({ from: 'pending', to: 'cancelled', actor: 'client', actorId: CLIENT })).toBeNull();
  });

  it('does not let anyone jump straight to completed', () => {
    expect(checkTransition({ from: 'pending', to: 'completed', actor: 'advisor', actorId: ADVISOR })?.code)
      .toBe('INVALID_TRANSITION');
  });
});

describe('reschedule — the state that used to have no exit', () => {
  const advisorProposed = { from: 'reschedule' as const, proposedBy: ADVISOR, rescheduleCount: 1 };

  it('lets the CLIENT accept the advisor proposal', () => {
    expect(checkTransition({ ...advisorProposed, to: 'accepted', actor: 'client', actorId: CLIENT }))
      .toBeNull();
  });

  it('lets the CLIENT decline the advisor proposal', () => {
    expect(checkTransition({ ...advisorProposed, to: 'rejected', actor: 'client', actorId: CLIENT }))
      .toBeNull();
  });

  it('lets the CLIENT counter-propose', () => {
    expect(checkTransition({ ...advisorProposed, to: 'reschedule', actor: 'client', actorId: CLIENT }))
      .toBeNull();
  });

  it('stops the proposer accepting their own proposed time', () => {
    // Otherwise the advisor could propose 11:00 and confirm it unilaterally.
    const failure = checkTransition({ ...advisorProposed, to: 'accepted', actor: 'advisor', actorId: ADVISOR });
    expect(failure?.code).toBe('AWAITING_OTHER_PARTY');
  });

  it('stops the proposer proposing twice in a row', () => {
    const failure = checkTransition({ ...advisorProposed, to: 'reschedule', actor: 'advisor', actorId: ADVISOR });
    expect(failure?.code).toBe('AWAITING_OTHER_PARTY');
  });

  it('always leaves cancellation available', () => {
    expect(checkTransition({ ...advisorProposed, to: 'cancelled', actor: 'client', actorId: CLIENT })).toBeNull();
  });

  it('mirrors the rules when the CLIENT is the proposer', () => {
    const clientProposed = { from: 'reschedule' as const, proposedBy: CLIENT, rescheduleCount: 2 };
    expect(checkTransition({ ...clientProposed, to: 'accepted', actor: 'advisor', actorId: ADVISOR })).toBeNull();
    expect(checkTransition({ ...clientProposed, to: 'accepted', actor: 'client', actorId: CLIENT })?.code)
      .toBe('AWAITING_OTHER_PARTY');
  });
});

describe('reschedule round cap', () => {
  it(`refuses a proposal once ${MAX_RESCHEDULE_ROUNDS} have been used`, () => {
    const failure = checkTransition({
      from: 'reschedule',
      to: 'reschedule',
      actor: 'client',
      actorId: CLIENT,
      proposedBy: ADVISOR,
      rescheduleCount: MAX_RESCHEDULE_ROUNDS,
    });
    expect(failure?.code).toBe('RESCHEDULE_LIMIT_REACHED');
  });

  it('still allows accept, decline and cancel at the cap — never a dead end', () => {
    const atCap = {
      from: 'reschedule' as const,
      proposedBy: ADVISOR,
      rescheduleCount: MAX_RESCHEDULE_ROUNDS,
      actor: 'client' as const,
      actorId: CLIENT,
    };
    expect(checkTransition({ ...atCap, to: 'accepted' })).toBeNull();
    expect(checkTransition({ ...atCap, to: 'rejected' })).toBeNull();
    expect(checkTransition({ ...atCap, to: 'cancelled' })).toBeNull();
  });

  it('allows the last permitted round', () => {
    expect(checkTransition({
      from: 'reschedule',
      to: 'reschedule',
      actor: 'client',
      actorId: CLIENT,
      proposedBy: ADVISOR,
      rescheduleCount: MAX_RESCHEDULE_ROUNDS - 1,
    })).toBeNull();
  });
});

describe('accepted', () => {
  it('can be completed by the advisor', () => {
    expect(checkTransition({ from: 'accepted', to: 'completed', actor: 'advisor', actorId: ADVISOR })).toBeNull();
  });

  it('cannot be completed by the client', () => {
    const failure = checkTransition({ from: 'accepted', to: 'completed', actor: 'client', actorId: CLIENT });
    expect(failure?.code).toBe('ACTOR_NOT_PERMITTED');
    expect(failureHttpStatus(failure!)).toBe(403);
  });

  it('cannot be rescheduled — renegotiate before accepting, or cancel', () => {
    expect(checkTransition({ from: 'accepted', to: 'reschedule', actor: 'advisor', actorId: ADVISOR })?.code)
      .toBe('INVALID_TRANSITION');
  });
});

describe('no state is a dead end before completion', () => {
  // The property that was violated: `reschedule` admitted only `cancelled`.
  for (const from of ['pending', 'reschedule', 'accepted'] as BookingStatus[]) {
    it(`${from} has at least one non-cancel exit`, () => {
      const exits = ALL_STATES.filter(
        (to) =>
          to !== 'cancelled' &&
          to !== from &&
          (checkTransition({ from, to, actor: 'advisor', actorId: ADVISOR, proposedBy: CLIENT, rescheduleCount: 0 }) === null ||
            checkTransition({ from, to, actor: 'client', actorId: CLIENT, proposedBy: ADVISOR, rescheduleCount: 0 }) === null),
      );
      expect(exits.length).toBeGreaterThan(0);
    });
  }
});

describe('covers every state', () => {
  it('rejects an unknown status rather than defaulting to permissive', () => {
    const failure = checkTransition({
      from: 'not_a_real_status', to: 'accepted', actor: 'advisor', actorId: ADVISOR,
    });
    expect(failure?.code).toBe('INVALID_TRANSITION');
  });
});
