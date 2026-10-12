export function taskCycleTitle(seed: string | undefined, fallback: string): string {
  const firstLine = seed?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return fallback;
  const normalized = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  const characters = Array.from(normalized);
  return characters.length > 48 ? `${characters.slice(0, 47).join("")}…` : normalized;
}
