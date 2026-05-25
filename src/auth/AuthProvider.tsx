import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";

type AuthStatus = "loading" | "signed-out" | "not-allowed" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setStatus("signed-out");
        return;
      }
      const allowedRef = doc(db, "allowed_users", u.uid);
      const allowed = await getDoc(allowedRef);
      if (!allowed.exists()) {
        setUser(u);
        setStatus("not-allowed");
        return;
      }
      await setDoc(
        doc(db, "users", u.uid),
        {
          displayName: u.displayName ?? "Anonymous",
          photoURL: u.photoURL ?? null,
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      );
      setUser(u);
      setStatus("ready");
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      signOutUser: async () => {
        await signOut(auth);
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
