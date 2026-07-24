import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export function AuthCallback() {
  const [params] = useSearchParams();
  const { handleCallback, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("missing_code");
      return;
    }
    handleCallback(code)
      .then(() => setDone(true))
      .catch(() => setError("token_exchange_failed"));
  }, [params, handleCallback]);

  if (error) {
    return <div className="p-6 text-sm text-red-400">인증 실패: {error}</div>;
  }
  if (done || isAuthenticated) {
    return <Navigate to="/sessions" replace />;
  }
  return <div className="p-6 text-sm opacity-70">인증 처리 중...</div>;
}
