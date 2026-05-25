import { useEffect, useRef } from "react";
import { COLOR_HEX, legalMoves } from "../engine";
import type { FavorKind, Move, RoomState } from "../engine";
import { commitMove, endGame, returnToLobby, rollDice } from "../rooms/roomStore";
import { useBotDriver } from "../rooms/useBotDriver";
import { useSound } from "../sound";
import { Board } from "./Board";
import { Dice } from "./Dice";

interface Props {
  roomCode: string;
  state: RoomState;
  uid: string;
  sessionId: string;
}

const FAVOR_KIND_LABELS: Record<FavorKind, string> = {
  lucky_sixes: "Lucky sixes (dice forced to 6)",
  stuck_on_ones: "Stuck on ones (dice forced to 1)",
  guaranteed_kill: "Guaranteed kill (dice forced to capture)",
  home_stretch_sprint: "Home-stretch sprint (dice nudged toward finish)",
  stay_home: "Stay home (6s suppressed to keep pieces in yard)",
};

export function GameView({ roomCode, state, uid, sessionId }: Props) {
  const mySeatIndex = state.seats.findIndex((s) => s.sessionId === sessionId);
  const activeSeatIndex = state.turn.seat;
  const activeSeat = state.seats[activeSeatIndex];
  const isMyTurn = mySeatIndex === activeSeatIndex && activeSeat.kind === "human";
  const isHost = state.hostUid === uid;
  const moves: Move[] = state.dice
    ? legalMoves(state, activeSeatIndex, state.dice.value)
    : [];
  const sound = useSound();
  useBotDriver(roomCode, state, isHost);

  // sound: dice rolled
  const lastRolledAtRef = useRef<number | null>(null);
  useEffect(() => {
    const rolledAt = state.dice?.rolledAt ?? null;
    if (rolledAt && rolledAt !== lastRolledAtRef.current) {
      lastRolledAtRef.current = rolledAt;
      sound.play("roll");
    }
    if (!rolledAt) lastRolledAtRef.current = null;
  }, [state.dice?.rolledAt, sound]);

  // sound: game ended
  const endedRef = useRef(false);
  useEffect(() => {
    if (state.phase === "ended" && !endedRef.current) {
      endedRef.current = true;
      sound.play("finish");
    }
    if (state.phase !== "ended") endedRef.current = false;
  }, [state.phase, sound]);

  async function onRoll() {
    await rollDice(roomCode, sessionId);
  }

  async function onPieceClick(pieceIndex: number) {
    if (!isMyTurn || !state.dice) return;
    if (!moves.some((m) => m.pieceIndex === pieceIndex)) return;
    await commitMove(roomCode, sessionId, pieceIndex);
  }

  async function onPlayAgain() {
    await returnToLobby(roomCode, uid);
  }

  async function onEndGame() {
    if (!window.confirm("End the game now? Everyone will see the result screen.")) return;
    await endGame(roomCode, uid);
  }

  const endedEarly = state.phase === "ended" && state.finishOrder.length < 3;
  const unranked = state.seats
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.kind !== "empty" && !state.finishOrder.includes(i));

  const turnLabel = (() => {
    if (activeSeat.kind === "bot") return "thinking…";
    if (isMyTurn) return "your turn";
    return "to move";
  })();

  return (
    <div className="game-view">
      <header className="row spaced">
        <div className="row">
          <span className="swatch" style={{ background: COLOR_HEX[activeSeat.color] }} />
          <strong>{activeSeat.displayName ?? "—"}</strong>
          <span className="muted">{turnLabel}</span>
        </div>
        <div className="row">
          {isHost && state.phase === "playing" && (
            <button className="ghost small" onClick={onEndGame} title="End the game now">
              End game
            </button>
          )}
          <button
            className="ghost small"
            onClick={() => sound.toggleMuted()}
            title={sound.muted ? "Unmute" : "Mute"}
            aria-label={sound.muted ? "Unmute sounds" : "Mute sounds"}
          >
            {sound.muted ? "🔇" : "🔊"}
          </button>
          <div className="room-code">
            <span>Room</span>
            <strong>{roomCode}</strong>
          </div>
        </div>
      </header>

      <Board
        state={state}
        highlightPieces={isMyTurn ? moves.map((m) => ({ seat: activeSeatIndex, piece: m.pieceIndex })) : []}
        onPieceClick={isMyTurn ? onPieceClick : undefined}
        activeSeat={activeSeatIndex}
        sound={sound}
      />

      <Dice
        value={state.dice?.value ?? null}
        canRoll={isMyTurn && !state.dice && state.phase === "playing"}
        onRoll={onRoll}
      />

      {state.phase === "ended" && (
        <div className="overlay">
          <div className="card-stack">
            <h2>{endedEarly ? "Game ended" : "Game over"}</h2>
            {endedEarly && state.finishOrder.length === 0 && (
              <p className="muted">Ended before anyone finished.</p>
            )}
            {state.finishOrder.length > 0 && (
              <ol>
                {state.finishOrder.map((seatIdx) => {
                  const s = state.seats[seatIdx];
                  return (
                    <li key={seatIdx}>
                      <span className="swatch" style={{ background: COLOR_HEX[s.color] }} />
                      {s.displayName ?? "—"}
                    </li>
                  );
                })}
              </ol>
            )}
            {endedEarly && unranked.length > 0 && (
              <div className="muted">
                <div>Did not finish:</div>
                <ul className="unranked">
                  {unranked.map(({ s, i }) => (
                    <li key={i}>
                      <span className="swatch" style={{ background: COLOR_HEX[s.color] }} />
                      {s.displayName ?? "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {state.botMode === "cheeky" && (
              <details className="favor-reveal">
                <summary>What the dice was up to…</summary>
                {state.favorLog.length === 0 ? (
                  <p className="muted">The dice played fair this time.</p>
                ) : (
                  <ul className="favor-log">
                    {state.favorLog.map((entry, i) => {
                      const target = state.seats[entry.targetSeat];
                      return (
                        <li key={i}>
                          <span className="swatch" style={{ background: COLOR_HEX[target.color] }} />
                          <span>
                            <strong>{target.displayName ?? "—"}</strong>{" "}
                            — {FAVOR_KIND_LABELS[entry.kind]}{" "}
                            <span className="muted">
                              · {entry.rollsAffected} roll{entry.rollsAffected === 1 ? "" : "s"} affected
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            )}

            {state.hostUid === uid && (
              <button className="primary" onClick={onPlayAgain}>
                Play again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
