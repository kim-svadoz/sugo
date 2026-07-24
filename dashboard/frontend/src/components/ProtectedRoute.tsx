import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

// §5: "ProtectedRoute는 isAuthenticated 게이트(로딩중 스피너, 아니면 /login)".
// No separate loading phase here - authStore hydrates synchronously from
// localStorage before first render, so there is nothing to await.
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
