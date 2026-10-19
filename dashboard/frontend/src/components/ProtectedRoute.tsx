import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

// isAuthenticated 게이트. 인증되지 않았으면 /login으로 보낸다.
// No separate loading phase here - authStore hydrates synchronously from
// localStorage before first render, so there is nothing to await.
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
