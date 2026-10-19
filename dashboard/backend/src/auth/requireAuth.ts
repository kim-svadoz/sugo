import type { NextFunction, Request, Response } from "express";
import { deriveUserId, type VerifyJwt } from "./jwt.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

// requireAuth protects only the bitbucket/pr routes; other routes use their own auth middleware.
export function requireAuth(verifyJwt: VerifyJwt) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "Bearer token required" });
      return;
    }
    try {
      const claims = await verifyJwt(match[1]);
      req.userId = deriveUserId(claims);
      next();
    } catch {
      res.status(401).json({ error: "unauthorized", message: "invalid or expired token" });
    }
  };
}
