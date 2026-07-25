import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

// 공개 SaaS(§Phase 1.5): GitHub 콜백은 세션 토큰을 URL 프래그먼트(#session=)로 넘겨준다.
// 여기서 파싱해 저장하고 프래그먼트를 지운다. React StrictMode(개발)가 useEffect를 2번 실행하므로
// ref 가드로 1회만 처리한다(2회차엔 이미 프래그먼트가 지워져 있어 오탐 missing_session이 났었음).
export function AuthCallback() {
  const { handleSession, isAuthenticated } = useAuth();
  const [error, setError] = useState(false);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const session = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("session");
    if (session) {
      handleSession(session);
      window.history.replaceState(null, "", window.location.pathname); // 프래그먼트 제거
    } else if (!isAuthenticated) {
      setError(true);
    }
  }, [handleSession, isAuthenticated]);

  if (isAuthenticated) {
    return <Navigate to="/sessions" replace />;
  }
  if (error) {
    return <div className="p-6 text-sm text-red-400">인증 실패: 세션을 찾을 수 없습니다. 다시 로그인해 주세요.</div>;
  }
  return <div className="p-6 text-sm opacity-70">인증 처리 중...</div>;
}
