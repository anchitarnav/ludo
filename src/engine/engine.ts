import {
  FINISHED,
  HOME_BASE,
  HOME_END,
  SAFE_SQUARES,
  START_OFFSET,
  TRACK_LENGTH,
  YARD,
  homeEntry,
  isOnHomeStretch,
  isOnMainTrack,
  type Color,
} from "./board";
import type { Capture, Move, Pieces, RoomState, Turn } from "./state";

// Passive blocks (two same-color pieces on a non-safe main square) are
// immune to capture but do not block movement. This matches the spec text
// in DESIGN_NOTES.md ("allow opponents to pass through"). If we later want
// blocks to halt passage too, gate that here.

export function legalMoves(state: RoomState, seat: number, dice: number): Move[] {
  const player = state.seats[seat];
  if (!player || player.kind === "empty") return [];
  const moves: Move[] = [];
  for (let i = 0; i < 4; i++) {
    const from = player.pieces[i];
    const to = computeDestination(player.color, from, dice);
    if (to === null) continue;
    const captures = detectCapture(state, seat, to);
    moves.push({ pieceIndex: i, from, to, captures });
  }
  return moves;
}

export function computeDestination(color: Color, from: number, dice: number): number | null {
  if (from === FINISHED) return null;
  if (from === YARD) {
    return dice === 6 ? START_OFFSET[color] : null;
  }
  if (isOnHomeStretch(from)) {
    const next = from + dice;
    if (next === FINISHED) return FINISHED;
    if (next > HOME_END && next !== FINISHED) {
      if (next > FINISHED) return null;
    }
    if (next > FINISHED) return null;
    return next;
  }
  if (isOnMainTrack(from)) {
    const entry = homeEntry(color);
    const toEntry = (entry - from + TRACK_LENGTH) % TRACK_LENGTH;
    if (dice <= toEntry) {
      return (from + dice) % TRACK_LENGTH;
    }
    const homeOffset = dice - toEntry - 1;
    const next = HOME_BASE + homeOffset;
    if (next === FINISHED) return FINISHED;
    if (next > FINISHED) return null;
    return next;
  }
  return null;
}

function detectCapture(state: RoomState, mySeat: number, dest: number): Capture | null {
  if (!isOnMainTrack(dest)) return null;
  if (SAFE_SQUARES.has(dest)) return null;
  for (let s = 0; s < state.seats.length; s++) {
    if (s === mySeat) continue;
    const opp = state.seats[s];
    if (opp.kind === "empty") continue;
    const indices: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (opp.pieces[i] === dest) indices.push(i);
    }
    if (indices.length === 1) {
      return { seat: s, pieceIndex: indices[0] };
    }
  }
  return null;
}

function passTurn(state: RoomState): RoomState {
  return {
    ...state,
    version: state.version + 1,
    turn: {
      seat: nextActiveSeat(state, state.turn.seat),
      sixesInRow: 0,
      extraTurn: false,
    },
    dice: null,
  };
}

export function nextActiveSeat(state: RoomState, fromSeat: number): number {
  for (let i = 1; i <= 4; i++) {
    const candidate = (fromSeat + i) % 4;
    const seat = state.seats[candidate];
    if (seat.kind === "empty") continue;
    if (state.finishOrder.includes(candidate)) continue;
    return candidate;
  }
  return fromSeat;
}

export function handleRoll(state: RoomState, dice: number, now: number): RoomState {
  const sixesInRow = dice === 6 ? state.turn.sixesInRow + 1 : 0;

  if (sixesInRow >= 3) {
    return passTurn(state);
  }

  const stateWithDice: RoomState = {
    ...state,
    version: state.version + 1,
    turn: { ...state.turn, sixesInRow },
    dice: { value: dice, rolledAt: now },
  };

  const moves = legalMoves(stateWithDice, state.turn.seat, dice);
  if (moves.length === 0) {
    return passTurn(stateWithDice);
  }

  return stateWithDice;
}

export function handleMove(state: RoomState, move: Move): RoomState {
  if (!state.dice) throw new Error("handleMove called without dice");
  const diceValue = state.dice.value;
  const seat = state.turn.seat;

  const seats = state.seats.map((s, idx) => {
    if (idx === seat) {
      const pieces = [...s.pieces] as Pieces;
      pieces[move.pieceIndex] = move.to;
      return { ...s, pieces };
    }
    if (move.captures && move.captures.seat === idx) {
      const pieces = [...s.pieces] as Pieces;
      pieces[move.captures.pieceIndex] = YARD;
      return { ...s, pieces };
    }
    return s;
  });

  const seatJustFinished = seats[seat].pieces.every((p) => p === FINISHED);
  const finishOrder = seatJustFinished && !state.finishOrder.includes(seat)
    ? [...state.finishOrder, seat]
    : state.finishOrder;
  const gameOver = finishOrder.length >= 3;

  const wasSix = diceValue === 6;
  const capturedNow = move.captures !== null;
  const extraTurn = (wasSix || capturedNow) && !seatJustFinished && !gameOver;

  let nextTurn: Turn;
  if (extraTurn) {
    nextTurn = { seat, sixesInRow: state.turn.sixesInRow, extraTurn: true };
  } else {
    const lookahead: RoomState = { ...state, seats, finishOrder };
    nextTurn = { seat: nextActiveSeat(lookahead, seat), sixesInRow: 0, extraTurn: false };
  }

  return {
    ...state,
    version: state.version + 1,
    seats,
    finishOrder,
    phase: gameOver ? "ended" : state.phase,
    turn: nextTurn,
    dice: null,
  };
}
