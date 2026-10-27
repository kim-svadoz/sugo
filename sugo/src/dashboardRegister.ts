import { registerSugoProject } from "./projectRegistration.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const input = JSON.parse(await readStdin()) as { projectPath: string; workspace: string };
  process.stdout.write(JSON.stringify(await registerSugoProject(input)));
} catch (error) {
  process.stderr.write(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "PROJECT_REGISTRATION_FAILED",
  }));
  process.exitCode = 1;
}
