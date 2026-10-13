import type { NextFunction, Request, Response } from "express";

// §8 "현재 냄새" fix: whitelist instead of wide-open cors(). Frontend attaches
// Authorization: Bearer (§5), so Access-Control-Allow-Headers must include it.
export function corsWhitelist(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      // Schedule 메모 날짜 이동은 PATCH를 쓴다. 브라우저의 cross-origin 요청은
      // 본 요청 전에 OPTIONS를 보내므로 여기서 빠지면 라우트가 정상이어도 호출되지 않는다.
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
