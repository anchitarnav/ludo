import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { HomePage } from "./components/HomePage";
import { LoginPage } from "./components/LoginPage";
import { RejectionPage } from "./components/RejectionPage";
import { RoomPage } from "./components/RoomPage";

function Gate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <div className="centered">Loading…</div>;
  if (status === "signed-out") return <LoginPage />;
  if (status === "not-allowed") return <RejectionPage />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <Gate>
                <HomePage />
              </Gate>
            }
          />
          <Route
            path="/r/:roomCode"
            element={
              <Gate>
                <RoomPage />
              </Gate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
