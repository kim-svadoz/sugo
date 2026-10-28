import { execFile } from "node:child_process";
import { platform as currentPlatform } from "node:os";
import { promisify } from "node:util";

type CommandRunner = (file: string, args: string[]) => Promise<{ stdout: string }>;
const runFile = promisify(execFile) as CommandRunner;

const macScript = 'POSIX path of (choose folder with prompt "Sugo에 등록할 프로젝트 폴더를 선택하세요")';
const windowsScript = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = 'Sugo에 등록할 프로젝트 폴더를 선택하세요'",
  "$dialog.ShowNewFolderButton = $false",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }",
].join("; ");

export function supportsNativeDirectoryPicker(platform = currentPlatform()): boolean {
  return platform === "darwin" || platform === "win32";
}

export async function selectNativeDirectory(platform = currentPlatform(), run: CommandRunner = runFile): Promise<string | undefined> {
  try {
    const result = platform === "darwin"
      ? await run("osascript", ["-e", macScript])
      : platform === "win32"
        ? await run("powershell.exe", ["-NoProfile", "-STA", "-Command", windowsScript])
        : undefined;
    const selected = result?.stdout.trim();
    return selected || undefined;
  } catch (error) {
    const exitCode = (error as { code?: unknown }).code;
    if (exitCode === 1 || exitCode === "1") return undefined;
    throw error;
  }
}
