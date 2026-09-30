import { createHash } from "node:crypto";
import { ALLOWED_ACTIONS_BY_STATE, PREREQUISITES, RESULT_STATE } from "./derive.js";
import { ONTOLOGY } from "./model.js";

/** 응답 필드의 비호환 변경 때만 올린다. */
export const ONTOLOGY_SCHEMA_VERSION = 1 as const;

/** 온톨로지 의미 변경 단위. 모델 변경 시 hash snapshot과 함께 명시적으로 올린다. */
export const ONTOLOGY_REVISION = 1 as const;

export interface OntologyModelIdentity {
  schemaVersion: typeof ONTOLOGY_SCHEMA_VERSION;
  revision: typeof ONTOLOGY_REVISION;
  hashAlgorithm: "sha256";
  modelHash: `sha256:${string}`;
}

/**
 * 객체 key 순서와 무관한 canonical JSON. 배열 순서는 모델 의미이므로 보존한다.
 * 현재 온톨로지는 JSON 값만 허용하며, 지원하지 않는 런타임 값은 조용히 문자열화하지 않고 거부한다.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Ontology hash cannot encode a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new TypeError(`Ontology hash cannot encode ${typeof value}`);
}

export function deterministicModelHash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

const HASHED_MODEL = {
  ontology: ONTOLOGY,
  derived: {
    prerequisites: PREREQUISITES,
    resultState: RESULT_STATE,
    allowedActionsByState: ALLOWED_ACTIONS_BY_STATE,
  },
};

export const ONTOLOGY_MODEL_IDENTITY: OntologyModelIdentity = Object.freeze({
  schemaVersion: ONTOLOGY_SCHEMA_VERSION,
  revision: ONTOLOGY_REVISION,
  hashAlgorithm: "sha256",
  modelHash: deterministicModelHash(HASHED_MODEL),
});
