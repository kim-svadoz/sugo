import { toNfc } from "../unicodeName.js";

export function slugify(text: string): string {
  return (
    // NFC 합성 먼저 — 아니면 mac발 조합형 한글이 `가-힣`에 안 걸려 전부 "untitled"로 붕괴한다.
    toNfc(text)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}
