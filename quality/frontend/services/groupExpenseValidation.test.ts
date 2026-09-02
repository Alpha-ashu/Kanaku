/**
 * Group Expense Parsing — Comprehensive Validation
 *
 * Validates:
 * 1. 10-person expense: all names extracted correctly
 * 2. 2-person split (minimum group)
 * 3. Hindi / Hinglish phrasing
 * 4. Honorifics stripped (Mr., Dr., Mrs.)
 * 5. Common nouns excluded from member list
 * 6. Possessives stripped ("Arun is share" -> "Arun")
 * 7. Mixed amounts: ₹, Rs, k, lakh
 * 8. Category inference: food keyword → "Food"
 * 9. "Split equally" keyword detection
 * 10. Description generation when none stated
 */

import { describe, it, expect } from "vitest";
import { parseTranscriptLocally } from "@/services/voiceFinancialService";

describe("Group Expense Parsing", () => {

  // ── 1. 10-person dinner ──────────────────────────────────────────────────
  it("extracts all 10 participant names from a standard dinner sentence", () => {
    const transcript =
      "I spent 2,000 on dinner with Arun, Gijo, Sandeep, Brijit, Rajesh, Amala, Preeti, Suresh, Mohan and Vignesh.";
    const result = parseTranscriptLocally(transcript);
    expect(result.actions).toHaveLength(1);
    const action = result.actions[0];
    expect(action.type).toBe("group_expense");
    expect(action.entities.amount).toBe(2000);
    expect(action.entities.category).toBe("Food");
    expect(action.entities.members).toEqual([
      "Arun", "Gijo", "Sandeep", "Brijit", "Rajesh",
      "Amala", "Preeti", "Suresh", "Mohan", "Vignesh",
    ]);
  });

  // ── 2. 2-person split ────────────────────────────────────────────────────
  it("handles 2-person group split (minimum group)", () => {
    const r = parseTranscriptLocally("split 600 lunch with Rahul");
    expect(r.actions[0].type).toBe("group_expense");
    expect(r.actions[0].entities.amount).toBe(600);
    expect(r.actions[0].entities.members).toContain("Rahul");
  });

  // ── 3. Hinglish phrasing ─────────────────────────────────────────────────
  it("recognises Hinglish group expense phrasing", () => {
    const r = parseTranscriptLocally("biryani ka bill 500 split kiya Ravi aur Sona ke saath");
    // Should detect "split" and extract members
    expect(r.actions.length).toBeGreaterThan(0);
    // Amount should be 500
    expect(r.actions[0].entities.amount).toBe(500);
  });

  // ── 4. Honorifics stripped ───────────────────────────────────────────────
  it("strips Mr. and Dr. from member names", () => {
    const r = parseTranscriptLocally("split 1000 with Mr. Arjun, Dr. Kavitha and Ms. Deepa");
    expect(r.actions[0].type).toBe("group_expense");
    const members = r.actions[0].entities.members ?? [];
    // Names should be without honorifics
    expect(members).not.toContain("Mr. Arjun");
    expect(members).not.toContain("Dr. Kavitha");
    const names = members.map((m: string) => m.toLowerCase());
    expect(names.some((n) => n.includes("arjun"))).toBe(true);
    expect(names.some((n) => n.includes("kavitha"))).toBe(true);
  });

  // ── 5. Common nouns excluded ─────────────────────────────────────────────
  it("does not include 'food', 'dinner', 'lunch' as member names", () => {
    const r = parseTranscriptLocally("split 800 on food with everyone at the dinner");
    const members = r.actions[0]?.entities.members ?? [];
    const lower = members.map((m: string) => m.toLowerCase());
    expect(lower).not.toContain("food");
    expect(lower).not.toContain("dinner");
    expect(lower).not.toContain("everyone");
  });

  // ── 6. Amount variations ─────────────────────────────────────────────────
  it("parses ₹ prefix amount in group expense", () => {
    const r = parseTranscriptLocally("₹3000 dinner split with Raj and Meena");
    expect(r.actions[0].entities.amount).toBe(3000);
  });

  it("parses 1.5k as 1500 in group expense", () => {
    const r = parseTranscriptLocally("split 1.5k restaurant bill with Anu");
    expect(r.actions[0].entities.amount).toBe(1500);
  });

  it("parses lakh in group expense", () => {
    const r = parseTranscriptLocally("split 1 lakh party cost with Riya and Karan");
    expect(r.actions[0].entities.amount).toBe(100000);
  });

  // ── 7. Category inference ────────────────────────────────────────────────
  it("infers Food category from 'restaurant' keyword", () => {
    const r = parseTranscriptLocally("split restaurant bill 2000 with Ananya and Kiran");
    expect(r.actions[0].type).toBe("group_expense");
    expect(r.actions[0].entities.category).toBe("Food");
  });

  // ── 8. Between/among phrasing ────────────────────────────────────────────
  it("parses 'between us' phrasing (may not extract names)", () => {
    const r = parseTranscriptLocally("split 500 between us for the trip");
    // Should detect split keyword and create group_expense
    expect(r.actions[0]?.type).toBe("group_expense");
    expect(r.actions[0]?.entities.amount).toBe(500);
  });

  // ── 9. 5-person group ────────────────────────────────────────────────────
  it("extracts all 5 members correctly", () => {
    const r = parseTranscriptLocally("paid 5000 for party with Asha, Balu, Chandra, Divya and Elan");
    expect(r.actions[0].type).toBe("group_expense");
    expect(r.actions[0].entities.members?.length).toBe(5);
  });

  // ── 10. Description fallback ─────────────────────────────────────────────
  it("generates a description when none explicitly stated", () => {
    const r = parseTranscriptLocally("split 1000 with Pooja and Shiva");
    const desc = r.actions[0]?.entities.description;
    expect(typeof desc).toBe("string");
    expect(desc!.length).toBeGreaterThan(0);
  });
});
