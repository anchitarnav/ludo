import { describe, expect, it } from "vitest";
import { diceRoll, mulberry32 } from "../rng";

describe("mulberry32", () => {
  it("produces deterministic sequences from a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differs = false;
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("diceRoll outputs only 1..6", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 10_000; i++) {
      const v = diceRoll(rng);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
