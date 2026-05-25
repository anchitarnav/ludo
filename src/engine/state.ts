import type { Color } from "./board";

export type Phase = "lobby" | "playing" | "ended";
export type SeatKind = "empty" | "human" | "bot";
export type BotMode = "neutral" | "killer" | "defensive" | "cheeky";

export type Pieces = [number, number, number, number];

export interface Seat {
  kind: SeatKind;
  uid: string | null;
  sessionId: string | null;
  displayName: string | null;
  color: Color;
  pieces: Pieces;
}

export interface Turn {
  seat: number;
  sixesInRow: number;
  extraTurn: boolean;
}

export interface DiceState {
  value: number;
  rolledAt: number;
}

export type FavorKind =
  | "lucky_sixes"
  | "stuck_on_ones"
  | "guaranteed_kill"
  | "home_stretch_sprint"
  | "stay_home";

export interface ActiveFavor {
  kind: FavorKind;
  targetSeat: number;
  rollsRemaining: number;
  rollsAffected: number;
}

export interface FavorState {
  active: ActiveFavor | null;
  cooldownRolls: number;
  rollCounter: number;
}

export interface FavorLogEntry {
  kind: FavorKind;
  targetSeat: number;
  rollsAffected: number;
  endedAtVersion: number;
}

export interface RoomState {
  hostUid: string;
  phase: Phase;
  botMode: BotMode;
  seed: number | null;
  version: number;
  turn: Turn;
  dice: DiceState | null;
  seats: Seat[];
  finishOrder: number[];
  favorState: FavorState | null;
  favorLog: FavorLogEntry[];
}

export interface Capture {
  seat: number;
  pieceIndex: number;
}

export interface Move {
  pieceIndex: number;
  from: number;
  to: number;
  captures: Capture | null;
}
