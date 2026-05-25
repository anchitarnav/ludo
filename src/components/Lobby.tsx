import { useState } from "react";
import { COLOR_HEX } from "../engine";
import type { BotMode, RoomState } from "../engine";
import { beginGame, chooseBotMode, joinSeat, leaveRoomSeat } from "../rooms/roomStore";

const BOT_MODE_LABELS: Record<BotMode, string> = {
  neutral: "Neutral — honest dice, random play",
  killer: "Killer — chases captures",
  defensive: "Defensive — plays it safe",
  cheeky: "Cheeky — the dice has a mind of its own",
};

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
  const humans = state.seats.filter((s) => s.kind === "human").length;
  const empties = state.seats.filter((s) => s.kind === "empty").length;
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

  async function pickMode(mode: BotMode) {
    setBusy(true);
    try {
      await chooseBotMode(roomCode, uid, mode);
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
              {seat.kind === "empty" ? (
                <em className="muted">empty → bot on start</em>
              ) : (
                seat.displayName ?? "—"
              )}
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

      <div className="card">
        <label className="muted" htmlFor="bot-mode">Bot mode (room-wide)</label>
        {isHost ? (
          <select
            id="bot-mode"
            className="select"
            value={state.botMode}
            disabled={busy}
            onChange={(e) => pickMode(e.target.value as BotMode)}
          >
            {(Object.keys(BOT_MODE_LABELS) as BotMode[]).map((m) => (
              <option key={m} value={m}>{BOT_MODE_LABELS[m]}</option>
            ))}
          </select>
        ) : (
          <div className="muted">{BOT_MODE_LABELS[state.botMode]}</div>
        )}
        {empties > 0 && (
          <p className="muted small-note">
            {empties} empty seat{empties === 1 ? "" : "s"} will be filled with bots when the host starts.
          </p>
        )}
      </div>

      {isHost && (
        <button className="primary" disabled={busy || humans < 1} onClick={start}>
          {humans < 1 ? "Need at least 1 human" : "Start game"}
        </button>
      )}

      {!isHost && <p className="muted">Waiting for host to start…</p>}
    </div>
  );
}
