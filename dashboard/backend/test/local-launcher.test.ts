import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local dashboard launcher", () => {
  const launcher = readFileSync(new URL("../../sd.sh", import.meta.url), "utf8");
  const devLocal = readFileSync(new URL("../../dev-local.sh", import.meta.url), "utf8");

  it("사용자와 같은 단일 포트 런타임을 빌드하고 백그라운드로 재시작한다", () => {
    expect(launcher).toContain("readlink");
    expect(launcher).toContain("PID_FILE");
    expect(launcher).toContain("stop_previous");
    expect(launcher).toContain("launchctl submit");
    expect(launcher).toContain('PATH="$PATH"');
    expect(launcher).toContain("nohup");
    expect(launcher).toContain('npm run build:dashboard');
    expect(launcher).toContain('dashboard-runtime/server.mjs');
    expect(launcher).not.toContain('"$DASHBOARD_ROOT/dev-local.sh"');
    expect(launcher).toContain('source "$DASHBOARD_ROOT/port-contract.sh"');
    expect(launcher).toContain('API_PORT="$SUGO_LOCAL_API_PORT"');
    expect(launcher).not.toContain('UI_PORT="$SUGO_LOCAL_UI_PORT"');
    expect(launcher).not.toContain("next_free_port");
    expect(launcher).toContain('if [ "${1:-}" = "ports" ]');
    expect(launcher).toContain("sugo_print_port_contract");
  });

  it("다른 앱을 죽이지 않도록 listener의 cwd가 dashboard 경로인지 확인한다", () => {
    expect(launcher).toContain("stop_stale_dashboard_listeners");
    expect(launcher).toContain('"$BACKEND_DIR"|"$FRONTEND_DIR"');
  });

  it("서버 상태 파일이 종료 중 사라져도 재시작을 계속한다", () => {
    expect(launcher).toContain('"$state_file" 2>/dev/null || true');
  });

  it("showcase 데이터는 명시적으로 요청할 때만 시드한다", () => {
    expect(devLocal).toContain('if [ "${SUGO_LOCAL_DEMO:-0}" = "1" ]; then');
  });

  it("개발 실행과 설치형 Console이 같은 사용자 DB를 정본으로 쓴다", () => {
    expect(devLocal).toContain('SUGO_DATA_HOME="${SUGO_HOME_OVERRIDE:-$HOME}/.claude/sugo"');
    expect(devLocal).toContain('export SQLITE_FILE="${SQLITE_FILE:-$SUGO_DATA_HOME/dashboard/dashboard.db}"');
    expect(devLocal).not.toContain('$BACKEND_DIR/local.db');
  });
});
