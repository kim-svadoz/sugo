#!/usr/bin/env node
// Sugo Weekly 엔진 진입점. Python 3.12 이상을 찾아 이 폴더의 weekly_report 모듈을 실행한다(표준 라이브러리만 쓴다).
// Sugo Console의 예약 실행과 /sugo:weekly가 같은 진입점을 쓴다.
//   node run.mjs build [--week 2026-W42] [--force] [--render-only]
//   node run.mjs repos list
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MODULES = new Set(["build", "repos", "push", "collect"]);
const CANDIDATES = ["python3.14", "python3.13", "python3.12", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "python3", "python"];

const [module, ...args] = process.argv.slice(2);
if (!MODULES.has(module)) {
  console.error(`usage: node run.mjs ${[...MODULES].join("|")} [args]`);
  process.exit(2);
}
const python = CANDIDATES.find((candidate) => spawnSync(candidate, ["-c", "import sys; sys.exit(sys.version_info < (3, 12))"]).status === 0);
if (!python) {
  console.error("Python 3.12 이상이 없다. Python을 설치한 뒤 python3 --version으로 확인한다.");
  process.exit(1);
}
const result = spawnSync(python, ["-m", `weekly_report.${module}`, ...args], { cwd: dirname(fileURLToPath(import.meta.url)), stdio: "inherit" });
process.exit(result.status ?? 1);
