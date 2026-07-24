import type { NextFunction, Request, Response } from "express";

// §8 "현재 냄새" fix: whitelist instead of wide-open cors(). Frontend attaches
// Authorization: Bearer (§5), so Access-Control-Allow-Headers must include it.
export function corsWhitelist(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
