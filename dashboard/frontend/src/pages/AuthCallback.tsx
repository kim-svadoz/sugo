import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

// 공개 SaaS(§Phase 1.5): GitHub 콜백은 세션 토큰을 URL 프래그먼트(#session=)로 넘겨준다
// (쿼리가 아니라 프래그먼트라 서버 로그/리퍼러에 안 남는다). 여기서 파싱해 저장하고 프래그먼트를 지운다.
export function AuthCallback() {
  const { handleSession, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const session = new URLSearchParams(hash).get("session");
    if (!session) {
      setError("missing_session");
      return;
    }
    handleSession(session);
    window.history.replaceState(null, "", window.location.pathname); // 프래그먼트 제거
    setDone(true);
  }, [handleSession]);

  if (error) {
    return <div className="p-6 text-sm text-red-400">인증 실패: {error}</div>;
  }
  if (done || isAuthenticated) {
    return <Navigate to="/sessions" replace />;
  }
  return <div className="p-6 text-sm opacity-70">인증 처리 중...</div>;
}
