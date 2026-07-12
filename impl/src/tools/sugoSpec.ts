import { z } from "zod";
import { addSpec, getSpec, listSpecs } from "../hulk/spec.js";

const SPEC_TYPES = ["architecture", "api-design", "business-rule", "data-model", "flow", "other"] as const;

export const sugoSpecInputSchema = {
  action: z.enum(["add", "list", "get"]),
  workspace: z.string().describe("HULK 워크스페이스 이름"),
  name: z.string().optional().describe("add/get action에 필요"),
  type: z.enum(SPEC_TYPES).optional().describe("add action에 필요"),
  tags: z.array(z.string()).optional(),
  content: z.string().optional().describe("add action에 필요"),
};

const SugoSpecArgs = z.object(sugoSpecInputSchema);

export async function handleSugoSpec(rawArgs: unknown) {
  const args = SugoSpecArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.name || !args.type || !args.content) {
        return errorResult("NAME_TYPE_CONTENT_REQUIRED", "add action에는 name, type, content가 필요합니다.");
      }
      const spec = await addSpec(args.workspace, { name: args.name, type: args.type, tags: args.tags, content: args.content });
      return ok({ spec });
    }
    case "list": {
      const specs = await listSpecs(args.workspace);
      return ok({ specs });
    }
    case "get": {
      if (!args.name) return errorResult("NAME_REQUIRED", "get action에는 name이 필요합니다.");
      const spec = await getSpec(args.workspace, args.name);
      if (!spec) return errorResult("SPEC_NOT_FOUND", `스펙을 찾을 수 없습니다: ${args.name}`);
      return ok({ spec });
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
