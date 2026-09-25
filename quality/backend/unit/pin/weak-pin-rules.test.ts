/**
 * Exactly which PINs `/pin/create` rejects with 400.
 *
 * Production showed `POST /api/v1/pin/create → 400`. On the live build a 400 is
 * NOT "a PIN already exists" — that path returns 409 `PIN_ALREADY_EXISTS` — so a
 * 400 means the submitted PIN failed validation: wrong format, or caught by the
 * weak-PIN rules. These tests document what those rules actually reject, so the
 * next 400 can be explained without guessing.
 *
 * `isWeakPin` is pure, so the rules can be enumerated directly rather than
 * inferred from an endpoint round trip. The endpoint-level behaviour (400 vs
 * 409 vs 200) is covered by `tests/integration/pin-create-conflict.test.ts`.
 *
 * Worth knowing when reading a support report: the sequential rule is a
 * SUBSTRING test, so a PIN is rejected for containing a run of three anywhere —
 * `849876` is refused because of `987`, not because the whole PIN is sequential.
 * Roughly one in twenty random six-digit PINs is refused by these rules.
 */
import { pinService } from '../../../../backend/src/features/pin/pin.service';

const rejects = (pin: string) => pinService.isWeakPin(pin);

describe('weak-PIN rules — sequential runs', () => {
  it.each(['123456', '012345', '234567', '345678', '456789'])(
    'rejects ascending %s',
    (pin) => expect(rejects(pin)).toBe(true),
  );

  it.each(['987654', '876543', '765432', '654321', '543210'])(
    'rejects descending %s',
    (pin) => expect(rejects(pin)).toBe(true),
  );

  it('rejects a run of three ANYWHERE in the PIN, not just at the start', () => {
    // The rule is a substring match. This is the least obvious rejection and
    // the most likely to be reported as "my valid PIN was refused".
    expect(rejects('849876')).toBe(true); // contains 987
    expect(rejects('712340')).toBe(true); // contains 123 and 234
  });

  it('allows a run of only two', () => {
    // 12 and 45 appear, but no three-in-a-row, so this is accepted.
    expect(rejects('124590')).toBe(false);
  });
});

describe('weak-PIN rules — repeated digits', () => {
  it.each(['111111', '222222', '000000'])(
    'rejects all-same %s',
    (pin) => expect(rejects(pin)).toBe(true),
  );

  it('rejects three or more of the same digit in a row, anywhere', () => {
    expect(rejects('411125')).toBe(true);
    expect(rejects('259990')).toBe(true);
  });

  it('allows a digit repeated only twice in a row', () => {
    expect(rejects('411259')).toBe(false);
  });

  it('allows the same digit repeated non-consecutively', () => {
    // The rule targets runs, not frequency.
    expect(rejects('414159')).toBe(false);
  });
});

describe('weak-PIN rules — common patterns', () => {
  it.each(['121212', '101010', '010101', '212121', '112233', '223344'])(
    'rejects the known pattern %s',
    (pin) => expect(rejects(pin)).toBe(true),
  );

  it('is ANCHORED, unlike the sequential rule', () => {
    // `121212` inside a longer string is not caught: the pattern list is
    // `/^(...)$/`, so it only matches a PIN that IS one of those values. This
    // looks like a gap and is not one — a 7-digit PIN never reaches the weak
    // check, because the format rule (`pinField`, 6 digits) rejects it first.
    // Asserted so the anchoring is a recorded decision rather than an accident.
    expect(rejects('9121212')).toBe(false);
  });
});

describe('weak-PIN rules — accepted PINs', () => {
  it.each(['481590', '739164', '620487', '958206'])(
    'accepts the ordinary PIN %s',
    (pin) => expect(rejects(pin)).toBe(false),
  );

  it('accepts the PIN the integration suite relies on', () => {
    // pin-create-conflict.test.ts depends on this staying acceptable; if the
    // rules tighten and this starts failing, that suite fails confusingly.
    expect(rejects('846195')).toBe(false);
  });
});
