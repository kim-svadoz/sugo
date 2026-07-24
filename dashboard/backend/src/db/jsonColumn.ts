// mysql2 auto-deserializes MySQL's native JSON column type into a JS
// value (object/array), while node:sqlite returns the TEXT column as a
// raw string - discovered by testing against a real local MySQL instance
// (docs/roadmap-progress.md "재확인 필요" #1). Every JSON-column read has
// to tolerate both shapes; these helpers are the one place that does.

export function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  // Already deserialized by the driver (mysql2 JSON columns).
  return value as T;
}

export function parseJsonArray(value: unknown): string[] {
  const parsed = parseMaybeJson<unknown>(value, []);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}
