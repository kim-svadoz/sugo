import { describe, expect, it } from "vitest";
import { computeCompletionGrade, labelId, supersedePriorTestLabels, type BypassLabel } from "../src/labelGuard.js";
const labels: BypassLabel[] = ["evidenceResnapshot", "abandonedChain"].map((kind, i) => ({ kind: kind as BypassLabel["kind"], reason: `original ${i}`, patchVersion: 0, recordedAt: `2026-10-02T00:00:0${i}Z`, implementationCycle: 0 }));
describe("human completion and implementation cycles", () => {
  it("requires every active label, preserves originals, and revoke downgrades", () => {
    const events = labels.map(l => ({ labelId: labelId(l), action: "approve" as const, userId: "human", at: "2026-10-06T00:00:00Z", reason: "reviewed", kind: l.kind, originalReason: l.reason, workResultPath: "/result.md" }));
    expect(computeCompletionGrade(labels, 0, events.slice(0, 1)).grade).toBe("unverified");
    expect(computeCompletionGrade(labels, 0, events).grade).toBe("verified_by_human");
    expect(computeCompletionGrade(labels, 0, [...events, { ...events[0], action: "revoke" }]).grade).toBe("unverified");
    expect(computeCompletionGrade(labels, 0, [{ ...events[0], reason: " " }, events[1]]).grade).toBe("unverified");
  });
  it("only retires evidenceResnapshot after fresh clean execution in a later cycle", () => {
    expect(supersedePriorTestLabels(labels, 1, false, "now")).toEqual(labels);
    const updated = supersedePriorTestLabels(labels, 1, true, "now");
    expect(updated[0].supersededAt).toBe("now");
    expect(updated[1].supersededAt).toBeUndefined();
    expect(computeCompletionGrade([{ ...updated[1], supersededAt: "now", supersededByCycle: 1 }], 0).grade).toBe("unverified");
    expect(computeCompletionGrade(updated.slice(0, 1), 0).grade).toBe("verified");
    expect(updated[0].reason).toBe(labels[0].reason);
  });
});
