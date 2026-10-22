export interface TechnicalIdentifierPart {
  text: string;
  code: boolean;
}

// UI 문장에 등장한 영문을 전부 코드처럼 칠하지 않는다. 소스에서 식별자로 읽히는
// 형태(메서드 호출, snake_case, PascalCase, camelCase)만 코드 토큰으로 구분한다.
const SOURCE_IDENTIFIER = /(?:\b[a-z][A-Za-z0-9]*\([^)]*\)|\b(?:[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*)+|[a-z]+(?:[A-Z][A-Za-z0-9]*)+)\b)/g;

export function technicalIdentifierParts(value: string): TechnicalIdentifierPart[] {
  const parts: TechnicalIdentifierPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(SOURCE_IDENTIFIER)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: value.slice(cursor, index), code: false });
    parts.push({ text: match[0], code: true });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), code: false });
  return parts;
}
