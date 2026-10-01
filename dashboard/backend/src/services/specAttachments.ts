import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DbClient } from "../db/client.js";

/** Schedule SPEC 카드에 붙여 넣은 기획 화면 이미지. spec-writer가 받아 spec.md 버전 디렉터리로 복사한다. */
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const NAME_PATTERN = /^\d{2}\.(png|jpg|webp|gif)$/;
const MAX_ATTACHMENTS = 20;

type NodeCheck = { ok: true; locked: boolean } | { ok: false; errorCode: "NODE_NOT_FOUND" | "INVALID_LEVEL" };

async function specNode(db: DbClient, userId: string, workspaceName: string, nodeId: string): Promise<NodeCheck> {
  const rows = await db.query<{ level: string }>(
    "SELECT level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId],
  );
  if (rows.length === 0) return { ok: false, errorCode: "NODE_NOT_FOUND" };
  if (rows[0].level !== "spec") return { ok: false, errorCode: "INVALID_LEVEL" };
  const children = await db.query<{ id: string }>(
    "SELECT id FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND parent = ? AND level = 'workstream' LIMIT 1",
    [userId, workspaceName, nodeId],
  );
  return { ok: true, locked: children.length > 0 };
}

// 경로 구성 요소는 인코딩해 디렉터리 탈출을 막는다. 노드 존재는 호출 전에 DB로 확인한다.
function attachmentDir(root: string, userId: string, workspaceName: string, nodeId: string): string {
  return join(root, ...[userId, workspaceName, nodeId].map((part) => encodeURIComponent(part).replace(/^\.+$/, "_")));
}

async function listNames(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names.filter((name) => NAME_PATTERN.test(name)).sort();
}

export type SpecAttachment = { name: string; path: string };

export async function listSpecAttachments(db: DbClient, root: string, userId: string, workspaceName: string, nodeId: string) {
  const node = await specNode(db, userId, workspaceName, nodeId);
  if (!node.ok) return node;
  const dir = attachmentDir(root, userId, workspaceName, nodeId);
  const attachments: SpecAttachment[] = (await listNames(dir)).map((name) => ({ name, path: join(dir, name) }));
  return { ok: true as const, locked: node.locked, attachments };
}

export async function addSpecAttachment(
  db: DbClient, root: string, userId: string, workspaceName: string, nodeId: string, contentType: string, body: Buffer,
) {
  const node = await specNode(db, userId, workspaceName, nodeId);
  if (!node.ok) return node;
  if (node.locked) return { ok: false as const, errorCode: "SPEC_LOCKED_AFTER_FEAT" as const };
  const ext = IMAGE_TYPES[contentType];
  if (!ext || body.length === 0) return { ok: false as const, errorCode: "UNSUPPORTED_IMAGE" as const };
  const dir = attachmentDir(root, userId, workspaceName, nodeId);
  const names = await listNames(dir);
  if (names.length >= MAX_ATTACHMENTS) return { ok: false as const, errorCode: "TOO_MANY_ATTACHMENTS" as const };
  const next = names.reduce((max, name) => Math.max(max, Number(name.slice(0, 2))), 0) + 1;
  const name = `${String(next).padStart(2, "0")}.${ext}`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body, { flag: "wx" });
  return { ok: true as const, name };
}

export async function readSpecAttachment(db: DbClient, root: string, userId: string, workspaceName: string, nodeId: string, name: string) {
  const node = await specNode(db, userId, workspaceName, nodeId);
  if (!node.ok) return node;
  if (!NAME_PATTERN.test(name)) return { ok: false as const, errorCode: "ATTACHMENT_NOT_FOUND" as const };
  const data = await readFile(join(attachmentDir(root, userId, workspaceName, nodeId), name)).catch(() => null);
  if (!data) return { ok: false as const, errorCode: "ATTACHMENT_NOT_FOUND" as const };
  return { ok: true as const, data, ext: name.split(".")[1] };
}

export async function deleteSpecAttachment(db: DbClient, root: string, userId: string, workspaceName: string, nodeId: string, name: string) {
  const node = await specNode(db, userId, workspaceName, nodeId);
  if (!node.ok) return node;
  if (node.locked) return { ok: false as const, errorCode: "SPEC_LOCKED_AFTER_FEAT" as const };
  if (!NAME_PATTERN.test(name)) return { ok: false as const, errorCode: "ATTACHMENT_NOT_FOUND" as const };
  const removed = await unlink(join(attachmentDir(root, userId, workspaceName, nodeId), name)).then(() => true, () => false);
  return removed ? { ok: true as const } : { ok: false as const, errorCode: "ATTACHMENT_NOT_FOUND" as const };
}

/** SPEC 삭제 시 함께 지운다. 첨부는 대시보드 소유이고, spec-writer가 복사한 spec 버전 디렉터리의 이미지는 건드리지 않는다. */
export async function removeSpecAttachments(root: string, userId: string, workspaceName: string, nodeId: string) {
  await rm(attachmentDir(root, userId, workspaceName, nodeId), { recursive: true, force: true });
}
