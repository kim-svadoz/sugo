import { dump, load } from "js-yaml";

/** checkpoint(.md)/spec(.md) 저장 형식: frontmatter(YAML) + 본문. */
export function stringifyFrontmatter(meta: Record<string, unknown>, body = ""): string {
  const yaml = dump(meta).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}

export function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = (load(match[1]) as Record<string, unknown>) ?? {};
  return { meta, body: match[2].replace(/^\r?\n/, "") };
}
