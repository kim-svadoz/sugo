import { z } from "zod";
import {
  addCheckpoint,
  getCheckpoint,
  listCheckpoints,
  migrateCheckpoints,
  pullCheckpointsToRules,
  removeCheckpoint,
} from "../hulk/checkpoint.js";
import { appendMemory, readMemory } from "../hulk/memory.js";
import { syncCheckpoint } from "../dashboard/sync.js";

export const sugoCheckpointInputSchema = {
  action: z.enum(["add", "get", "list", "remove", "memory", "read_memory", "migrate", "sync", "pull"]),
  workspace: z.string().describe("HULK 워크스페이스 이름"),
  id: z.string().optional().describe("get/remove/sync action에 필요"),
  title: z.string().optional().describe("add action에 필요"),
  category: z.string().optional(),
  applies_to: z.array(z.string()).optional().describe("빈 배열/미지정이면 보편 체크포인트(항상 적용)"),
  checklist: z.array(z.string()).optional().describe("add action에 필요"),
  note: z.string().optional().describe("memory action에 필요 — 자유 메모 한 줄/여러 줄"),
  projectPath: z.string().optional().describe("pull action에 필요 — 원격 체크포인트를 .claude/rules/로 기록할 프로젝트"),
};

const SugoCheckpointArgs = z.object(sugoCheckpointInputSchema);

export async function handleSugoCheckpoint(rawArgs: unknown) {
  const args = SugoCheckpointArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.title || !args.checklist || args.checklist.length === 0) {
        return errorResult("TITLE_AND_CHECKLIST_REQUIRED", "add action에는 title과 checklist(1개 이상)가 필요합니다.");
      }
      const checkpoint = await addCheckpoint(args.workspace, {
        title: args.title,
        category: args.category,
        applies_to: args.applies_to,
        checklist: args.checklist,
      });
      return ok({ checkpoint });
    }
    case "get": {
      if (!args.id) return errorResult("ID_REQUIRED", "get action에는 id가 필요합니다.");
      const checkpoint = await getCheckpoint(args.workspace, args.id);
      if (!checkpoint) return errorResult("CHECKPOINT_NOT_FOUND", `체크포인트를 찾을 수 없습니다: ${args.id}`);
      return ok({ checkpoint });
    }
    case "list": {
      const checkpoints = await listCheckpoints(args.workspace);
      return ok({ checkpoints });
    }
    case "remove": {
      if (!args.id) return errorResult("ID_REQUIRED", "remove action에는 id가 필요합니다.");
      const removed = await removeCheckpoint(args.workspace, args.id);
      if (!removed) return errorResult("CHECKPOINT_NOT_FOUND", `체크포인트를 찾을 수 없습니다: ${args.id}`);
      return ok({});
    }
    case "memory": {
      if (!args.note) return errorResult("NOTE_REQUIRED", "memory action에는 note가 필요합니다.");
      await appendMemory(args.workspace, args.note);
      return ok({});
    }
    case "read_memory": {
      const memory = await readMemory(args.workspace);
      return ok({ memory });
    }
    case "migrate": {
      const migratedCount = await migrateCheckpoints(args.workspace);
      return ok({ migratedCount });
    }
    case "sync": {
      if (!args.id) return errorResult("ID_REQUIRED", "sync action에는 id가 필요합니다.");
      const checkpoint = await getCheckpoint(args.workspace, args.id);
      if (!checkpoint) return errorResult("CHECKPOINT_NOT_FOUND", `체크포인트를 찾을 수 없습니다: ${args.id}`);
      await syncCheckpoint(args.workspace, checkpoint);
      return ok({ synced: true });
    }
    case "pull": {
      if (!args.projectPath) return errorResult("PROJECT_PATH_REQUIRED", "pull action에는 projectPath가 필요합니다.");
      const pulledCount = await pullCheckpointsToRules(args.projectPath);
      return ok({ pulledCount });
    }
  }
}

function ok(payload: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...payload }, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
