import { moveSugoProject, removeSugoProject } from "./projectLifecycle.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const input = JSON.parse(await readStdin()) as { action: "remove"; projectPath: string } | { action: "move"; from: string; to: string };
  const result = input.action === "remove" ? await removeSugoProject(input.projectPath)
    : input.action === "move" ? await moveSugoProject(input)
    : (() => { throw Object.assign(new Error("알 수 없는 작업입니다."), { code: "INVALID_ACTION" }); })();
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "PROJECT_MANAGE_FAILED",
  }));
  process.exitCode = 1;
}
