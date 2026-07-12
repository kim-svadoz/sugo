import { z } from "zod";
import { addCheckpoint, listCheckpoints } from "../hulk/checkpoint.js";

export const sugoCheckpointInputSchema = {
  action: z.enum(["add", "list"]),
  workspace: z.string().describe("HULK 워크스페이스 이름"),
  title: z.string().optional().describe("add action에 필요"),
  category: z.string().optional(),
  applies_to: z.array(z.string()).optional().describe("빈 배열/미지정이면 보편 체크포인트(항상 적용)"),
  checklist: z.array(z.string()).optional().describe("add action에 필요"),
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
    case "list": {
      const checkpoints = await listCheckpoints(args.workspace);
      return ok({ checkpoints });
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
