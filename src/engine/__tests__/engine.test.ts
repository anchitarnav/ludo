import { describe, expect, it } from "vitest";
import {
  FINISHED,
  HOME_BASE,
  HOME_END,
  SAFE_SQUARES,
  START_OFFSET,
  YARD,
  computeDestination,
  createInitialRoom,
  handleMove,
  handleRoll,
  legalMoves,
  startGame,
  type Pieces,
  type RoomState,
} from "..";

function seatWithPieces(state: RoomState, seat: number, pieces: Pieces): RoomState {
  const seats = state.seats.map((s, i) =>
    i === seat ? { ...s, kind: "human" as const, uid: `u${i}`, sessionId: `s${i}`, displayName: `P${i}`, pieces } : s,
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

describe("computeDestination", () => {
  it("yard exits on 6", () => {
    expect(computeDestination("red", YARD, 6)).toBe(START_OFFSET.red);
    expect(computeDestination("green", YARD, 6)).toBe(START_OFFSET.green);
    expect(computeDestination("blue", YARD, 6)).toBe(START_OFFSET.blue);
  });

  it("yard ignores non-6 rolls", () => {
    for (let d = 1; d <= 5; d++) {
      expect(computeDestination("red", YARD, d)).toBeNull();
    }
  });

  it("advances on main track without crossing home entry", () => {
    expect(computeDestination("red", 0, 3)).toBe(3);
    expect(computeDestination("green", 13, 5)).toBe(18);
  });

  it("crosses into home stretch for red", () => {
    // red entry square is 51; from 51 with dice 1 → 100
    expect(computeDestination("red", 51, 1)).toBe(HOME_BASE);
    expect(computeDestination("red", 51, 6)).toBe(HOME_BASE + 5);
    expect(computeDestination("red", 50, 2)).toBe(HOME_BASE);
  });

  it("requires exact roll to finish from home stretch", () => {
    expect(computeDestination("red", HOME_END, 1)).toBe(FINISHED);
    expect(computeDestination("red", 103, 3)).toBe(FINISHED);
  });

  it("rejects overshoot beyond FINISHED", () => {
    expect(computeDestination("red", HOME_END, 2)).toBeNull();
    expect(computeDestination("red", 104, 3)).toBeNull();
  });

  it("returns null from FINISHED", () => {
    expect(computeDestination("red", FINISHED, 3)).toBeNull();
  });

  it("green crosses home entry correctly", () => {
    // green entry is 12 (13 - 1)
    expect(computeDestination("green", 12, 1)).toBe(HOME_BASE);
    expect(computeDestination("green", 10, 4)).toBe(HOME_BASE + 1);
  });
});

describe("legalMoves", () => {
  it("yard pieces only mobile on a 6", () => {
    const s = fixture();
    expect(legalMoves(s, 0, 5)).toHaveLength(0);
    const sixMoves = legalMoves(s, 0, 6);
    expect(sixMoves).toHaveLength(4);
    expect(sixMoves.every((m) => m.from === YARD && m.to === START_OFFSET.red)).toBe(true);
  });

  it("detects capture on non-safe square", () => {
    let s = fixture();
    // place red piece at 4, green piece at 5 (not safe). red rolls 1.
    s = seatWithPieces(s, 0, [4, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [5, YARD, YARD, YARD]);
    const moves = legalMoves(s, 0, 1);
    expect(moves[0].captures).toEqual({ seat: 1, pieceIndex: 0 });
  });

  it("does not capture on safe square", () => {
    let s = fixture();
    // red at 7, green at 8 (safe square). red rolls 1.
    s = seatWithPieces(s, 0, [7, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [8, YARD, YARD, YARD]);
    const moves = legalMoves(s, 0, 1);
    expect(moves[0].to).toBe(8);
    expect(moves[0].captures).toBeNull();
    expect(SAFE_SQUARES.has(8)).toBe(true);
  });

  it("treats two same-color pieces as immune passive block", () => {
    let s = fixture();
    // red trying to land on a green block at 5: cannot capture.
    s = seatWithPieces(s, 0, [4, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [5, 5, YARD, YARD]);
    const moves = legalMoves(s, 0, 1);
    expect(moves[0].captures).toBeNull();
  });
});

describe("handleRoll / handleMove", () => {
  it("captures send opponent piece back to yard and grant extra turn", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [4, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [5, YARD, YARD, YARD]);
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };
    s = handleRoll(s, 1, 1000);
    expect(s.dice?.value).toBe(1);
    const move = legalMoves(s, 0, 1).find((m) => m.from === 4)!;
    const after = handleMove(s, move);
    expect(after.seats[0].pieces[0]).toBe(5);
    expect(after.seats[1].pieces[0]).toBe(YARD);
    expect(after.turn.seat).toBe(0); // extra turn from capture
    expect(after.turn.extraTurn).toBe(true);
    expect(after.dice).toBeNull();
  });

  it("rolling a 6 grants extra turn after a non-capturing move", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [3, YARD, YARD, YARD]);
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };
    s = handleRoll(s, 6, 1000);
    const move = legalMoves(s, 0, 6).find((m) => m.from === 3)!;
    const after = handleMove(s, move);
    expect(after.turn.seat).toBe(0);
    expect(after.turn.extraTurn).toBe(true);
  });

  it("3 consecutive 6s forfeits the turn", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [3, YARD, YARD, YARD]);
    s = seatWithPieces(s, 1, [YARD, YARD, YARD, YARD]);
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };

    s = handleRoll(s, 6, 1000);
    const m1 = legalMoves(s, 0, 6).find((m) => m.from === 3)!;
    s = handleMove(s, m1);
    expect(s.turn.sixesInRow).toBe(1);

    s = handleRoll(s, 6, 1001);
    const m2 = legalMoves(s, 0, 6).find((m) => m.from === 9)!;
    s = handleMove(s, m2);
    expect(s.turn.sixesInRow).toBe(2);

    s = handleRoll(s, 6, 1002);
    // 3rd six → forfeit; turn passes, dice cleared, sixes reset
    expect(s.turn.seat).toBe(1);
    expect(s.turn.sixesInRow).toBe(0);
    expect(s.dice).toBeNull();
  });

  it("non-6 with no legal moves passes the turn", () => {
    let s = fixture();
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };
    s = handleRoll(s, 3, 1000); // all pieces in yard; no legal moves
    expect(s.turn.seat).toBe(1);
    expect(s.dice).toBeNull();
  });

  it("exact-finish records seat in finishOrder", () => {
    let s = fixture();
    s = seatWithPieces(s, 0, [FINISHED, FINISHED, FINISHED, HOME_END]);
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };
    s = handleRoll(s, 1, 1000);
    const move = legalMoves(s, 0, 1).find((m) => m.to === FINISHED)!;
    const after = handleMove(s, move);
    expect(after.finishOrder).toContain(0);
    expect(after.seats[0].pieces.every((p) => p === FINISHED)).toBe(true);
  });

  it("game ends when 3 seats have finished", () => {
    let s = fixture();
    // pre-rig seat 1 and 2 already finished, seat 0 about to finish
    s.finishOrder = [1, 2];
    s = seatWithPieces(s, 0, [FINISHED, FINISHED, FINISHED, HOME_END]);
    s.turn = { seat: 0, sixesInRow: 0, extraTurn: false };
    s = handleRoll(s, 1, 1000);
    const move = legalMoves(s, 0, 1).find((m) => m.to === FINISHED)!;
    const after = handleMove(s, move);
    expect(after.finishOrder).toEqual([1, 2, 0]);
    expect(after.phase).toBe("ended");
  });

  it("monotonic version counter increments on every state-changing op", () => {
    let s = fixture();
    const v0 = s.version;
    s = handleRoll(s, 3, 1000); // yard rolls 3 → no legal moves → passTurn
    expect(s.version).toBeGreaterThan(v0);
  });
});
