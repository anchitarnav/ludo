import { useState } from "react";
import { COLOR_HEX } from "../engine";
import type { RoomState } from "../engine";
import { beginGame, joinSeat, leaveRoomSeat } from "../rooms/roomStore";

interface Props {
  roomCode: string;
  state: RoomState;
  uid: string;
  sessionId: string;
  displayName: string;
}

export function Lobby({ roomCode, state, uid, sessionId, displayName }: Props) {
  const [busy, setBusy] = useState(false);
  const isHost = state.hostUid === uid;
  const occupied = state.seats.filter((s) => s.kind !== "empty").length;
  const mySeatIndex = state.seats.findIndex((s) => s.sessionId === sessionId);

  async function claim(seatIndex: number) {
    setBusy(true);
    try {
      await joinSeat(roomCode, seatIndex, uid, sessionId, displayName);
    } finally {
      setBusy(false);
    }
  }

  async function leave(seatIndex: number) {
    setBusy(true);
    try {
      await leaveRoomSeat(roomCode, seatIndex, sessionId);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    try {
      await beginGame(roomCode, uid);
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(window.location.href);
  }

  return (
    <div className="lobby card-stack">
      <header className="row spaced">
        <h1>Lobby</h1>
        <div className="room-code">
          <span>Room</span>
          <strong>{roomCode}</strong>
        </div>
      </header>

      <button className="secondary" onClick={copyInvite}>
        Copy invite link
      </button>

      <ul className="seat-list">
        {state.seats.map((seat, i) => (
          <li key={i} className="seat" style={{ borderColor: COLOR_HEX[seat.color] }}>
            <span className="swatch" style={{ background: COLOR_HEX[seat.color] }} />
            <span className="seat-name">
              {seat.kind === "empty" ? <em>empty</em> : seat.displayName ?? "—"}
            </span>
            {seat.kind === "empty" && mySeatIndex === -1 && (
              <button className="primary small" disabled={busy} onClick={() => claim(i)}>
                Take seat
              </button>
            )}
            {seat.sessionId === sessionId && (
              <button className="ghost small" disabled={busy} onClick={() => leave(i)}>
                Leave
              </button>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <button
          className="primary"
          disabled={busy || occupied < 1}
          onClick={start}
        >
          {occupied < 1 ? "Need at least 1 player" : "Start game"}
        </button>
      )}

      {!isHost && <p className="muted">Waiting for host to start…</p>}
    </div>
  );
}
