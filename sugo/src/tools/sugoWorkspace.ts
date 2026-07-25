import { z } from "zod";
import { appendMemory, readMemory } from "../hulk/memory.js";
import { ensureWorkspace, listWorkspaces, loadWorkspace } from "../hulk/workspace.js";

export const sugoWorkspaceInputSchema = {
  action: z.enum(["add", "list", "get", "remember", "recall"]),
  name: z.string().optional().describe("add/get/remember/recall action에 필요"),
  projectPath: z.string().optional().describe("add: 이 워크스페이스에 추가로 소속시킬 프로젝트 경로"),
  note: z.string().optional().describe("remember action에 필요"),
};

const SugoWorkspaceArgs = z.object(sugoWorkspaceInputSchema);

export async function handleSugoWorkspace(rawArgs: unknown) {
  const args = SugoWorkspaceArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.name) return errorResult("NAME_REQUIRED", "add action에는 name이 필요합니다.");
      const workspace = await ensureWorkspace(args.name, args.projectPath);
      return ok({ workspace });
    }
    case "list": {
      const workspaces = await listWorkspaces();
      return ok({ workspaces });
    }
    case "get": {
      if (!args.name) return errorResult("NAME_REQUIRED", "get action에는 name이 필요합니다.");
      const workspace = await loadWorkspace(args.name);
      if (!workspace) return errorResult("WORKSPACE_NOT_FOUND", `워크스페이스를 찾을 수 없습니다: ${args.name}`);
      return ok({ workspace });
    }
    case "remember": {
      if (!args.name || !args.note) return errorResult("NAME_AND_NOTE_REQUIRED", "remember action에는 name과 note가 필요합니다.");
      await appendMemory(args.name, args.note);
      return ok({ remembered: true });
    }
    case "recall": {
      if (!args.name) return errorResult("NAME_REQUIRED", "recall action에는 name이 필요합니다.");
      const memory = await readMemory(args.name);
      return ok({ memory });
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
