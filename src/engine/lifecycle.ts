import { SEAT_COLOR, YARD } from "./board";
import { initialFavorState } from "./favors";
import type { BotMode, Pieces, RoomState, Seat } from "./state";

const EMPTY_PIECES: Pieces = [YARD, YARD, YARD, YARD];

export function createInitialRoom(hostUid: string): RoomState {
  const seats: Seat[] = [0, 1, 2, 3].map((idx) => ({
    kind: "empty",
    uid: null,
    sessionId: null,
    displayName: null,
    color: SEAT_COLOR[idx],
    pieces: [...EMPTY_PIECES] as Pieces,
  }));

  return {
    hostUid,
    phase: "lobby",
    botMode: "neutral",
    seed: null,
    version: 1,
    turn: { seat: 0, sixesInRow: 0, extraTurn: false },
    dice: null,
    seats,
    finishOrder: [],
    favorState: null,
    favorLog: [],
  };
}

export function claimSeat(
  state: RoomState,
  seatIndex: number,
  uid: string,
  sessionId: string,
  displayName: string,
): RoomState {
  if (state.phase !== "lobby") throw new Error("cannot claim seat outside lobby");
  const seat = state.seats[seatIndex];
  if (!seat) throw new Error(`invalid seat ${seatIndex}`);
  if (seat.kind !== "empty" && seat.sessionId !== sessionId) {
    throw new Error("seat occupied");
  }
  const seats = state.seats.map((s, i) =>
    i === seatIndex
      ? { ...s, kind: "human" as const, uid, sessionId, displayName }
      : s,
  );
  return { ...state, version: state.version + 1, seats };
}

export function leaveSeat(state: RoomState, seatIndex: number, sessionId: string): RoomState {
  if (state.phase === "ended") return state;
  const seat = state.seats[seatIndex];
  if (!seat || seat.sessionId !== sessionId) {
    throw new Error("not seat owner");
  }
  const seats = state.seats.map((s, i) =>
    i === seatIndex
      ? {
          ...s,
          kind: "empty" as const,
          uid: null,
          sessionId: null,
          displayName: null,
          pieces: [...EMPTY_PIECES] as Pieces,
        }
      : s,
  );
  return { ...state, version: state.version + 1, seats };
}

export function setBotMode(state: RoomState, hostUid: string, mode: BotMode): RoomState {
  if (state.phase !== "lobby") throw new Error("cannot change bot mode mid-game");
  if (state.hostUid !== hostUid) throw new Error("only host can set bot mode");
  return { ...state, version: state.version + 1, botMode: mode };
}

export function startGame(state: RoomState, hostUid: string, seed: number): RoomState {
  if (state.phase !== "lobby") throw new Error("game already started");
  if (state.hostUid !== hostUid) throw new Error("only host can start");
  const humans = state.seats.filter((s) => s.kind === "human");
  if (humans.length < 1) throw new Error("need at least 1 human player");

  const seats: Seat[] = state.seats.map((s, i) =>
    s.kind === "empty"
      ? {
          ...s,
          kind: "bot" as const,
          uid: null,
          sessionId: null,
          displayName: `Bot ${i + 1}`,
        }
      : s,
  );

  const firstSeat = seats.findIndex((s) => s.kind !== "empty");
  const isCheeky = state.botMode === "cheeky";
  return {
    ...state,
    version: state.version + 1,
    phase: "playing",
    seed,
    turn: { seat: firstSeat, sixesInRow: 0, extraTurn: false },
    dice: null,
    seats,
    finishOrder: [],
    favorState: isCheeky ? initialFavorState() : null,
    favorLog: [],
  };
}

export function endGameNow(state: RoomState, hostUid: string): RoomState {
  if (state.hostUid !== hostUid) throw new Error("only host can end the game");
  if (state.phase !== "playing") throw new Error("can only end during play");
  return {
    ...state,
    version: state.version + 1,
    phase: "ended",
    dice: null,
  };
}

export function resetToLobby(state: RoomState): RoomState {
  const seats = state.seats.map((s) =>
    s.kind === "bot"
      ? {
          ...s,
          kind: "empty" as const,
          uid: null,
          sessionId: null,
          displayName: null,
          pieces: [...EMPTY_PIECES] as Pieces,
        }
      : { ...s, pieces: [...EMPTY_PIECES] as Pieces },
  );
  return {
    ...state,
    version: state.version + 1,
    phase: "lobby",
    seed: null,
    turn: { seat: 0, sixesInRow: 0, extraTurn: false },
    dice: null,
    seats,
    finishOrder: [],
    favorState: null,
    favorLog: [],
  };
}
