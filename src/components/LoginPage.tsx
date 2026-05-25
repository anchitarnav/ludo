import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered card-stack">
      <h1>Cheeky Ludo</h1>
      <p className="muted">A 4-player game for friends. The dice may not be entirely honest.</p>
      <button className="primary" onClick={handleSignIn} disabled={busy}>
        {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
