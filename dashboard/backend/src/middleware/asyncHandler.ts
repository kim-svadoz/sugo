import type { NextFunction, Request, Response, RequestHandler } from "express";

// Express 4는 async 핸들러가 reject해도 자동으로 잡지 않는다 → unhandledRejection으로 프로세스가
// 죽는다. 실제 MySQL e2e(2026-07-25)에서 잘못된 datetime 페이로드 하나가 대시보드 전체를 내리는
// 걸 발견 — §3.1/§7 "sync는 논블로킹·항상 빠른 응답, 대시보드 다운이 플러그인을 막지 않는다"에
// 정면 위배. 모든 async 라우트 핸들러를 이 래퍼로 감싸 에러를 next()로 넘겨 전역 에러 미들웨어가
// 프로세스를 죽이지 않고 응답하게 한다.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 전역 에러 미들웨어. sync/activity 경로는 논블로킹 계약이라 에러여도 프로세스를 죽이지 않고
// 조용히 500(또는 이미 응답 시작됐으면 위임)으로 끝낸다 — 플러그인의 fire-and-forget push는
// 어차피 실패를 무시하므로 대시보드가 살아있는 게 최우선.
export function errorMiddleware(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error("[dashboard] request error (프로세스는 계속 살아있음):", err instanceof Error ? err.message : err);
  res.status(500).json({ error: "internal_error" });
}
