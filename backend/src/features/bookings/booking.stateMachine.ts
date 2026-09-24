/**
 * The one description of how a booking may move between states.
 *
 * Transitions used to be enforced ad hoc, where they were enforced at all:
 * `acceptBooking` and `rejectBooking` each ran their own conditional
 * `updateMany` (correct, but duplicated), while `rescheduleBooking` and
 * `cancelBooking` checked almost nothing — a completed booking could be
 * rescheduled, and the reschedule state had no exit at all because no endpoint
 * let the client answer a proposal. Spreading the rules across four handlers is
 * what let those gaps open one at a time.
 *
 * Status vocabulary is unchanged on purpose. `reschedule` (not
 * `reschedule_proposed`) is what live rows and shipped clients already use;
 * renaming it would be a data migration and a client break for no behavioural
 * gain.
 *
 *   pending     → accepted | rejected | reschedule | cancelled
 *   reschedule  → accepted | rejected | reschedule | cancelled
 *   accepted    → completed | cancelled
 *   completed   → (terminal)
 *   rejected    → (terminal)
 *   cancelled   → (terminal)
 *
 * `reschedule → reschedule` is the counter-proposal: either party may answer a
 * proposed time with one of their own, bounded by MAX_RESCHEDULE_ROUNDS.
 *
 * The session lifecycle (`ready`/`active`) lives on AdvisorSession, not here —
 * a booking is `accepted` and the session it created moves through its own
 * states. Conflating the two would make "booking accepted" and "session
 * running" the same fact, which they are not.
 */

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'reschedule'
  | 'completed'
  | 'cancelled';

export type BookingActor = 'client' | 'advisor';

/** How many times the two sides may propose new times before it must be settled. */
export const MAX_RESCHEDULE_ROUNDS = Number(process.env.BOOKING_MAX_RESCHEDULE_ROUNDS || 3);

/** How long an unanswered proposal holds the slot. */
export const RESCHEDULE_EXPIRY_MS =
  Number(process.env.BOOKING_RESCHEDULE_EXPIRY_HOURS || 48) * 60 * 60 * 1000;

/**
 * Legacy spellings seen in production data, mapped to the vocabulary above.
 * Two rows carry 'confirmed' from a build that predates 'accepted'.
 */
const LEGACY_STATUS: Record<string, BookingStatus> = {
  confirmed: 'accepted',
  reschedule_proposed: 'reschedule',
  declined: 'rejected',
};

export const normalizeStatus = (value: string | null | undefined): BookingStatus => {
  const raw = String(value ?? 'pending').trim().toLowerCase();
  return (LEGACY_STATUS[raw] ?? raw) as BookingStatus;
};

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'rejected', 'reschedule', 'cancelled'],
  reschedule: ['accepted', 'rejected', 'reschedule', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

/**
 * Who may drive each transition.
 *
 * `accepted` and `rejected` are listed for BOTH parties because their meaning
 * depends on the state they leave: from `pending` the advisor is answering a
 * request; from `reschedule` whoever did NOT propose the time is answering it.
 * `assertTransition` enforces that second rule, which a static table cannot.
 */
const ACTOR_ALLOWED: Record<BookingStatus, BookingActor[]> = {
  accepted: ['client', 'advisor'],
  rejected: ['client', 'advisor'],
  reschedule: ['client', 'advisor'],
  cancelled: ['client', 'advisor'],
  completed: ['advisor'],
  pending: [],
};

export interface TransitionContext {
  from: string;
  to: BookingStatus;
  actor: BookingActor;
  /** userId of whoever proposed the time currently on the row, if any. */
  proposedBy?: string | null;
  /** userId performing this transition. */
  actorId: string;
  rescheduleCount?: number;
}

export interface TransitionFailure {
  code:
    | 'INVALID_TRANSITION'
    | 'ACTOR_NOT_PERMITTED'
    | 'AWAITING_OTHER_PARTY'
    | 'RESCHEDULE_LIMIT_REACHED';
  message: string;
}

/**
 * Returns null when the transition is legal, or a failure the caller turns into
 * a 400/403. Pure — no database access — so it is cheap to call inside a
 * transaction and trivial to test exhaustively.
 */
export const checkTransition = (ctx: TransitionContext): TransitionFailure | null => {
  const from = normalizeStatus(ctx.from);

  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { code: 'INVALID_TRANSITION', message: `Unknown booking status "${ctx.from}".` };
  }
  if (!allowed.includes(ctx.to)) {
    return {
      code: 'INVALID_TRANSITION',
      message: `A ${from} booking cannot become ${ctx.to}.`,
    };
  }

  if (!ACTOR_ALLOWED[ctx.to]?.includes(ctx.actor)) {
    return {
      code: 'ACTOR_NOT_PERMITTED',
      message: `A ${ctx.actor} cannot move a booking to ${ctx.to}.`,
    };
  }

  // Answering a proposal: the proposer does not get to accept their own time.
  // Without this an advisor could propose 11:00 and immediately "accept" it,
  // which is just rescheduling unilaterally with extra steps.
  if (from === 'reschedule' && (ctx.to === 'accepted' || ctx.to === 'rejected')) {
    if (ctx.proposedBy && ctx.proposedBy === ctx.actorId) {
      return {
        code: 'AWAITING_OTHER_PARTY',
        message: 'You proposed this time. It is waiting on the other party to accept or decline.',
      };
    }
  }

  if (ctx.to === 'reschedule') {
    const rounds = ctx.rescheduleCount ?? 0;
    if (rounds >= MAX_RESCHEDULE_ROUNDS) {
      return {
        code: 'RESCHEDULE_LIMIT_REACHED',
        message: `This booking has already been rescheduled ${MAX_RESCHEDULE_ROUNDS} times. Please accept a time, decline, or cancel.`,
      };
    }
    // A counter-proposal must come from the other side, for the same reason as
    // above: proposing twice in a row is just editing your own offer.
    if (from === 'reschedule' && ctx.proposedBy && ctx.proposedBy === ctx.actorId) {
      return {
        code: 'AWAITING_OTHER_PARTY',
        message: 'Your proposed time is still awaiting an answer.',
      };
    }
  }

  return null;
};

/** HTTP status for each failure — 403 when the mover is wrong, 400 otherwise. */
export const failureHttpStatus = (failure: TransitionFailure): 400 | 403 =>
  failure.code === 'ACTOR_NOT_PERMITTED' ? 403 : 400;
