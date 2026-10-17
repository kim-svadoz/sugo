import { z } from "zod";
import {
  addCheckpoint,
  getCheckpoint,
  listCheckpoints,
  migrateCheckpoints,
  pullCheckpointsToRules,
  removeCheckpoint,
} from "../work/checkpoint.js";
import { appendMemory, readMemory } from "../work/memory.js";
import { syncCheckpoint } from "../dashboard/sync.js";
import { resolveDashboardConfig } from "../dashboard/config.js";

export const sugoCheckpointInputSchema = {
  action: z.enum(["add", "get", "list", "remove", "memory", "read_memory", "migrate", "sync", "pull"]),
  workspace: z.string().describe("워크스페이스 이름"),
  id: z.string().optional().describe("get/remove/sync action에 필요"),
  title: z.string().optional().describe("add action에 필요"),
  category: z.string().optional(),
  applies_to: z.array(z.string()).optional().describe("빈 배열/미지정이면 보편 체크포인트(항상 적용)"),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("사용자 로컬 날짜 기준으로 이 날짜까지 유효. 다음 날부터 rules 컨텍스트에서 제외"),
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
        expires_at: args.expires_at,
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
      // 대시보드가 설정돼 있지 않으면 syncCheckpoint는 아무것도 보내지 않고 조용히 돌아온다.
      // 그런데도 `synced: true`를 돌려주면 **하지 않은 일을 했다고 보고**하는 게 된다 —
      // DB 없는 콜드 환경에서 실제로 그랬다. 상태를 사실대로 싣는다(pull이 pulledCount: null을
      // 돌려주는 것과 같은 태도).
      const config = await resolveDashboardConfig();
      await syncCheckpoint(args.workspace, checkpoint);
      if (!config.enabled) {
        return ok({
          synced: false,
          dashboard: "disabled",
          note: "대시보드가 설정되지 않아 전송하지 않았습니다. 로컬 체크포인트는 그대로 남아 있습니다.",
        });
      }
      return ok({ synced: true, dashboard: "enabled" });
    }
    case "pull": {
      if (!args.projectPath) return errorResult("PROJECT_PATH_REQUIRED", "pull action에는 projectPath가 필요합니다.");
      const pulledCount = await pullCheckpointsToRules(args.projectPath, args.workspace);
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
