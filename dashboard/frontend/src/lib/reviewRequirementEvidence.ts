export type ReviewRequirementEvidence = { id: string; covered: boolean };

export function isRequirementCovered(
  requirement: { id: string; title: string; status?: string; manual_status?: string | null },
  evidence?: ReviewRequirementEvidence[],
): boolean {
  const id = requirement.id.trim().toLocaleLowerCase();
  const title = requirement.title.trim().toLocaleLowerCase();
  const explicit = evidence?.find((item) => {
    const evidenceId = item.id.trim().toLocaleLowerCase();
    return evidenceId === id
      || evidenceId === title
      || [" ", ".", ":", "-"].some((separator) => title.startsWith(`${evidenceId}${separator}`));
  });
  return explicit?.covered ?? (requirement.manual_status ?? requirement.status) === "done";
}
