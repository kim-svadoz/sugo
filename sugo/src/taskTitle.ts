function prdHeadingTitle(prdContent: string | undefined): string | null {
  const heading = prdContent?.match(/^#\s+PRD(?:\s+patch\s+v\d+)?\s*:\s*(.+)$/im)?.[1]?.trim();
  if (!heading) return null;
  const [, patchSubject] = heading.split(/\s+[—–]\s+/, 2);
  if (patchSubject?.trim()) return patchSubject.trim();
  return heading.replace(/\s+\([^)]*\)\s*$/, "").trim() || null;
}

export function taskCycleTitle(seed: string | undefined, fallback: string, prdContent?: string): string {
  const fromPrd = prdHeadingTitle(prdContent);
  if (fromPrd) return fromPrd;
  const firstLine = seed?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return fallback;
  const normalized = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/^(?:v?\d+\s*(?:차\s*)?patch)\s*[:·-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? normalized;
}
