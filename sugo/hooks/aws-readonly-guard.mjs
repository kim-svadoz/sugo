// Sugo PreToolUse security boundary. Sugo agents consume Dashboard snapshots; they never call AWS directly.
// This denies direct AWS CLI/SDK/endpoint use before Bash runs, keeping credentials and mutations out of the agent loop.

export function awsRisk(command) {
  const value = String(command || "");
  const patterns = [
    /(^|[;&|\s])aws(?:\.exe)?\s/i,
    /amazonaws\.com/i,
    /\bboto3\b|\bbotocore\b/i,
    /@aws-sdk\/|aws-sdk/i,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve(data);
  });
}

async function main() {
  let input;
  try { input = JSON.parse((await readStdin()) || "{}"); } catch { process.exit(0); }
  const command = input?.tool_input?.command ?? input?.tool_input?.cmd ?? "";
  if (!awsRisk(command)) process.exit(0);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "Sugo AWS 경계: 에이전트의 직접 AWS CLI/SDK/endpoint 호출은 금지됩니다. Settings에서 읽기 전용 스냅샷을 동기화한 뒤 sugo_aws_context를 사용하세요.",
  }}));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/aws-readonly-guard.mjs")) main();
