import { createHash } from "node:crypto";

export type ChangeArea =
  | "console-frontend"
  | "console-backend"
  | "plugin-runtime"
  | "plugin-packaging"
  | "documentation"
  | "tests";

export interface ChangeImpact {
  products: ("console" | "plugin")[];
  areas: ChangeArea[];
  risks: string[];
  sourceFiles: string[];
}

export interface VerificationPlan {
  fingerprint: string;
  level: "targeted" | "full";
  reasons: string[];
  implementationChecks: string[];
  releaseChecks: string[];
  broadCommandsAllowed: boolean;
}

const normalize = (file: string) => file.replace(/\\/g, "/").replace(/^\.\//, "");
const unique = <T>(items: T[]) => [...new Set(items)];

function isTest(file: string): boolean {
  return /(^|\/)(test|tests|__tests__|e2e)(\/|$)|\.(test|spec)\.[^.]+$/.test(file);
}

function isDocumentation(file: string): boolean {
  return /(^|\/)(docs?)(\/|$)|(^|\/)(README|CHANGELOG|AGENTS|CLAUDE)(\.|$)/i.test(file) || file.endsWith(".md");
}

export function classifyChangeImpact(changedFiles: string[]): ChangeImpact {
  const files = unique(changedFiles.map(normalize)).sort();
  const areas: ChangeArea[] = [];
  const risks: string[] = [];
  const sourceFiles = files.filter((file) => !isTest(file) && !isDocumentation(file));

  for (const file of files) {
    if (isTest(file)) areas.push("tests");
    else if (isDocumentation(file)) areas.push("documentation");
    else if (file.startsWith("dashboard/frontend/")) areas.push("console-frontend");
    else if (file.startsWith("dashboard/backend/")) areas.push("console-backend");
    else if (/^sugo\/(build\.mjs|syncVersion\.mjs|scripts\/|\.claude-plugin\/|package(-lock)?\.json)/.test(file)) areas.push("plugin-packaging");
    else if (file.startsWith("sugo/")) areas.push("plugin-runtime");

    if (/(^|\/)(gate|gates|ontology|testEvidence|verificationPlan)\.[^.]+$/.test(file)) risks.push("gate");
    if (/(^|\/)(db|database|schema|migration|migrations)(\/|\.|$)/i.test(file)) risks.push("persistence");
    if (/(^|\/)(auth|authentication|session)(\/|\.|$)/i.test(file)) risks.push("authentication");
    if (/^sugo\/(build\.mjs|syncVersion\.mjs|scripts\/|\.claude-plugin\/|package(-lock)?\.json)/.test(file)) risks.push("packaging");
  }

  const resolvedAreas = unique(areas);
  const products = unique([
    ...(resolvedAreas.some((area) => area.startsWith("console-")) ? ["console" as const] : []),
    ...(resolvedAreas.some((area) => area.startsWith("plugin-")) ? ["plugin" as const] : []),
  ]);
  if (resolvedAreas.includes("console-frontend") && resolvedAreas.includes("console-backend")) risks.push("coupled-subsystems");

  return { products, areas: resolvedAreas, risks: unique(risks), sourceFiles };
}

export function buildVerificationPlan(impact: ChangeImpact, changeType: "feature" | "bugfix" | "refactor"): VerificationPlan {
  const full = impact.risks.length > 0;
  const implementationChecks: string[] = [];
  if (impact.sourceFiles.length > 0) implementationChecks.push(full ? "full-regression" : "targeted-test");
  if (impact.areas.includes("console-frontend")) implementationChecks.push("frontend-build");
  if (impact.areas.includes("console-backend")) implementationChecks.push("backend-build");
  if (impact.areas.includes("plugin-runtime") || impact.areas.includes("plugin-packaging")) implementationChecks.push("plugin-build");

  const releaseChecks: string[] = [];
  if (impact.products.includes("console")) releaseChecks.push("console-version", "embedded-console-refresh", "dashboard-e2e");
  if (impact.products.includes("plugin")) releaseChecks.push("plugin-version", "cold-smoke-core");

  const fingerprintInput = JSON.stringify({ files: impact.sourceFiles, risks: impact.risks, changeType });
  return {
    fingerprint: createHash("sha256").update(fingerprintInput).digest("hex"),
    level: full ? "full" : "targeted",
    reasons: full ? impact.risks : [impact.sourceFiles.length > 0 ? "isolated-change" : "non-runtime-change"],
    implementationChecks: unique(implementationChecks),
    releaseChecks: unique(releaseChecks),
    broadCommandsAllowed: full,
  };
}

export function isBroadVerificationCommand(command: string): boolean {
  const value = command.trim().toLowerCase();
  if (/^(npm|pnpm|yarn) (run )?test(?:\s+--)?$/.test(value)) return true;
  if (/\bvitest\s+run\s*$/.test(value)) return true;
  if (/\bgradlew?(\.bat)?\s+(clean\s+)?(check|build)\b/.test(value)) return true;
  if (/\bgradlew?(\.bat)?\s+test\b/.test(value) && !/--tests?\b/.test(value)) return true;
  if (/\bmvnw?(\.cmd)?\s+(clean\s+)?(verify|install|test)\b/.test(value)) return true;
  if (/^(python\s+-m\s+)?pytest\s*$/.test(value)) return true;
  if (/\bgo\s+test\s+\.\/\.\.\./.test(value)) return true;
  return false;
}
