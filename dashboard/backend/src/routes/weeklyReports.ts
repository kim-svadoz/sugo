import { Router } from "express";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireUser } from "../auth/requireUser.js";
import { validateBody } from "../schemas/validate.js";
import { getWeeklyReport, listWeeklyReports, saveWeeklyReport } from "../services/weeklyReportService.js";
import type { WeeklySettingsService } from "../services/weeklySettingsService.js";

const weekIdPattern = /^\d{4}-W\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const reportSchema = z.object({
  start: z.string().regex(datePattern),
  end: z.string().regex(datePattern),
  generatedAt: z.string().min(1).max(64),
  report: z.record(z.unknown()),
});

// Sugo 내장 Weekly 엔진이 플러그인 토큰으로 올리고, 웹 세션이 본인 것만 읽는다.
// 두 방향 모두 신원은 토큰에서만 정해지므로 다른 사용자의 보고서는 보이지 않는다.
const settingsSchema = z.object({
  enabled: z.boolean(),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  model: z.enum(["default", "sonnet", "opus"]),
  extraRepositories: z.array(z.string().trim().min(1).max(1024)).max(50),
  token: z.string().trim().min(1).max(16_384).optional(),
});

export function createWeeklyReportsRouter(db: DbClient, sessionSecret: string, settingsService?: WeeklySettingsService): Router {
  const router = Router();
  router.use(requireUser(db, sessionSecret));

  router.put(
    "/:weekId",
    validateBody(reportSchema),
    asyncHandler(async (req, res) => {
      const weekId = String(req.params.weekId);
      if (!weekIdPattern.test(weekId)) {
        res.status(400).json({ error: "invalid_week_id" });
        return;
      }
      await saveWeeklyReport(db, req.userId!, { weekId, ...req.body });
      res.json({ ok: true });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ reports: await listWeeklyReports(db, req.userId!) });
    }),
  );

  if (settingsService) {
    router.get("/settings/current", asyncHandler(async (_req, res) => {
      res.json(await settingsService.get());
    }));
    router.put("/settings/current", validateBody(settingsSchema), asyncHandler(async (req, res) => {
      const { token, ...settings } = req.body;
      res.json(await settingsService.save(settings, token));
    }));
    router.delete("/settings/token", asyncHandler(async (_req, res) => {
      await settingsService.deleteToken();
      res.json({ ok: true });
    }));
  }

  router.get(
    "/:weekId",
    asyncHandler(async (req, res) => {
      const report = await getWeeklyReport(db, req.userId!, String(req.params.weekId));
      if (!report) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(report);
    }),
  );

  return router;
}
