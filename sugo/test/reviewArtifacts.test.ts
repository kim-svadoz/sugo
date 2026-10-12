import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotReviewArtifacts } from "../src/dashboard/workResultFiles.js";

describe("snapshotReviewArtifacts", () => {
  it("일반 소스는 읽고 민감 파일은 본문을 전송하지 않는다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-review-artifact-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "export const ok = true;\n");
    await writeFile(join(root, ".env"), "TOKEN=do-not-send\n");
    const files = await snapshotReviewArtifacts(root, ["src/app.ts", ".env"]);
    expect(files[0].content).toContain("ok = true");
    expect(files[1]).toMatchObject({ path: ".env", unavailableReason: expect.any(String) });
    expect(files[1].content).toBeUndefined();
    expect(files[1].diff).toBeUndefined();
  });
});
