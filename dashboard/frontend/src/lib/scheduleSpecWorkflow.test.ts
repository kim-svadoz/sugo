import { describe, expect, it } from "vitest";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { buildFeatCommand, buildPatchAttachCommand, buildPatchCommand, buildSpecWriterCommand, scheduleSpecStage } from "./scheduleSpecWorkflow.js";

const base: ScheduledSpec = {
  id: "spec-manual-1", workspace_name: "shop", title: "결제 개선", status: "pending",
  due_date: null, project_path: "/work/shop", spec_path: null, has_run: false,
  work_branch: null,
};

describe("Schedule SPEC workflow", () => {
  it("derives draft, ready, and immutable in-progress stages", () => {
    expect(scheduleSpecStage(base)).toBe("draft");
    expect(scheduleSpecStage({ ...base, spec_path: "/example/spec.md" })).toBe("ready");
    expect(scheduleSpecStage({ ...base, spec_path: "/example/spec.md", has_run: true })).toBe("in_progress");
  });

  it("builds provider-specific writer commands with the same binding keys", () => {
    expect(buildSpecWriterCommand(base, "claude")).toContain("/sugo:spec-writer");
    expect(buildSpecWriterCommand(base, "codex")).toContain("$sugo:spec-writer");
    for (const provider of ["claude", "codex"] as const) {
      const command = buildSpecWriterCommand(base, provider);
      expect(command).toContain('--workspace "shop"');
      expect(command).toContain('--project "/work/shop"');
      expect(command).toContain('--spec-draft "spec-manual-1"');
    }
  });

  it("pins feat to the exact written spec and dashboard node", () => {
    expect(buildFeatCommand({ ...base, spec_path: "/example/spec.md" })).toBe(
      '/sugo:feat --project "/work/shop" --spec "/example/spec.md" --spec-draft "spec-manual-1" "결제 개선"',
    );
  });

  it("passes the configured work branch to feat", () => {
    expect(buildFeatCommand({ ...base, spec_path: "/example/spec.md", work_branch: "feature/payment" })).toContain(
      '--branch "feature/payment"',
    );
  });

  it("builds the next patch from the latest completed work result", () => {
    expect(buildPatchCommand("/work/shop/sugo/work-result-patch-v1.md")).toBe(
      '/sugo:patch "/work/shop/sugo/work-result-patch-v1.md"',
    );
  });

  it("builds post-hoc attach from the same exact work result", () => {
    expect(buildPatchAttachCommand("/work/shop/sugo/work-result-patch-v1.md")).toBe(
      '/sugo:patch-attach "/work/shop/sugo/work-result-patch-v1.md"',
    );
  });
});
