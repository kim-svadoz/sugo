import { createHash } from "node:crypto";
import type { DbClient } from "../db/client.js";
import { textDiff } from "./textDiff.js";

export interface ReviewArtifactInput {
  workspaceName: string; taskId: string; sessionId: string; patchVersion: number; round?: number;
  path: string; change: "added" | "modified" | "deleted";
  content?: string; diff?: string; unavailableReason?: string;
}

function artifactId(userId: string, value: ReviewArtifactInput): string {
  // 1차는 회차가 없던 때와 같은 키를 써서 기존 데이터를 그대로 이어 쓴다.
  const parts = [userId, value.workspaceName, value.taskId, value.sessionId, value.path, ...(value.round && value.round > 1 ? [String(value.round)] : [])];
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

/** 검토 회차 열. 스키마 파일의 CREATE TABLE IF NOT EXISTS는 기존 테이블에 열을 붙이지 못한다. */
export async function ensureReviewArtifactRoundColumn(db: DbClient): Promise<void> {
  try {
    await db.query("SELECT review_round FROM sugo_review_artifacts LIMIT 1");
  } catch {
    await db.exec("ALTER TABLE sugo_review_artifacts ADD COLUMN review_round INTEGER NOT NULL DEFAULT 1");
  }
}

export async function saveReviewArtifact(db: DbClient, userId: string, value: ReviewArtifactInput): Promise<void> {
  const id = artifactId(userId, value);
  const now = new Date().toISOString();
  const found = await db.query<{ artifact_id: string }>("SELECT artifact_id FROM sugo_review_artifacts WHERE artifact_id = ?", [id]);
  const round = value.round ?? 1;
  const params = [value.patchVersion, round, value.change, value.content ?? null, value.diff ?? null, value.unavailableReason ?? null, now, id];
  if (found.length) {
    await db.exec("UPDATE sugo_review_artifacts SET patch_version=?, review_round=?, change_type=?, content=?, diff_text=?, unavailable_reason=?, updated_at=? WHERE artifact_id=?", params);
    return;
  }
  await db.exec(
    "INSERT INTO sugo_review_artifacts (artifact_id,user_id,workspace_name,task_id,session_id,patch_version,review_round,file_path,change_type,content,diff_text,unavailable_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, value.workspaceName, value.taskId, value.sessionId, value.patchVersion, round, value.path, value.change, value.content ?? null, value.diff ?? null, value.unavailableReason ?? null, now, now],
  );
}

export async function readReviewArtifact(db: DbClient, userId: string, workspaceName: string, taskId: string, filePath: string, sessionId?: string, patchVersion?: number, round?: number, compareToPreviousRound = false) {
  const clauses = ["user_id=?", "workspace_name=?", "task_id=?", "file_path=?"];
  const params: unknown[] = [userId, workspaceName, taskId, filePath];
  if (sessionId) { clauses.push("session_id=?"); params.push(sessionId); }
  else if (patchVersion !== undefined) { clauses.push("patch_version=?"); params.push(patchVersion); }
  if (round !== undefined) { clauses.push("review_round=?"); params.push(round); }
  const artifact = (await db.query<Record<string, unknown>>(
    `SELECT file_path AS path, change_type AS changeType, content, diff_text AS diff, unavailable_reason AS unavailableReason, patch_version AS patchVersion, review_round AS round FROM sugo_review_artifacts WHERE ${clauses.join(" AND ")} ORDER BY review_round DESC, updated_at DESC LIMIT 1`, params,
  ))[0] ?? null;
  if (artifact && compareToPreviousRound && Number(artifact.round) > 1 && typeof artifact.content === "string") {
    const previousClauses = [...clauses.filter((clause) => clause !== "review_round=?"), "review_round=?"];
    const previousParams = [...params.slice(0, round !== undefined ? -1 : undefined), Number(artifact.round) - 1];
    const previous = (await db.query<{ content: string | null }>(
      `SELECT content FROM sugo_review_artifacts WHERE ${previousClauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`, previousParams,
    ))[0];
    if (!previous || previous.content == null) return { ...artifact, unavailableReason: "직전 회차에는 이 파일의 변경이 없었습니다. 작업 시작 시점과 비교한 변경을 보여 줍니다." };
    if (previous.content === artifact.content) return { ...artifact, changeType: "unchanged", diff: null, unavailableReason: "직전 회차 이후 이 파일은 바뀌지 않았습니다." };
    return { ...artifact, diff: textDiff(previous.content, artifact.content) };
  }
  if (!artifact || artifact.changeType !== "modified" || typeof artifact.content !== "string" || typeof artifact.diff === "string" && artifact.diff.trim()) return artifact;
  const previous = (await db.query<{ content: string | null }>(
    "SELECT content FROM sugo_review_artifacts WHERE user_id=? AND workspace_name=? AND task_id=? AND file_path=? AND patch_version<? AND content IS NOT NULL ORDER BY patch_version DESC, updated_at DESC LIMIT 1",
    [userId, workspaceName, taskId, filePath, Number(artifact.patchVersion)],
  ))[0];
  if (previous?.content == null) {
    return {
      ...artifact,
      // 오래된 sync 데이터에는 기준 본문이 없을 수 있다. 이때 검토 자체를 막지 말고
      // 현재 스냅샷 전체를 변경 영역으로 보여준다. 다음 차수부터는 저장된 본문끼리 비교된다.
      diff: textDiff("", artifact.content),
      unavailableReason: null,
    };
  }
  if (previous.content === artifact.content) {
    return {
      ...artifact,
      changeType: "unchanged",
      diff: null,
      unavailableReason: "이 patch에서는 파일 내용이 바뀌지 않았습니다.",
    };
  }
  return { ...artifact, diff: textDiff(previous.content, artifact.content) };
}
