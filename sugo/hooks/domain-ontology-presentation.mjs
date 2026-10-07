// Claude Code PostToolUse presentation policy for domain-ontology-mcp.
//
// The MCP result remains the fact source. This hook only adds a system reminder
// for the next model response, so internal reasoning and tool payloads stay intact.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DOMAIN_ONTOLOGY_TOOL = /^mcp__domain[-_]ontology[-_]mcp__.+$/;

export function isDomainOntologyTool(toolName) {
  return DOMAIN_ONTOLOGY_TOOL.test(String(toolName || ""));
}

export function buildPresentationReminder() {
  return [
    "[Sugo domain-ontology presentation policy]",
    "방금 domain-ontology-mcp가 반환한 값은 사실 원본이다.",
    "이 결과를 내부 분석이나 에이전트 간 작업에 사용할 때는 표현 형식을 제한하지 않는다.",
    "이 결과를 사용자에게 설명하거나 요약하는 문장에는 ste-inspired-ko를 적용한다.",
    "한 문장에는 한 주제 또는 한 행동만 쓴다.",
    "짧은 능동문을 쓰고 같은 개념에는 같은 용어를 쓴다.",
    "가능하면 현재 상태, 근거, 영향, 필요한 행동 순서로 설명한다.",
    "기술 식별자, 수치, 상태, 근거, 불확실성은 원문대로 유지한다.",
    "도구 결과에 없는 인과관계나 결론을 추가하거나 생략하지 마라.",
    "한국어 출력을 ASD-STE100 공식 준수라고 표현하지 마라. ASD-STE100 원칙 기반 한국어라고만 설명한다.",
  ].join("\n");
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve(data);
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    process.exit(0);
  }

  if (!isDomainOntologyTool(input.tool_name)) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: buildPresentationReminder(),
    },
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
