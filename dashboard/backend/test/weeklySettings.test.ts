import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWeeklySettingsService } from "../src/services/weeklySettingsService.js";

describe("weekly settings", () => {
  it("토요일과 일요일을 포함한 예약·모델·토큰을 저장하고 토큰 원문은 반환하지 않는다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const applied: unknown[] = [];
    const service = createWeeklySettingsService({ weeklyHome, applySchedule: async (settings) => { applied.push(settings); } });

    const saturday = await service.save({ enabled: true, weekday: 6, hour: 8, minute: 30, model: "opus", extraRepositories: ["/repo/a"] }, "secret-token");
    expect(saturday).toMatchObject({ configured: true, tokenConfigured: true, weekday: 6, hour: 8, minute: 30, model: "opus" });
    expect(saturday).not.toHaveProperty("token");
    expect(await readFile(join(weeklyHome, "claude.token"), "utf8")).toBe("secret-token\n");
    expect((await stat(join(weeklyHome, "claude.token"))).mode & 0o777).toBe(0o600);

    await service.save({ enabled: true, weekday: 0, hour: 21, minute: 0, model: "default", extraRepositories: [] });
    expect((await service.get()).weekday).toBe(0);
    expect(applied).toHaveLength(2);
  });

  it("기존 Weekly 설정의 알 수 없는 필드를 보존하면서 Console 설정으로 이전한다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(weeklyHome, { recursive: true });
    await writeFile(join(weeklyHome, "config.json"), JSON.stringify({ exclude_subject: ["bot"], schedule: { weekday: 2, hour: 9, minute: 0, enabled: true } }));
    const service = createWeeklySettingsService({ weeklyHome, applySchedule: async () => undefined });

    await service.save({ enabled: false, weekday: 1, hour: 7, minute: 15, model: "sonnet", extraRepositories: ["/repo/b"] });
    const stored = JSON.parse(await readFile(join(weeklyHome, "config.json"), "utf8"));
    expect(stored.exclude_subject).toEqual(["bot"]);
    expect(stored.schedule).toEqual({ enabled: false, weekday: 1, hour: 7, minute: 15 });
    expect(stored.model).toBe("sonnet");
  });
});
