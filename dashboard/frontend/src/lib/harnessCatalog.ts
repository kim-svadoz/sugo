import type { HarnessManifestEntry } from "../api/catalogApi.js";

export interface HarnessTechnology {
  key: string;
  category: string;
  categoryLabel: string;
  technology: string;
  versions: HarnessManifestEntry[];
}

/** 페이지 자체가 이미 Harness 맥락을 제공하므로 본문 H1의 중복 명칭만 걷어낸다.
 * 본문에서 규칙의 의미로 쓰인 "하네스"는 그대로 보존한다. */
export function simplifyHarnessHeading(markdown: string): string {
  return markdown.replace(/^(#\s+.*?)\s+하네스(?=\s*(?:\(|$))/m, "$1");
}

const CATEGORY_LABELS: Record<string, string> = {
  lang: "언어",
  framework: "프레임워크",
  buildtool: "빌드 도구",
  database: "데이터·스토리지",
  datastore: "데이터·스토리지",
  infra: "인프라",
  default: "공통",
};

function parts(entry: HarnessManifestEntry): string[] {
  return String(entry.id ?? "default").split("/").filter(Boolean);
}

export function harnessCategory(entry: HarnessManifestEntry): string {
  return parts(entry)[0] ?? "default";
}

export function harnessCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function harnessTechnologyName(entry: HarnessManifestEntry): string {
  const p = parts(entry);
  return p.length >= 2 ? p[1] : p[0] ?? "default";
}

export function harnessVersion(entry: HarnessManifestEntry): string {
  const p = parts(entry);
  return entry.version ?? (p.length >= 3 ? p.slice(2).join("/") : "공통");
}

export function groupHarnessManifest(manifest: HarnessManifestEntry[]): HarnessTechnology[] {
  const groups = new Map<string, HarnessTechnology>();
  for (const entry of manifest) {
    const category = harnessCategory(entry);
    const technology = harnessTechnologyName(entry);
    const key = `${category}/${technology}`;
    const group = groups.get(key) ?? {
      key,
      category,
      categoryLabel: harnessCategoryLabel(category),
      technology,
      versions: [],
    };
    group.versions.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      versions: group.versions.sort((a, b) => harnessVersion(a).localeCompare(harnessVersion(b), undefined, { numeric: true })),
    }))
    .sort((a, b) => a.technology.localeCompare(b.technology));
}
