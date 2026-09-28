import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("dashboard local port contract", () => {
  it("모든 고정 포트는 하나의 정본에 있고 서로 겹치지 않는다", () => {
    const entries = Object.fromEntries(
      dashboardFile("ports.env").split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split("=")),
    );
    expect(entries).toEqual({
      SUGO_MYSQL_PORT: "3306",
      SUGO_LOCAL_API_PORT: "3001",
      SUGO_LOCAL_UI_PORT: "5175",
      SUGO_E2E_API_PORT: "4000",
      SUGO_E2E_UI_PORT: "4173",
      SUGO_E2E_OIDC_PORT: "9100",
      SUGO_E2E_BITBUCKET_PORT: "9210",
    });
    expect(new Set(Object.values(entries)).size).toBe(Object.values(entries).length);
  });

  it("Node 계약 모듈도 같은 값을 URL로 노출한다", async () => {
    const contract = await import(new URL("../../port-contract.mjs", import.meta.url).href);
    expect(contract.PORTS).toMatchObject({ localApi: 3001, localUi: 5175, e2eBitbucket: 9210 });
    expect(contract.LOCAL_UI_URL).toBe("http://localhost:5175");
    expect(contract.E2E_BITBUCKET_URL).toBe("http://localhost:9210");
  });

  it("모든 로컬 실행기는 같은 계약을 읽고 빈 포트로 자동 우회하지 않는다", () => {
    for (const path of ["sd.sh", "dev-local.sh", "dev.sh", "dev-mysql.sh"]) {
      const source = dashboardFile(path);
      expect(source, path).toContain("port-contract.sh");
      expect(source, path).not.toContain("next_free_port");
    }
    for (const path of ["dev.ps1", "dev-mysql.ps1"]) {
      expect(dashboardFile(path), path).toContain("port-contract.ps1");
    }
  });

  it("E2E 서버와 브라우저 흐름도 계약 모듈의 URL만 사용한다", () => {
    for (const path of ["e2e/mock-bitbucket.mjs", "e2e/oidc-server.mjs", "e2e/bitbucket-flow.mjs", "e2e/browser-flow.mjs"]) {
      expect(dashboardFile(path), path).toContain('from "../port-contract.mjs"');
    }
    expect(dashboardFile("e2e/mock-bitbucket.mjs")).not.toContain("9200");
  });
});
