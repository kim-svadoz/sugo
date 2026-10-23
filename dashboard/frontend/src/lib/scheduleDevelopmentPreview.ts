type DevelopmentEntry = { version: number; title: string; summary: string | null };

export function latestDevelopmentPreview(spec: { development_history?: DevelopmentEntry[] }): { label: string; title: string } | null {
  const latest = [...(spec.development_history ?? [])].sort((a, b) => b.version - a.version)[0];
  if (!latest) return null;
  return {
    label: latest.version === 0 ? "FEAT" : `PATCH ${latest.version}`,
    title: latest.title,
  };
}
