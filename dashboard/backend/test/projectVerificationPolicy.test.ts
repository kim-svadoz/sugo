import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readProjectVerificationPolicy, writeProjectVerificationPolicy } from "../src/services/projectVerificationPolicy.js";

describe("project verification policy", () => {
  it("config의 다른 값을 보존하며 integration gate만 변경한다", async () => {
    const project = await mkdtemp(join(tmpdir(), "sugo-project-policy-"));
    await mkdir(join(project, "sugo"));
    await writeFile(join(project, "sugo", "config.json"), JSON.stringify({ version: "0.1.0", projectName: "demo", verificationPolicy: { contractEvidenceRequired: true } }));

    expect(await readProjectVerificationPolicy(project)).toEqual({ integrationGateEnforced: false });
    await writeProjectVerificationPolicy(project, true);
    const saved = JSON.parse(await readFile(join(project, "sugo", "config.json"), "utf8"));
    expect(saved.verificationPolicy).toEqual({ contractEvidenceRequired: true, integrationGateEnforced: true });
  });
});
