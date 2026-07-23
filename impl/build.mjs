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

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.bundle.mjs",
  banner: { js: banner },
  define: { __SUGO_VERSION__: JSON.stringify(pkg.version) },
});

console.log("빌드 완료: dist/index.bundle.mjs");
