import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  claimSeat,
  createInitialRoom,
  endGameNow,
  handleMove,
  handleRoll,
  initialFavorState,
  leaveSeat,
  legalMoves,
  mulberry32,
  pickBotMove,
  pickSeed,
  resetToLobby,
  setBotMode,
  startGame,
  tickFavor,
  type BotMode,
  type Move,
  type RoomState,
} from "../engine";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // base32-ish, no I/O/1/0

function newRoomCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

export function roomRef(roomCode: string): DocumentReference {
  return doc(db, "rooms", roomCode);
}

export async function createRoom(hostUid: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const ref = roomRef(code);
    try {
      const initial = createInitialRoom(hostUid);
      await setDoc(ref, {
        ...initial,
        createdAt: serverTimestamp(),
      });
      return code;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("could not allocate room code");
}

export function subscribeRoom(
  roomCode: string,
  cb: (state: RoomState | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roomRef(roomCode),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(snap.data() as RoomState);
    },
    (err) => onError?.(err as Error),
  );
}

async function mutate(
  roomCode: string,
  fn: (state: RoomState) => RoomState | null,
): Promise<void> {
  const ref = roomRef(roomCode);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error(`room ${roomCode} not found`);
    const current = snap.data() as RoomState;
    const next = fn(current);
    if (!next) return; // silent no-op
    txn.set(ref, next);
  });
}

export function joinSeat(
  roomCode: string,
  seatIndex: number,
  uid: string,
  sessionId: string,
  displayName: string,
): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.seats[seatIndex].kind !== "empty" && s.seats[seatIndex].sessionId !== sessionId) {
      return null;
    }
    return claimSeat(s, seatIndex, uid, sessionId, displayName);
  });
}

export function leaveRoomSeat(
  roomCode: string,
  seatIndex: number,
  sessionId: string,
): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.seats[seatIndex].sessionId !== sessionId) return null;
    return leaveSeat(s, seatIndex, sessionId);
  });
}

export function chooseBotMode(roomCode: string, hostUid: string, mode: BotMode): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.hostUid !== hostUid) return null;
    if (s.phase !== "lobby") return null;
    if (s.botMode === mode) return null;
    return setBotMode(s, hostUid, mode);
  });
}

export function beginGame(roomCode: string, hostUid: string): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.hostUid !== hostUid) return null;
    if (s.phase !== "lobby") return null;
    return startGame(s, hostUid, pickSeed());
  });
}

export function endGame(roomCode: string, hostUid: string): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.hostUid !== hostUid) return null;
    if (s.phase !== "playing") return null;
    return endGameNow(s, hostUid);
  });
}

export function returnToLobby(roomCode: string, hostUid: string): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.hostUid !== hostUid) return null;
    if (s.phase !== "ended") return null;
    return resetToLobby(s);
  });
}

function applyRoll(state: RoomState, honest: number): RoomState {
  const seat = state.turn.seat;
  let value = honest;
  let favorState = state.favorState;
  let favorLog = state.favorLog;
  if (state.botMode === "cheeky") {
    const out = tickFavor(state, state.favorState ?? initialFavorState(), state.favorLog ?? [], seat, honest);
    value = out.value;
    favorState = out.favorState;
    favorLog = out.favorLog;
  }
  const rolled = handleRoll(state, value, Date.now());
  return { ...rolled, favorState, favorLog };
}

export function rollDice(roomCode: string, sessionId: string): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.phase !== "playing") return null;
    const activeSeat = s.seats[s.turn.seat];
    if (!activeSeat || activeSeat.sessionId !== sessionId) return null;
    if (s.dice) return null;
    const honest = 1 + Math.floor(Math.random() * 6);
    return applyRoll(s, honest);
  });
}

export function commitMove(
  roomCode: string,
  sessionId: string,
  pieceIndex: number,
): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.phase !== "playing") return null;
    const activeSeat = s.seats[s.turn.seat];
    if (!activeSeat || activeSeat.sessionId !== sessionId) return null;
    if (!s.dice) return null;
    const candidate: Move | undefined = legalMoves(s, s.turn.seat, s.dice.value).find(
      (m) => m.pieceIndex === pieceIndex,
    );
    if (!candidate) return null;
    return handleMove(s, candidate);
  });
}

// --- Bot turn driver (host-only client driving) ---

export function botRoll(roomCode: string, expectedVersion: number): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.version !== expectedVersion) return null;
    if (s.phase !== "playing") return null;
    const seat = s.seats[s.turn.seat];
    if (seat.kind !== "bot") return null;
    if (s.dice) return null;
    const honest = 1 + Math.floor(Math.random() * 6);
    return applyRoll(s, honest);
  });
}

export function botMove(roomCode: string, expectedVersion: number): Promise<void> {
  return mutate(roomCode, (s) => {
    if (s.version !== expectedVersion) return null;
    if (s.phase !== "playing") return null;
    const seat = s.seats[s.turn.seat];
    if (seat.kind !== "bot") return null;
    if (!s.dice) return null;
    const rng = mulberry32(((s.seed ?? 0) ^ 0xdeadbeef ^ s.version) >>> 0);
    const move = pickBotMove(s, s.turn.seat, s.dice.value, s.botMode, rng);
    if (!move) return null;
    return handleMove(s, move);
  });
}
