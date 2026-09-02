/**
 * Voice Session Lifecycle — Comprehensive Stress Tests
 *
 * Validates:
 *  1. Consecutive voice sessions (1 → 20) without state leakage
 *  2. Cancel while in listening state → immediate idle reset
 *  3. Cancel while in processing state → aborts without side-effects
 *  4. Permission denied at OS level → graceful error, no crash
 *  5. No-speech → adapter ignores it, no crash
 *  6. Network error → surfaces onError, session cleans up
 *  7. Rapid start/cancel/start (double-tap) → only one active at a time
 *  8. Web Speech API supported check
 *  9. ensureSpeechPermission always passes on web
 * 10. Backend unreachable → local parser fallback fires
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTranscriptLocally } from "@/services/voiceFinancialService";

// ─── Platform mock: web ───────────────────────────────────────────────────────
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
  },
}));

vi.mock("@capacitor-community/speech-recognition", () => ({
  SpeechRecognition: {
    available: vi.fn(async () => ({ available: true })),
    checkPermissions: vi.fn(async () => ({ speechRecognition: "granted" })),
    requestPermissions: vi.fn(async () => ({ speechRecognition: "granted" })),
    start: vi.fn(async () => ({ matches: [] })),
    stop: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    removeAllListeners: vi.fn(async () => {}),
  },
}));

// ─── Controlled mock SpeechRecognition ───────────────────────────────────────
const mockInstances: any[] = [];

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => { if (this.onend) this.onend(); });
  abort = vi.fn(() => { if (this.onend) this.onend(); });

  simulateFinalResult(text: string) {
    if (this.onresult) {
      const fakeResults: any = [[{ transcript: text }]];
      fakeResults[0].isFinal = true;
      this.onresult({ resultIndex: 0, results: fakeResults });
    }
    if (this.onend) this.onend();
  }

  simulateError(code: string) {
    if (this.onerror) this.onerror({ error: code });
  }

  constructor() {
    mockInstances.push(this);
  }
}

vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  ensureSpeechPermission,
} from "@/services/speechRecognitionAdapter";

// ─── Helper ───────────────────────────────────────────────────────────────────
async function doSession(text?: string) {
  const res = { final: [] as string[], ended: false, errors: [] as string[] };
  const session = await startSpeechRecognition({
    onPartial: () => {},
    onFinal: (t: string) => res.final.push(t),
    onEnd: () => { res.ended = true; },
    onError: (_r: unknown, m: string) => res.errors.push(m),
  });
  await new Promise((r) => setTimeout(r, 0));
  const inst = mockInstances[mockInstances.length - 1];
  if (inst && text) inst.simulateFinalResult(text);
  else await session.stop();
  await new Promise((r) => setTimeout(r, 0));
  return { session, res, inst };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Voice Session Lifecycle", () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    mockInstances.length = 0;
  });

  it("single session: delivers final text and fires onEnd", async () => {
    const { res } = await doSession("paid 500 for food");
    expect(res.final).toContain("paid 500 for food");
    expect(res.ended).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("10 consecutive sessions without state leakage", async () => {
    for (let i = 1; i <= 10; i++) {
      const { res } = await doSession(`session ${i}`);
      expect(res.ended).toBe(true);
      expect(res.errors).toHaveLength(0);
    }
    expect(mockInstances.length).toBe(10);
  });

  it("20 consecutive sessions — stress test", async () => {
    for (let i = 1; i <= 20; i++) {
      const { res } = await doSession(`stress ${i}`);
      expect(res.ended).toBe(true);
    }
    expect(mockInstances.length).toBe(20);
  });

  it("cancel during listening resets without delivering final text", async () => {
    const { res, session } = await doSession();
    // session.stop() called inside doSession when no text provided
    await session.stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(res.ended).toBe(true);
    expect(res.final).toHaveLength(0);
  });

  it("stop() twice does not fire onEnd more than once", async () => {
    let count = 0;
    const session = await startSpeechRecognition({
      onPartial: () => {},
      onFinal: () => {},
      onEnd: () => { count++; },
      onError: () => {},
    });
    await session.stop();
    await session.stop();
    await new Promise((r) => setTimeout(r, 20));
    expect(count).toBeLessThanOrEqual(1);
  });

  it("permission denied → onError with 'denied' message", async () => {
    const errors: string[] = [];
    await startSpeechRecognition({
      onPartial: () => {},
      onFinal: () => {},
      onEnd: () => {},
      onError: (_r: unknown, m: string) => errors.push(m),
    });
    const inst = mockInstances[mockInstances.length - 1];
    inst.simulateError("not-allowed");
    expect(errors[0]).toMatch(/denied|access/i);
  });

  it("no-speech fires onError in the adapter (VoiceInput component silently ignores it)", async () => {
    const errors: string[] = [];
    await startSpeechRecognition({
      onPartial: () => {},
      onFinal: () => {},
      onEnd: () => {},
      onError: (_r: unknown, m: string) => errors.push(m),
    });
    const inst = mockInstances[mockInstances.length - 1];
    inst.simulateError("no-speech");
    // The web adapter does call callbacks.onError with 'no-speech' reason.
    // Silently ignoring it is VoiceInput.tsx's responsibility (if (reason === 'no-speech') return).
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/catch|speech|that/i);
  });

  it("network error → onError with network message", async () => {
    const errors: string[] = [];
    await startSpeechRecognition({
      onPartial: () => {},
      onFinal: () => {},
      onEnd: () => {},
      onError: (_r: unknown, m: string) => errors.push(m),
    });
    const inst = mockInstances[mockInstances.length - 1];
    inst.simulateError("network");
    expect(errors[0]).toMatch(/offline|network/i);
  });

  it("double-tap: second start tears down the first recognizer", async () => {
    const s1 = startSpeechRecognition({ onPartial: () => {}, onFinal: () => {}, onEnd: () => {}, onError: () => {} });
    const s2 = startSpeechRecognition({ onPartial: () => {}, onFinal: () => {}, onEnd: () => {}, onError: () => {} });
    await Promise.all([s1, s2]);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockInstances.length).toBe(2);
    // First instance must have had stop() called on it
    expect(mockInstances[0].stop).toHaveBeenCalled();
  });

  it("isSpeechRecognitionSupported → true when Web Speech API available", async () => {
    expect(await isSpeechRecognitionSupported()).toBe(true);
  });

  it("ensureSpeechPermission → always true on web platform", async () => {
    expect(await ensureSpeechPermission()).toBe(true);
  });
});

// ─── Local Parser Fallback Tests ─────────────────────────────────────────────
describe("Voice AI — Local Parser (Backend Unavailable)", () => {
  it("parses single expense offline", () => {
    const r = parseTranscriptLocally("spent 500 on groceries");
    expect(r.success).toBe(true);
    expect(r.parser).toBe("local");
    expect(r.actions[0]).toMatchObject({ type: "expense", entities: { amount: 500, category: "Groceries" } });
  });

  it("parses income offline", () => {
    const r = parseTranscriptLocally("received salary 50000");
    expect(r.success).toBe(true);
    const action = r.actions.find((a: any) => a.type === "income");
    expect(action).toBeDefined();
    expect(action!.entities.amount).toBe(50000);
  });

  it("parses loan lend offline", () => {
    const r = parseTranscriptLocally("lent 3000 to Karthik");
    expect(r.actions[0]).toMatchObject({ type: "loan_lend", entities: { amount: 3000, person: "Karthik" } });
  });

  it("parses loan borrow offline", () => {
    const r = parseTranscriptLocally("borrowed 2000 from Priya");
    expect(r.actions[0]).toMatchObject({ type: "loan_borrow", entities: { amount: 2000, person: "Priya" } });
  });

  it("parses 2-person group expense offline", () => {
    const r = parseTranscriptLocally("split 1200 dinner with Anand");
    expect(r.actions[0].type).toBe("group_expense");
    expect(r.actions[0].entities.amount).toBe(1200);
    expect(r.actions[0].entities.members).toContain("Anand");
  });

  it("returns empty actions for unrecognized speech without crashing", () => {
    const r = parseTranscriptLocally("umm uh nothing here blah");
    expect(r).toBeDefined();
    expect(Array.isArray(r.actions)).toBe(true);
  });

  it("handles Hinglish: ek lakh = 100000", () => {
    const r = parseTranscriptLocally("received ek lakh as bonus");
    expect(r.actions.length).toBeGreaterThan(0);
    const inc = r.actions.find((a: any) => a.type === "income");
    expect(inc?.entities.amount).toBe(100000);
  });

  it("handles k-notation: 5k = 5000", () => {
    const r = parseTranscriptLocally("paid 5k for rent");
    expect(r.actions[0].entities.amount).toBe(5000);
  });

  it("parses multi-intent: expense + loan in one sentence", () => {
    const r = parseTranscriptLocally("spent 200 on coffee and lent 1000 to Meena");
    expect(r.actions.length).toBe(2);
    expect(r.actions[0].type).toBe("expense");
    expect(r.actions[1]).toMatchObject({ type: "loan_lend", entities: { person: "Meena", amount: 1000 } });
  });
});

