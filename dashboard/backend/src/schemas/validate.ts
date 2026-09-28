import type { NextFunction, Request, Response } from "express";
import type { ZodType, ZodTypeDef } from "zod";

// PUBLIC sync/activity routes are non-blocking-by-contract (spec §4/§7) - a
// validation failure still gets a fast, clear 400 rather than a hang or 500.
export function validateBody<TOutput, TInput = TOutput>(schema: ZodType<TOutput, ZodTypeDef, TInput>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "invalid_request", issues: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}
