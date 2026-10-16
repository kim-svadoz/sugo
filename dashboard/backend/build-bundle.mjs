/**
 * 대시보드 배포 번들을 만든다: 백엔드 단일 파일 + 프론트 정적 빌드.
 * 결과는 플러그인에 실리는 `<outDir>/server.mjs`와 `<outDir>/web/`이다.
 * 사용: node build-bundle.mjs <outDir>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const outDir = resolve(process.argv[2] ?? "../../sugo/dashboard-runtime");
const backendDir = fileURLToPath(new URL(".", import.meta.url));
const frontendDir = resolve(backendDir, "../frontend");
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// 번들은 ESM이지만 mysql2 등 CJS 의존성의 동적 require 호출이 남는다.
// __dirname은 앱 모듈이 스스로 선언하므로 여기서 만들면 중복 선언 오류가 난다.
const banner = `
import { createRequire as __dashCreateRequire } from "node:module";
const require = __dashCreateRequire(import.meta.url);
`.trim();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [resolve(backendDir, "src/standalone.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: resolve(outDir, "server.mjs"),
  banner: { js: banner },
  loader: { ".sql": "text" },
  define: { "process.env.DASHBOARD_VERSION": JSON.stringify(pkg.version) },
  // node:sqlite는 내장 모듈이라 번들하지 않는다.
  external: ["node:sqlite"],
});

// 같은 오리진으로 API를 부르고 로컬 로그인을 쓰는 프론트 빌드. 개발용 dist/는 건드리지 않는다.
execFileSync(process.execPath, [resolve(frontendDir, "node_modules/vite/bin/vite.js"), "build", "--outDir", resolve(outDir, "web"), "--emptyOutDir"], {
  cwd: frontendDir,
  env: { ...process.env, VITE_LOCAL_DEV: "true", VITE_API_BASE: "" },
  stdio: "inherit",
});
writeFileSync(resolve(outDir, "runtime.json"), `${JSON.stringify({ consoleVersion: pkg.version })}\n`);
console.log(`대시보드 번들 완료: ${outDir}`);
