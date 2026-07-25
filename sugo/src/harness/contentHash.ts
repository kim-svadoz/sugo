import { createHash } from "node:crypto";
import type { HarnessContent } from "./types.js";

/** 하네스 콘텐츠(harness.md+validation.yaml)의 sha1 — appliedHarnesses[].contentHash용, 저렴한 변경감지 */
export function hashHarnessContent(harness: HarnessContent): string {
  return createHash("sha1").update(harness.harnessMd).update("\0").update(harness.validationYaml).digest("hex");
}
