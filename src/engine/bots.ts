import {
  FINISHED,
  HOME_BASE,
  HOME_END,
  SAFE_SQUARES,
  START_OFFSET,
  TRACK_LENGTH,
  YARD,
  isOnHomeStretch,
  isOnMainTrack,
  type Color,
} from "./board";
import { legalMoves } from "./engine";
import type { RNG } from "./rng";
import type { BotMode, Move, RoomState } from "./state";

export function pickBotMove(
  state: RoomState,
  seat: number,
  dice: number,
  mode: BotMode,
  rng: RNG,
): Move | null {
  const moves = legalMoves(state, seat, dice);
  if (moves.length === 0) return null;

  switch (mode) {
    case "killer":
      return killerPick(moves, state, seat, rng);
    case "defensive":
      return defensivePick(moves, state, seat, rng);
    case "cheeky":
    case "neutral":
    default:
      return neutralPick(moves, rng);
  }
}

function neutralPick(moves: Move[], rng: RNG): Move {
  return moves[Math.floor(rng() * moves.length)];
}

function killerPick(moves: Move[], state: RoomState, seat: number, rng: RNG): Move {
  const captures = moves.filter((m) => m.captures);
  if (captures.length > 0) return pickRandom(captures, rng);

  const color = state.seats[seat].color;
  const leadOpponent = leadOpponentScore(state, seat);
  const myOtherMax = ownOtherPiecesMax(state, seat);

  const score = (m: Move) => {
    let s = progressScore(color, m.to);
    if (s > myOtherMax) s -= 3;
    if (leadOpponent !== null) {
      const newOverall = Math.max(s, otherSeatsBestScore(state, seat));
      if (s >= leadOpponent && newOverall === s) s -= 2;
    }
    if (SAFE_SQUARES.has(m.to)) s += 1;
    return s;
  };
  return bestByScore(moves, score, rng);
}

function defensivePick(moves: Move[], state: RoomState, seat: number, rng: RNG): Move {
  const score = (m: Move) => defensivePriority(m, state, seat);
  return bestByScore(moves, score, rng);
}

function defensivePriority(move: Move, state: RoomState, seat: number): number {
  let prio = 0;
  const fromInDanger = isInCaptureRange(state, seat, move.from);
  const toInDanger = isInCaptureRange(state, seat, move.to);
  if (fromInDanger && !toInDanger) prio += 100;
  if (!fromInDanger && toInDanger) prio -= 60;

  if (SAFE_SQUARES.has(move.to)) prio += 40;
  if (isOnHomeStretch(move.to) || move.to === FINISHED) prio += 50;

  const ownPieces = state.seats[seat].pieces;
  if (
    isOnMainTrack(move.to) &&
    ownPieces.some((p, i) => i !== move.pieceIndex && p === move.to)
  ) {
    prio += 30;
  }

  if (move.captures) prio += 20;

  prio += progressScore(state.seats[seat].color, move.to) * 0.1;
  return prio;
}

function isInCaptureRange(state: RoomState, mySeat: number, pos: number): boolean {
  if (pos === YARD || pos === FINISHED) return false;
  if (!isOnMainTrack(pos)) return false;
  if (SAFE_SQUARES.has(pos)) return false;
  for (let s = 0; s < state.seats.length; s++) {
    if (s === mySeat) continue;
    const opp = state.seats[s];
    if (opp.kind === "empty") continue;
    for (const p of opp.pieces) {
      if (!isOnMainTrack(p)) continue;
      const dist = (pos - p + TRACK_LENGTH) % TRACK_LENGTH;
      if (dist >= 1 && dist <= 6) return true;
    }
  }
  return false;
}

function progressScore(color: Color, pos: number): number {
  if (pos === YARD) return -1;
  if (pos === FINISHED) return 1000;
  if (pos >= HOME_BASE && pos <= HOME_END) return 60 + (pos - HOME_BASE);
  if (isOnMainTrack(pos)) {
    const start = START_OFFSET[color];
    return (pos - start + TRACK_LENGTH) % TRACK_LENGTH;
  }
  return 0;
}

function ownOtherPiecesMax(state: RoomState, seat: number): number {
  const color = state.seats[seat].color;
  return Math.max(
    ...state.seats[seat].pieces.map((p) => progressScore(color, p)),
  );
}

function otherSeatsBestScore(state: RoomState, mySeat: number): number {
  let best = -Infinity;
  for (let s = 0; s < state.seats.length; s++) {
    if (s === mySeat) continue;
    const opp = state.seats[s];
    if (opp.kind === "empty") continue;
    for (const p of opp.pieces) {
      const sc = progressScore(opp.color, p);
      if (sc > best) best = sc;
    }
  }
  return best === -Infinity ? -1 : best;
}

function leadOpponentScore(state: RoomState, mySeat: number): number | null {
  const v = otherSeatsBestScore(state, mySeat);
  return v < 0 ? null : v;
}

function pickRandom<T>(arr: T[], rng: RNG): T {
  return arr[Math.floor(rng() * arr.length)];
}

function bestByScore<T>(arr: T[], score: (x: T) => number, rng: RNG): T {
  let best = -Infinity;
  for (const x of arr) {
    const s = score(x);
    if (s > best) best = s;
  }
  const ties = arr.filter((x) => score(x) === best);
  return pickRandom(ties, rng);
}
