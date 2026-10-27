import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// esbuild가 ESM으로 번들할 때 web-tree-sitter(CJS, emscripten 생성 코드)의 동적 require()/
// __dirname 참조를 그대로 못 옮긴다("Dynamic require of X is not supported",
// "__dirname is not defined") — banner로 CJS 전역을 셔밍해서 해결한다. 표준 esbuild 우회책.
const banner = `
import { createRequire as __sugoCreateRequire } from "node:module";
import { fileURLToPath as __sugoFileURLToPath } from "node:url";
import { dirname as __sugoDirname } from "node:path";
const require = __sugoCreateRequire(import.meta.url);
const __filename = __sugoFileURLToPath(import.meta.url);
const __dirname = __sugoDirname(__filename);
`.trim();

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  banner: { js: banner },
  define: { __SUGO_VERSION__: JSON.stringify(pkg.version) },
};

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.bundle.mjs" });
// 세션 시작 훅: 대시보드 서버를 띄운다. 훅은 MCP 번들 전체를 로드하지 않도록 따로 번들한다.
await build({ ...common, entryPoints: ["src/lifecycle/dashboardStartHook.ts"], outfile: "dist/dashboard-start.mjs" });
await build({ ...common, entryPoints: ["src/dashboardRegister.ts"], outfile: "dist/dashboard-register.mjs" });

console.log("빌드 완료: dist/index.bundle.mjs, dist/dashboard-start.mjs, dist/dashboard-register.mjs");
