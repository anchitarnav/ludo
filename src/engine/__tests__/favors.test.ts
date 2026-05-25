import { describe, expect, it } from "vitest";
import {
  FINISHED,
  HOME_BASE,
  HOME_END,
  YARD,
  createInitialRoom,
  eligibleKinds,
  initialFavorState,
  startGame,
  tickFavor,
  type ActiveFavor,
  type FavorKind,
  type FavorState,
  type Pieces,
  type RoomState,
} from "..";

function seatWithPieces(state: RoomState, seat: number, pieces: Pieces): RoomState {
  const seats = state.seats.map((s, i) =>
    i === seat
      ? { ...s, kind: "human" as const, uid: `u${i}`, sessionId: `s${i}`, displayName: `P${i}`, pieces }
      : s,
  );
  return { ...state, seats };
}

function fixture(): RoomState {
  let s = createInitialRoom("host");
  for (let i = 0; i < 4; i++) {
    s = seatWithPieces(s, i, [YARD, YARD, YARD, YARD]);
  }
  s = startGame(s, "host", 42);
  return s;
}

function withActive(favor: FavorState, active: ActiveFavor): FavorState {
  return { ...favor, active };
}

describe("tickFavor", () => {
  it("returns honest roll when seed is null", () => {
    const s = createInitialRoom("host");
    const out = tickFavor(s, initialFavorState(), [], 0, 4);
    expect(out.value).toBe(4);
    expect(out.fired).toBe(false);
  });

  describe("kind overrides", () => {
    const kinds: FavorKind[] = [
      "lucky_sixes",
      "stuck_on_ones",
    ];
    for (const kind of kinds) {
      it(`${kind} overrides target's roll`, () => {
        const s = fixture();
        const active: ActiveFavor = { kind, targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
        const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 3);
        expect(out.value).toBe(kind === "lucky_sixes" ? 6 : 1);
        expect(out.fired).toBe(true);
        expect(out.favorState.active?.rollsRemaining).toBe(2);
      });
    }

    it("stay_home forces 1 when honest roll is 6 and pieces in yard", () => {
      const s = fixture(); // all pieces in yard
      const active: ActiveFavor = { kind: "stay_home", targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 6);
      expect(out.value).toBe(1);
      expect(out.fired).toBe(true);
    });

    it("stay_home passes through honest roll when not a 6", () => {
      const s = fixture();
      const active: ActiveFavor = { kind: "stay_home", targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 4);
      expect(out.value).toBe(4);
      expect(out.fired).toBe(false);
    });

    it("home_stretch_sprint picks the dice value that finishes a piece", () => {
      let s = fixture();
      s = seatWithPieces(s, 0, [HOME_BASE + 2, YARD, YARD, YARD]); // distance to FINISHED = 4
      const active: ActiveFavor = { kind: "home_stretch_sprint", targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 2);
      expect(out.value).toBe(FINISHED - (HOME_BASE + 2));
      expect(out.fired).toBe(true);
    });

    it("home_stretch_sprint is a no-op when no home-stretch pieces", () => {
      const s = fixture();
      const active: ActiveFavor = { kind: "home_stretch_sprint", targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 4);
      expect(out.value).toBe(4);
      expect(out.fired).toBe(false);
    });

    it("guaranteed_kill picks a dice value that lands on an opponent piece", () => {
      let s = fixture();
      // red at 4, green at 5 — rolling 1 captures
      s = seatWithPieces(s, 0, [4, YARD, YARD, YARD]);
      s = seatWithPieces(s, 1, [5, YARD, YARD, YARD]);
      const active: ActiveFavor = { kind: "guaranteed_kill", targetSeat: 0, rollsRemaining: 2, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 3);
      expect(out.value).toBe(1);
      expect(out.fired).toBe(true);
    });

    it("guaranteed_kill falls back to honest when no capture is reachable", () => {
      const s = fixture(); // all in yard, no captures possible
      const active: ActiveFavor = { kind: "guaranteed_kill", targetSeat: 0, rollsRemaining: 2, rollsAffected: 0 };
      const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 3);
      expect(out.value).toBe(3);
      expect(out.fired).toBe(false);
    });
  });

  it("does not override when targetSeat differs from rolling seat", () => {
    const s = fixture();
    const active: ActiveFavor = { kind: "lucky_sixes", targetSeat: 0, rollsRemaining: 3, rollsAffected: 0 };
    const out = tickFavor(s, withActive(initialFavorState(), active), [], 1, 4);
    expect(out.value).toBe(4);
    expect(out.fired).toBe(false);
    // duration is preserved (didn't tick) since the wrong seat rolled
    expect(out.favorState.active?.rollsRemaining).toBe(3);
  });

  it("expires after duration and writes a log entry", () => {
    let s = fixture();
    let favor = withActive(initialFavorState(), {
      kind: "lucky_sixes",
      targetSeat: 0,
      rollsRemaining: 2,
      rollsAffected: 0,
    });
    let log: ReturnType<typeof tickFavor>["favorLog"] = [];
    let out = tickFavor(s, favor, log, 0, 1);
    favor = out.favorState;
    log = out.favorLog;
    expect(favor.active).not.toBeNull();
    expect(log).toHaveLength(0);

    out = tickFavor(s, favor, log, 0, 1);
    favor = out.favorState;
    log = out.favorLog;
    expect(favor.active).toBeNull();
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe("lucky_sixes");
    expect(log[0].rollsAffected).toBe(2);
    expect(favor.cooldownRolls).toBeGreaterThan(0);
  });

  it("cooldown gates a new favor from starting immediately", () => {
    const s = fixture();
    const startCooled: FavorState = { active: null, cooldownRolls: 5, rollCounter: 0 };
    const out = tickFavor(s, startCooled, [], 0, 3);
    expect(out.favorState.active).toBeNull();
    expect(out.favorState.cooldownRolls).toBe(4);
  });

  it("kind selection only picks kinds that can fire now", () => {
    // mid-game state: red has yard pieces only, no opponents in capture range.
    // home_stretch_sprint and guaranteed_kill should NOT be eligible.
    const s = fixture();
    const kinds = eligibleKinds(s, 0);
    expect(kinds).toContain("lucky_sixes");
    expect(kinds).toContain("stuck_on_ones");
    expect(kinds).toContain("stay_home");
    expect(kinds).not.toContain("home_stretch_sprint");
    expect(kinds).not.toContain("guaranteed_kill");
  });

  it("kind selection includes home_stretch_sprint when target has a home-stretch piece", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [HOME_BASE + 1, YARD, YARD, YARD]);
    const kinds = eligibleKinds(s, 0);
    expect(kinds).toContain("home_stretch_sprint");
  });

  it("kind selection includes guaranteed_kill when a capture is reachable", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [4, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [5, YARD, YARD, YARD]);
    const kinds = eligibleKinds(s, 0);
    expect(kinds).toContain("guaranteed_kill");
  });

  it("home_stretch_sprint will not break the home_end ceiling", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [HOME_END, YARD, YARD, YARD]); // 1 away from FINISHED
    const active: ActiveFavor = { kind: "home_stretch_sprint", targetSeat: 0, rollsRemaining: 2, rollsAffected: 0 };
    const out = tickFavor(s, withActive(initialFavorState(), active), [], 0, 4);
    expect(out.value).toBe(1); // dice that lands exactly on FINISHED
  });
});
