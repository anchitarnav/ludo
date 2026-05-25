import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useRoom } from "../rooms/useRoom";
import { getSessionId } from "../rooms/sessionId";
import { GameView } from "./GameView";
import { Lobby } from "./Lobby";

export function RoomPage() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const load = useRoom(roomCode);

  if (load.status === "loading") return <div className="centered">Loading room…</div>;
  if (load.status === "missing") return <div className="centered card-stack">Room not found.</div>;
  if (load.status === "error") {
    return (
      <div className="centered card-stack">
        <p className="error">Could not load room: {load.error.message}</p>
      </div>
    );
  }
  if (!user || !roomCode) return null;

  const sessionId = getSessionId();
  const state = load.state;

  if (state.phase === "lobby") {
    return <Lobby roomCode={roomCode} state={state} uid={user.uid} sessionId={sessionId} displayName={user.displayName ?? "Friend"} />;
  }

  return <GameView roomCode={roomCode} state={state} uid={user.uid} sessionId={sessionId} />;
}
