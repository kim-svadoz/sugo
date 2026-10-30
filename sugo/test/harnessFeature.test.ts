import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setHarnessFeatureEnabled } from "../src/harness/featureControl.js";
import { loadHarnessFeatureState } from "../src/harness/featureState.js";
import { syncProjectHarness } from "../src/harness/sync.js";

describe("global harness feature", () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sugo-harness-feature-home-"));
    project = mkdtempSync(join(tmpdir(), "sugo-harness-feature-project-"));
    process.env.SUGO_HOME_OVERRIDE = home;
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "^19.0.0" } }));
    writeFileSync(join(project, "tsconfig.json"), "{}");
  });

  afterEach(() => {
    delete process.env.SUGO_HOME_OVERRIDE;
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });

  it("기본값은 켜짐이며 OFF는 파일을 보존하고 자동 로딩 진입점만 제거한 뒤 ON에서 복구한다", async () => {
    expect(await loadHarnessFeatureState()).toEqual({ enabled: true });
    await syncProjectHarness({ projectPath: project, workspace: "demo" });
    const harnessFile = join(project, "sugo", "harness", "lang", "typescript", "harness.md");
    const ruleFile = join(project, ".claude", "rules", "lang-typescript.md");
    expect(existsSync(harnessFile)).toBe(true);
    expect(existsSync(ruleFile)).toBe(true);

    await setHarnessFeatureEnabled(false);
    expect(existsSync(harnessFile)).toBe(true);
    expect(existsSync(ruleFile)).toBe(false);
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).not.toContain("sugo:harness-rules:start");

    await syncProjectHarness({ projectPath: project });
    expect(existsSync(ruleFile)).toBe(false);

    await setHarnessFeatureEnabled(true);
    expect(existsSync(ruleFile)).toBe(true);
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toContain("sugo:harness-rules:start");
  });
});
