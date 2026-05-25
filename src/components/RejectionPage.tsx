import { useAuth } from "../auth/AuthProvider";

export function RejectionPage() {
  const { user, signOutUser } = useAuth();
  return (
    <div className="centered card-stack">
      <h1>Not on the guest list</h1>
      <p className="muted">
        Ask the host to add your account ID to the allowlist:
      </p>
      <code className="uid">{user?.uid}</code>
      <button
        className="secondary"
        onClick={() => {
          if (user?.uid) navigator.clipboard.writeText(user.uid);
        }}
      >
        Copy ID
      </button>
      <button className="ghost" onClick={signOutUser}>
        Sign out
      </button>
    </div>
  );
}
