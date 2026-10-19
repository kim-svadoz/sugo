import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fail, ok, type GateCheckResult } from "./gates.js";
import type { TestPassedState } from "./testEvidence.js";

export interface FileStatEntry {
  relPath: string;
  size: number;
  mtimeMs: number;
}

/** 대상 파일 `상대경로|size|mtimeMs` 정렬 후 sha1(내용해시 아님, 저렴). 순수 함수. */
export function computeFingerprintFromEntries(entries: FileStatEntry[]): string {
  const parts = entries.map((e) => `${e.relPath}|${e.size}|${e.mtimeMs}`).sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex");
}

/** IO: changedFiles를 실제로 stat해서 지문 계산용 엔트리를 만든다. 파일이 없으면 -1로 표시(그 자체가 변경 신호). */
export async function statChangedFiles(projectPath: string, changedFiles: string[]): Promise<FileStatEntry[]> {
  const entries: FileStatEntry[] = [];
  for (const f of changedFiles) {
    const full = isAbsolute(f) ? f : join(projectPath, f);
    const relPath = isAbsolute(f) ? relative(projectPath, f) : f;
    try {
      const st = await stat(full);
      entries.push({ relPath, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      entries.push({ relPath, size: -1, mtimeMs: -1 });
    }
  }
  return entries;
}

export async function computeChangedFilesFingerprint(projectPath: string, changedFiles: string[]): Promise<string> {
  return computeFingerprintFromEntries(await statChangedFiles(projectPath, changedFiles));
}

/**
 * 이중 실행 제거: test_done에서 기록한 지문과 review_done 시점 지문을 대조한다.
 * reusedFromTestDone을 주장하지 않으면 no-op. 주장했는데 baseline(기록된 지문) 자체가 없거나,
 * test_done 증거가 pass가 아니거나, 지문이 불일치하면(리뷰 중 코드 수정) 거부 — 재실행 요구.
 */
export function checkEvidenceReuseGate(
  reusedFromTestDone: boolean,
  storedFingerprint: string | undefined,
  currentFingerprint: string,
  testPassedState: TestPassedState | null,
): GateCheckResult {
  if (!reusedFromTestDone) return ok();
  if (!storedFingerprint) {
    return fail("EVIDENCE_REUSE_NO_BASELINE", "test_done 시점에 기록된 변경파일 지문이 없어 증거를 재사용할 수 없습니다.");
  }
  if (testPassedState !== "pass") {
    return fail("EVIDENCE_REUSE_NOT_GREEN", "test_done 증거가 pass가 아니어서 재사용할 수 없습니다.");
  }
  if (storedFingerprint !== currentFingerprint) {
    return fail(
      "EVIDENCE_REUSE_FINGERPRINT_MISMATCH",
      "리뷰 중 변경파일이 수정되어 지문이 달라졌습니다 — test_done 증거를 재사용할 수 없으니 재실행이 필요합니다.",
    );
  }
  return ok();
}
