import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { createRoom } from "../rooms/roomStore";

export function HomePage() {
  const { user, signOutUser } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const newCode = await createRoom(user.uid);
      nav(`/r/${newCode}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) return;
    nav(`/r/${trimmed}`);
  }

  return (
    <div className="centered card-stack">
      <header className="row spaced">
        <h1>Cheeky Ludo</h1>
        <button className="ghost" onClick={signOutUser}>
          Sign out
        </button>
      </header>
      <p className="muted">Signed in as {user?.displayName ?? user?.email}.</p>

      <section className="card">
        <h2>Start a new room</h2>
        <button className="primary" disabled={busy} onClick={handleCreate}>
          {busy ? "Creating…" : "Create room"}
        </button>
      </section>

      <section className="card">
        <h2>Join a room</h2>
        <div className="row">
          <input
            className="code-input"
            placeholder="ABC123"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="primary" onClick={handleJoin} disabled={!code}>
            Join
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
