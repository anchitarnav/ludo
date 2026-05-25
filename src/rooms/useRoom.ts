import { useEffect, useState } from "react";
import type { RoomState } from "../engine";
import { subscribeRoom } from "./roomStore";

export type RoomLoad =
  | { status: "loading"; state: null; error: null }
  | { status: "missing"; state: null; error: null }
  | { status: "ready"; state: RoomState; error: null }
  | { status: "error"; state: null; error: Error };

export function useRoom(roomCode: string | undefined): RoomLoad {
  const [load, setLoad] = useState<RoomLoad>({ status: "loading", state: null, error: null });

  useEffect(() => {
    if (!roomCode) return;
    setLoad({ status: "loading", state: null, error: null });
    return subscribeRoom(
      roomCode,
      (state) => {
        if (!state) {
          setLoad({ status: "missing", state: null, error: null });
        } else {
          setLoad({ status: "ready", state, error: null });
        }
      },
      (error) => setLoad({ status: "error", state: null, error }),
    );
  }, [roomCode]);

  return load;
}
