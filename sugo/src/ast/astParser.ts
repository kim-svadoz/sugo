import { extname, join } from "node:path";
import Parser from "web-tree-sitter";
import { extractOutline, type OutlineEntry } from "./outline.js";
import { defaultWasmGrammarsDir } from "./wasmGrammarPath.js";

const LANGUAGE_FILE_MAP: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  java: "tree-sitter-java.wasm",
};

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
};

export function detectLanguage(filePath: string): string | null {
  return EXTENSION_LANGUAGE_MAP[extname(filePath)] ?? null;
}

export function supportedLanguages(): string[] {
  return Object.keys(LANGUAGE_FILE_MAP);
}

let initPromise: Promise<void> | null = null;
const languageCache = new Map<string, Parser.Language>();

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    const grammarsDir = defaultWasmGrammarsDir();
    initPromise = Parser.init({
      locateFile: (scriptName: string) => join(grammarsDir, scriptName),
    });
  }
  return initPromise;
}

async function loadLanguage(language: string): Promise<Parser.Language> {
  const cached = languageCache.get(language);
  if (cached) return cached;
  const wasmFile = LANGUAGE_FILE_MAP[language];
  if (!wasmFile) throw new Error(`지원하지 않는 언어: ${language}`);
  const lang = await Parser.Language.load(join(defaultWasmGrammarsDir(), wasmFile));
  languageCache.set(language, lang);
  return lang;
}

export interface FileOutline {
  path: string;
  language: string;
  imports: string[];
  entries: OutlineEntry[];
}

/**
 * web-tree-sitter로 언어별 WASM 파서를 로드해 소스를 구문트리로 파싱하고 클래스·메서드·
 * 함수·import를 추출한다(정규식이 아니라 실제 AST). 지원하지 않는 확장자는 null(스킵, 차단 아님).
 */
export async function parseFileOutline(filePath: string, content: string): Promise<FileOutline | null> {
  const language = detectLanguage(filePath);
  if (!language) return null;
  await ensureInit();
  const lang = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(content);
  if (!tree) return null;
  const { imports, entries } = extractOutline(tree.rootNode, language);
  return { path: filePath, language, imports, entries };
}
