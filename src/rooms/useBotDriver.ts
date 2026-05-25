import { useEffect } from "react";
import type { RoomState } from "../engine";
import { botMove, botRoll } from "./roomStore";

const ROLL_DELAY_MS = 700;
const MOVE_DELAY_MS = 700;

export function useBotDriver(
  roomCode: string | undefined,
  state: RoomState | null,
  isHost: boolean,
) {
  useEffect(() => {
    if (!roomCode || !state || !isHost) return;
    if (state.phase !== "playing") return;
    const seat = state.seats[state.turn.seat];
    if (!seat || seat.kind !== "bot") return;

    const version = state.version;
    const delay = state.dice ? MOVE_DELAY_MS : ROLL_DELAY_MS;
    const timer = setTimeout(() => {
      const action = state.dice ? botMove : botRoll;
      action(roomCode, version).catch((err) => {
        console.warn("bot turn failed", err);
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [roomCode, state, isHost]);
}
