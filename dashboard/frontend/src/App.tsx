import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { Layout } from "./components/Layout.js";
import { Login } from "./pages/Login.js";
import { AuthCallback } from "./pages/AuthCallback.js";
import { Sessions } from "./pages/Sessions.js";
import { RoadmapPage } from "./pages/RoadmapPage.js";
import { Skills } from "./pages/Skills.js";
import { Harness } from "./pages/Harness.js";
import { Playbook } from "./pages/Playbook.js";
import { Settings } from "./pages/Settings.js";

// §5: BrowserRouter -> AuthProvider. 공개: /login, /auth/callback.
// 게이트(ProtectedRoute -> Layout): /(-> /sessions), sessions, roadmap/:workspace,
// skills, harness, playbook, settings.
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/sessions" replace />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/roadmap/:workspace" element={<RoadmapPage />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/harness" element={<Harness />} />
              <Route path="/playbook" element={<Playbook />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
