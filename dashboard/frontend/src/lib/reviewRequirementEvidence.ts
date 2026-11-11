export type ReviewRequirementEvidence = { id: string; covered: boolean };

export type RequirementCoverageState = "covered" | "uncovered" | "unmapped";
export type VerificationEvidenceState = "verified" | "not-run" | "not-recorded";

export function requirementCoverageState(
  requirement: { id: string; title: string; status?: string; manual_status?: string | null },
  evidence?: ReviewRequirementEvidence[],
): RequirementCoverageState {
  const id = requirement.id.trim().toLocaleLowerCase();
  const title = requirement.title.trim().toLocaleLowerCase();
  const explicit = evidence?.find((item) => {
    const evidenceId = item.id.trim().toLocaleLowerCase();
    return evidenceId === id
      || evidenceId === title
      || [" ", ".", ":", "-"].some((separator) => title.startsWith(`${evidenceId}${separator}`));
  });
  if (!explicit) return "unmapped";
  return explicit.covered ? "covered" : "uncovered";
}

export function verificationEvidenceState(value: boolean | undefined): VerificationEvidenceState {
  if (value === undefined) return "not-recorded";
  return value ? "verified" : "not-run";
}
