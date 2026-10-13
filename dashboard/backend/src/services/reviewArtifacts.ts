import { createHash } from "node:crypto";
import type { DbClient } from "../db/client.js";
import { textDiff } from "./textDiff.js";

export interface ReviewArtifactInput {
  workspaceName: string; taskId: string; sessionId: string; patchVersion: number;
  path: string; change: "added" | "modified" | "deleted";
  content?: string; diff?: string; unavailableReason?: string;
}

function artifactId(userId: string, value: ReviewArtifactInput): string {
  return createHash("sha256").update([userId, value.workspaceName, value.taskId, value.sessionId, value.path].join("\0")).digest("hex");
}

export async function saveReviewArtifact(db: DbClient, userId: string, value: ReviewArtifactInput): Promise<void> {
  const id = artifactId(userId, value);
  const now = new Date().toISOString();
  const found = await db.query<{ artifact_id: string }>("SELECT artifact_id FROM sugo_review_artifacts WHERE artifact_id = ?", [id]);
  const params = [value.patchVersion, value.change, value.content ?? null, value.diff ?? null, value.unavailableReason ?? null, now, id];
  if (found.length) {
    await db.exec("UPDATE sugo_review_artifacts SET patch_version=?, change_type=?, content=?, diff_text=?, unavailable_reason=?, updated_at=? WHERE artifact_id=?", params);
    return;
  }
  await db.exec(
    "INSERT INTO sugo_review_artifacts (artifact_id,user_id,workspace_name,task_id,session_id,patch_version,file_path,change_type,content,diff_text,unavailable_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, value.workspaceName, value.taskId, value.sessionId, value.patchVersion, value.path, value.change, value.content ?? null, value.diff ?? null, value.unavailableReason ?? null, now, now],
  );
}

export async function readReviewArtifact(db: DbClient, userId: string, workspaceName: string, taskId: string, filePath: string, sessionId?: string, patchVersion?: number) {
  const clauses = ["user_id=?", "workspace_name=?", "task_id=?", "file_path=?"];
  const params: unknown[] = [userId, workspaceName, taskId, filePath];
  if (sessionId) { clauses.push("session_id=?"); params.push(sessionId); }
  else if (patchVersion !== undefined) { clauses.push("patch_version=?"); params.push(patchVersion); }
  const artifact = (await db.query<Record<string, unknown>>(
    `SELECT file_path AS path, change_type AS changeType, content, diff_text AS diff, unavailable_reason AS unavailableReason, patch_version AS patchVersion FROM sugo_review_artifacts WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`, params,
  ))[0] ?? null;
  if (!artifact || artifact.changeType !== "modified" || typeof artifact.content !== "string" || typeof artifact.diff === "string" && artifact.diff.trim()) return artifact;
  const previous = (await db.query<{ content: string | null }>(
    "SELECT content FROM sugo_review_artifacts WHERE user_id=? AND workspace_name=? AND task_id=? AND file_path=? AND patch_version<? AND content IS NOT NULL ORDER BY patch_version DESC, updated_at DESC LIMIT 1",
    [userId, workspaceName, taskId, filePath, Number(artifact.patchVersion)],
  ))[0];
  if (previous?.content == null) {
    return {
      ...artifact,
      unavailableReason: artifact.unavailableReason
        ?? "비교할 이전 차수의 본문이 없어 diff를 만들 수 없습니다.",
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
