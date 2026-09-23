import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local dashboard launcher", () => {
  const launcher = readFileSync(new URL("../../sd.sh", import.meta.url), "utf8");

  it("기존 관리 프로세스를 종료하고 최신 dev-local을 백그라운드로 재시작한다", () => {
    expect(launcher).toContain("readlink");
    expect(launcher).toContain("PID_FILE");
    expect(launcher).toContain("stop_previous");
    expect(launcher).toContain("launchctl submit");
    expect(launcher).toContain('PATH="$PATH"');
    expect(launcher).toContain("nohup");
    expect(launcher).toContain('"$DASHBOARD_ROOT/dev-local.sh"');
    expect(launcher).toContain("DASHBOARD_API_PORT=3001");
    expect(launcher).toContain("DASHBOARD_UI_PORT=5175");
    expect(launcher).toContain("DASHBOARD_STRICT_PORTS=1");
  });

  it("다른 앱을 죽이지 않도록 listener의 cwd가 dashboard 경로인지 확인한다", () => {
    expect(launcher).toContain("stop_stale_dashboard_listeners");
    expect(launcher).toContain('"$BACKEND_DIR"|"$FRONTEND_DIR"');
  });
});
