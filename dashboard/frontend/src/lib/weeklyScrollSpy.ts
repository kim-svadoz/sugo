export interface WeeklySectionBounds {
  id: string;
  top: number;
  bottom: number;
}

export function selectWeeklySection(sections: WeeklySectionBounds[], readingLine: number): string {
  if (sections.length === 0) return "";
  let active = sections[0].id;
  for (const section of sections) {
    if (section.top > readingLine) break;
    active = section.id;
  }
  return active;
}
