import { COLOR_HEX, legalMoves } from "../engine";
import type { Move, RoomState } from "../engine";
import { commitMove, returnToLobby, rollDice } from "../rooms/roomStore";
import { Board } from "./Board";
import { Dice } from "./Dice";

interface Props {
  roomCode: string;
  state: RoomState;
  uid: string;
  sessionId: string;
}

export function GameView({ roomCode, state, uid, sessionId }: Props) {
  const mySeatIndex = state.seats.findIndex((s) => s.sessionId === sessionId);
  const activeSeatIndex = state.turn.seat;
  const activeSeat = state.seats[activeSeatIndex];
  const isMyTurn = mySeatIndex === activeSeatIndex;
  const moves: Move[] = state.dice
    ? legalMoves(state, activeSeatIndex, state.dice.value)
    : [];

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

  return (
    <div className="game-view">
      <header className="row spaced">
        <div className="row">
          <span className="swatch" style={{ background: COLOR_HEX[activeSeat.color] }} />
          <strong>{activeSeat.displayName ?? "—"}</strong>
          <span className="muted">to move</span>
        </div>
        <div className="room-code">
          <span>Room</span>
          <strong>{roomCode}</strong>
        </div>
      </header>

      <Board
        state={state}
        highlightPieces={isMyTurn ? moves.map((m) => ({ seat: activeSeatIndex, piece: m.pieceIndex })) : []}
        onPieceClick={isMyTurn ? onPieceClick : undefined}
        activeSeat={activeSeatIndex}
      />

      <Dice
        value={state.dice?.value ?? null}
        canRoll={isMyTurn && !state.dice && state.phase === "playing"}
        onRoll={onRoll}
      />

      {state.phase === "ended" && (
        <div className="overlay">
          <div className="card-stack">
            <h2>Game over</h2>
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
