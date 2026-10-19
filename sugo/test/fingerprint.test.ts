import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkEvidenceReuseGate,
  computeChangedFilesFingerprint,
  computeFingerprintFromEntries,
} from "../src/fingerprint.js";

describe("computeFingerprintFromEntries", () => {
  it("입력 순서와 무관하게 동일 결과(정렬 후 해시)", () => {
    const a = computeFingerprintFromEntries([
      { relPath: "b.ts", size: 10, mtimeMs: 100 },
      { relPath: "a.ts", size: 5, mtimeMs: 50 },
    ]);
    const b = computeFingerprintFromEntries([
      { relPath: "a.ts", size: 5, mtimeMs: 50 },
      { relPath: "b.ts", size: 10, mtimeMs: 100 },
    ]);
    expect(a).toBe(b);
  });

  it("size/mtimeMs가 다르면 지문도 달라진다", () => {
    const a = computeFingerprintFromEntries([{ relPath: "a.ts", size: 5, mtimeMs: 50 }]);
    const b = computeFingerprintFromEntries([{ relPath: "a.ts", size: 6, mtimeMs: 50 }]);
    expect(a).not.toBe(b);
  });
});

let dirs: string[] = [];
function tmpProject(): string {
  const d = mkdtempSync(join(tmpdir(), "sugo-fp-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("computeChangedFilesFingerprint (실배선)", () => {
  it("파일이 그대로면 지문이 동일하다", async () => {
    const dir = tmpProject();
    writeFileSync(join(dir, "a.ts"), "content");
    const fp1 = await computeChangedFilesFingerprint(dir, ["a.ts"]);
    const fp2 = await computeChangedFilesFingerprint(dir, ["a.ts"]);
    expect(fp1).toBe(fp2);
  });

  it("파일 내용이 바뀌면(size/mtime 변경) 지문이 달라진다", async () => {
    const dir = tmpProject();
    writeFileSync(join(dir, "a.ts"), "content");
    const fp1 = await computeChangedFilesFingerprint(dir, ["a.ts"]);
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(dir, "a.ts"), "different content!!");
    const fp2 = await computeChangedFilesFingerprint(dir, ["a.ts"]);
    expect(fp1).not.toBe(fp2);
  });
});

describe("checkEvidenceReuseGate — 적대적 입력: 반드시 거부", () => {
  it("reusedFromTestDone:true인데 변경파일 지문이 불일치하면 거부한다(리뷰 중 코드 수정)", () => {
    const result = checkEvidenceReuseGate(true, "fp-old", "fp-new", "pass");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("EVIDENCE_REUSE_FINGERPRINT_MISMATCH");
  });

  it("baseline 지문 자체가 없으면 거부한다", () => {
    const result = checkEvidenceReuseGate(true, undefined, "fp-new", "pass");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("EVIDENCE_REUSE_NO_BASELINE");
  });

  it("test_done 증거가 pass가 아니면 거부한다", () => {
    const result = checkEvidenceReuseGate(true, "fp", "fp", "fail");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("EVIDENCE_REUSE_NOT_GREEN");
  });
});

describe("checkEvidenceReuseGate — 반드시 허용", () => {
  it("지문 일치(무변경) + testPassedState=pass면 통과한다", () => {
    expect(checkEvidenceReuseGate(true, "fp-same", "fp-same", "pass").ok).toBe(true);
  });

  it("reusedFromTestDone을 주장하지 않으면 no-op 통과", () => {
    expect(checkEvidenceReuseGate(false, undefined, "anything", null).ok).toBe(true);
  });
});
