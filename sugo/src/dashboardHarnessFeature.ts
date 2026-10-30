import { setHarnessFeatureEnabled } from "./harness/featureControl.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const input = JSON.parse(await readStdin()) as { enabled: boolean };
  if (typeof input.enabled !== "boolean") throw new Error("enabled 값이 필요합니다.");
  process.stdout.write(JSON.stringify(await setHarnessFeatureEnabled(input.enabled)));
} catch (error) {
  process.stderr.write(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: "HARNESS_FEATURE_UPDATE_FAILED",
  }));
  process.exitCode = 1;
}
