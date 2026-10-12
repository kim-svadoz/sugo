import { describe, expect, it } from "vitest";
import { completedReviewArtifacts } from "../src/dashboard/sync.js";

describe("completedReviewArtifacts", () => {
  it("완료 Task의 기존 파일 본문을 차수별 아티팩트로 백필한다", () => {
    const artifacts = completedReviewArtifacts([{ id: "task-1", level: "task", title: "T", status: "done", dependsOn: [], workResult: {
      patchVersion: 2,
      files: [{ path: "src/app.ts", change: "modified", content: "next", diff: "-old\n+next" }],
    } }]);
    expect(artifacts).toEqual([{
      taskId: "task-1", sessionId: "completed:task-1:v2", patchVersion: 2,
      files: [{ path: "src/app.ts", change: "modified", content: "next", diff: "-old\n+next" }],
    }]);
  });

  it("기존 완료 산출물에 민감 파일이 있어도 본문은 백필하지 않는다", () => {
    const artifacts = completedReviewArtifacts([{ id: "task-1", level: "task", title: "T", status: "done", dependsOn: [], workResult: {
      files: [{ path: ".env", change: "modified", content: "TOKEN=secret" }],
    } }]);
    expect(artifacts[0].files[0].content).toBeUndefined();
    expect(artifacts[0].files[0].unavailableReason).toBeTruthy();
  });

  it("과거 Roadmap의 파생 메타는 strict 업로드 계약에 싣지 않는다", () => {
    const artifacts = completedReviewArtifacts([{ id: "task-1", level: "task", title: "T", status: "done", dependsOn: [], workResult: {
      files: [{ path: "src/app.ts", change: "modified", content: "next", additions: 1, deletions: 1 } as never],
    } }]);
    expect(artifacts[0].files[0]).toEqual({ path: "src/app.ts", change: "modified", content: "next" });
  });
});
