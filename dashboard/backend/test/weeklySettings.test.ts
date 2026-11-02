import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWeeklySettingsService, normalizeClaudeToken } from "../src/services/weeklySettingsService.js";

describe("weekly settings", () => {
  it("토요일과 일요일을 포함한 예약·모델·토큰을 저장하고 토큰 원문은 반환하지 않는다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const service = createWeeklySettingsService({ weeklyHome, findEngine: async () => "/plugin/weekly", verifyToken: async () => null });

    const saturday = await service.save({ enabled: true, weekday: 6, hour: 8, minute: 30, model: "opus", extraRepositories: ["/repo/a"] }, "sk-ant-oat01-secret");
    expect(saturday).toMatchObject({ configured: true, tokenConfigured: true, weekday: 6, hour: 8, minute: 30, model: "opus" });
    expect(saturday).not.toHaveProperty("token");
    expect(await readFile(join(weeklyHome, "claude.token"), "utf8")).toBe("sk-ant-oat01-secret\n");
    expect((await stat(join(weeklyHome, "claude.token"))).mode & 0o777).toBe(0o600);

    await service.save({ enabled: true, weekday: 0, hour: 21, minute: 0, model: "default", extraRepositories: [] });
    expect((await service.get()).weekday).toBe(0);
    expect((await service.get()).engineAvailable).toBe(true);
  });

  it("기존 Weekly 설정의 알 수 없는 필드를 보존하면서 Console 설정으로 이전한다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(weeklyHome, { recursive: true });
    await writeFile(join(weeklyHome, "config.json"), JSON.stringify({ exclude_subject: ["bot"], schedule: { weekday: 2, hour: 9, minute: 0, enabled: true } }));
    const service = createWeeklySettingsService({ weeklyHome, findEngine: async () => null });

    await service.save({ enabled: false, weekday: 1, hour: 7, minute: 15, model: "sonnet", extraRepositories: ["/repo/b"] });
    const stored = JSON.parse(await readFile(join(weeklyHome, "config.json"), "utf8"));
    expect(stored.exclude_subject).toEqual(["bot"]);
    expect(stored.schedule).toEqual({ enabled: false, weekday: 1, hour: 7, minute: 15 });
    expect(stored.model).toBe("sonnet");
  });
});

describe("Claude 토큰 입력", () => {
  const settings = { enabled: true, weekday: 6, hour: 8, minute: 0, model: "default" as const, extraRepositories: [] };

  it("터미널에서 두 줄로 접힌 토큰을 복사해 붙여도 공백과 줄바꿈을 지워 한 값으로 만든다", () => {
    expect(normalizeClaudeToken("sk-ant-oat01-a_b\nc-d")).toBe("sk-ant-oat01-a_bc-d");
    expect(normalizeClaudeToken("  sk-ant-oat01-abc  def\r\n ghi \t")).toBe("sk-ant-oat01-abcdefghi");
  });

  it("Claude 토큰 형식이 아니면 null을 돌려준다", () => {
    for (const raw of ["", "   ", "secret-token", "sk-ant-", "sk-ant-oat01-abc;rm", "Your OAuth token: sk-ant-oat01-abc"]) {
      expect(normalizeClaudeToken(raw)).toBeNull();
    }
  });

  it("접힌 토큰은 공백 없이 저장하고, 저장 전에 그 값으로 로그인되는지 확인한다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const checked: string[] = [];
    const service = createWeeklySettingsService({ weeklyHome, findEngine: async () => null, verifyToken: async (token) => { checked.push(token); return null; } });

    await service.save(settings, "sk-ant-oat01-first\n  second");

    expect(checked).toEqual(["sk-ant-oat01-firstsecond"]);
    expect(await readFile(join(weeklyHome, "claude.token"), "utf8")).toBe("sk-ant-oat01-firstsecond\n");
  });

  it("형식이 틀리면 확인 없이 거부하고 기존 토큰을 남긴다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    let verified = false;
    const service = createWeeklySettingsService({ weeklyHome, findEngine: async () => null, verifyToken: async () => { verified = true; return null; } });
    await service.save(settings, "sk-ant-oat01-kept");

    verified = false;
    await expect(service.save(settings, "not-a-token")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(verified).toBe(false);
    expect(await readFile(join(weeklyHome, "claude.token"), "utf8")).toBe("sk-ant-oat01-kept\n");
  });

  it("로그인이 거부된 토큰은 저장하지 않고 이유를 알린다", async () => {
    const weeklyHome = await mkdtemp(join(tmpdir(), "sugo-weekly-"));
    const service = createWeeklySettingsService({ weeklyHome, findEngine: async () => null, verifyToken: async () => "Not logged in · Please run /login" });

    await expect(service.save(settings, "sk-ant-oat01-bad")).rejects.toMatchObject({ code: "TOKEN_REJECTED", message: expect.stringContaining("Not logged in") });
    expect((await service.get()).tokenConfigured).toBe(false);
  });
});
