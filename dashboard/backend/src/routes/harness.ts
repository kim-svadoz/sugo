import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireUser } from "../auth/requireUser.js";
import type { DbClient } from "../db/client.js";

// Harness (PUBLIC): 빌드타임에 구운 파일을 서빙. harnessPath가 미설정/부재면 빈
// 매니페스트나 404로 안전 반환한다("실데이터만" — 없는 걸 지어내지 않는다).
// 경로 traversal 방지: 요청 세그먼트를 정규화해 baseDir 밖으로 못 나가게 막는다.
export function createHarnessRouter(harnessPath: string, overridePath = "", db?: DbClient, sessionSecret = ""): Router {
  const router = Router();

  router.get("/manifest", (_req, res) => {
    if (!harnessPath || !existsSync(harnessPath)) return res.json({ harnesses: [] });
    if (existsSync(join(harnessPath, "manifest.json"))) {
      return res.type("application/json").send(readFileSync(join(harnessPath, "manifest.json"), "utf8"));
    }
    const harnesses: Array<{ id: string; name: string; version?: string }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "harness.md") {
          const id = relative(harnessPath, dir).replace(/\\/g, "/") || "default";
          const last = id.split("/").at(-1) ?? id;
          harnesses.push({ id, name: id, ...(/^[0-9]+\.x$/.test(last) ? { version: last } : {}) });
        }
      }
    };
    walk(harnessPath);
    harnesses.sort((a, b) => a.id.localeCompare(b.id));
    return res.json({ harnesses });
  });

  router.get("/unified", (_req, res) => {
    const top = harnessPath ? join(harnessPath, "harness.md") : "";
    if (top && existsSync(top)) return res.type("text/markdown").send(readFileSync(top, "utf8"));
    // 톱레벨 harness.md가 없으면 하위의 harness.md를 전부 이어붙인다(플러그인 harness-library 레이아웃).
    if (harnessPath && existsSync(harnessPath)) {
      const parts: string[] = [];
      const walk = (dir: string) => {
        for (const d of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, d.name);
          if (d.isDirectory()) walk(full);
          else if (d.name === "harness.md") {
            const rel = relative(harnessPath, dir).replace(/\\/g, "/") || "default";
            parts.push(`## ${rel}\n\n${readFileSync(full, "utf8")}`);
          }
        }
      };
      try {
        walk(harnessPath);
      } catch {
        /* ignore */
      }
      if (parts.length) return res.type("text/markdown").send("# 통합 하네스\n\n" + parts.join("\n\n---\n\n"));
    }
    res.type("text/markdown").send("");
  });

  router.get("/content", (req, res) => {
    if (!harnessPath) return res.status(404).json({ error: "harness_not_configured" });
    const id = String(req.query.id ?? "");
    const rel = normalize(join(id, "harness.md"));
    const full = join(harnessPath, rel);
    const insideBase = relative(harnessPath, full);
    if (!id || insideBase.startsWith("..") || insideBase.includes("..")) {
      return res.status(400).json({ error: "invalid_path" });
    }
    if (!existsSync(full)) return res.status(404).json({ error: "not_found" });
    const override = overridePath ? join(overridePath, rel) : "";
    return res.type("text/markdown").send(readFileSync(override && existsSync(override) ? override : full, "utf8"));
  });

  router.get("/source", (req, res) => {
    const id = String(req.query.id ?? "");
    const rel = normalize(join(id, "harness.md"));
    const base = join(harnessPath, rel);
    const inside = relative(harnessPath, base);
    if (!id || inside.startsWith("..") || inside.includes("..")) return res.status(400).json({ error: "invalid_path" });
    if (!existsSync(base)) return res.status(404).json({ error: "not_found" });
    const override = overridePath ? join(overridePath, rel) : "";
    const customized = Boolean(override && existsSync(override));
    return res.json({ content: readFileSync(customized ? override : base, "utf8"), customized });
  });

  router.put("/override", ...(db ? [requireUser(db, sessionSecret)] : []), (req, res) => {
    const id = String(req.body?.id ?? "");
    const content = String(req.body?.content ?? "");
    const rel = normalize(join(id, "harness.md"));
    const base = join(harnessPath, rel);
    const target = join(overridePath, rel);
    if (!id || !overridePath || relative(harnessPath, base).startsWith("..") || relative(overridePath, target).startsWith("..")) return res.status(400).json({ error: "invalid_path" });
    if (!existsSync(base)) return res.status(404).json({ error: "not_found" });
    if (!content.trim() || Buffer.byteLength(content) > 1024 * 1024) return res.status(400).json({ error: "invalid_content" });
    mkdirSync(join(overridePath, id), { recursive: true });
    writeFileSync(target, content, "utf8");
    return res.json({ ok: true, customized: true });
  });

  router.delete("/override", ...(db ? [requireUser(db, sessionSecret)] : []), (req, res) => {
    const id = String(req.query.id ?? "");
    const target = join(overridePath, normalize(join(id, "harness.md")));
    if (!id || !overridePath || relative(overridePath, target).startsWith("..")) return res.status(400).json({ error: "invalid_path" });
    rmSync(target, { force: true });
    return res.json({ ok: true, customized: false });
  });

  router.get(
    "/:domain/:category/:tech/:version",
    asyncHandler(async (req, res) => {
      if (!harnessPath) return res.status(404).json({ error: "harness_not_configured" });
      const { domain, category, tech, version } = req.params;
      const rel = normalize(join(domain, category, tech, version, "harness.md"));
      if (rel.startsWith("..")) return res.status(400).json({ error: "invalid_path" });
      const full = join(harnessPath, rel);
      if (!existsSync(full)) return res.status(404).json({ error: "not_found" });
      res.type("text/markdown").send(readFileSync(full, "utf8"));
    }),
  );

  return router;
}

// Skills (PUBLIC): 에이전트/스킬 프롬프트 파일 서빙. 동일 원칙(미설정이면 빈 목록).
export function createSkillsRouter(skillsPath: string): Router {
  const router = Router();

  router.get("/", (req, res) => {
    if (!skillsPath || !existsSync(skillsPath)) return res.json({ skills: [] });
    const localized = req.query.locale === "ko";
    const out: Array<{ name: string; agent: string | null; description: string; kind: "skill" | "command"; command: boolean }> = [];
    // 플러그인 레이아웃: skills/<name>/SKILL.md (서브디렉터리)
    const skillsDir = join(skillsPath, "skills");
    if (existsSync(skillsDir)) {
      for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
        if (d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md"))) {
          const text = readFileSync(join(skillsDir, d.name, "SKILL.md"), "utf8");
          const displayText = localized ? localizedText(skillsPath, "skill", d.name) ?? text : text;
          out.push({ name: d.name, agent: frontmatterValue(text, "agent"), description: frontmatterValue(displayText, "description") ?? "", kind: "skill", command: false });
        }
      }
    }
    // commands/*.md 도 스킬(슬래시 커맨드)로 노출
    const cmdDir = join(skillsPath, "commands");
    if (existsSync(cmdDir)) {
      for (const d of readdirSync(cmdDir, { withFileTypes: true })) {
        if (d.isFile() && d.name.endsWith(".md")) {
          const name = d.name.replace(/\.md$/, "");
          const text = readFileSync(join(cmdDir, d.name), "utf8");
          const displayText = localized ? localizedText(skillsPath, "command", name) ?? text : text;
          out.push({ name, agent: frontmatterValue(text, "agent"), description: frontmatterValue(displayText, "description") ?? "", kind: "command", command: true });
        }
      }
    }
    // 폴백: skillsPath 바로 아래 flat .md
    if (out.length === 0) {
      for (const d of readdirSync(skillsPath, { withFileTypes: true })) {
        if (d.isFile() && d.name.endsWith(".md")) {
          const name = d.name.replace(/\.md$/, "");
          const text = readFileSync(join(skillsPath, d.name), "utf8");
          out.push({ name, agent: frontmatterValue(text, "agent"), description: frontmatterValue(text, "description") ?? "", kind: "skill", command: false });
        }
      }
    }
    // SkillList는 `{name, agent}`로 에이전트별 필터링을 한다. 플러그인 레이아웃엔
    // 스킬→에이전트 소속이 디렉터리에 안 드러나므로 SKILL.md frontmatter의 `agent:`를 읽는다.
    // 없으면 null — 추측해서 붙이면 잘못된 에이전트 밑에 스킬이 걸린다.
    res.json({ skills: out.sort((a, b) => a.name.localeCompare(b.name) || (a.kind === "skill" ? -1 : 1)) });
  });

  router.get("/agents", (_req, res) => {
    const agentsDir = skillsPath ? join(skillsPath, "agents") : "";
    if (!agentsDir || !existsSync(agentsDir)) return res.json({ agents: [] });
    // 플러그인 에이전트는 파일(agents/*.md). 디렉터리 레이아웃도 함께 허용.
    const agents = readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => (d.isFile() && d.name.endsWith(".md")) || d.isDirectory())
      .map((d) => d.name.replace(/\.md$/, ""));
    // 에이전트 카드는 name/description을 쓴다. 파일 frontmatter에서 읽고,
    // 없으면 id를 그대로 name으로 둔다(설명을 지어내지 않는다).
    res.json({ agents: agents.map((id) => ({ id, ...readAgentMeta(agentsDir, id) })) });
  });

  router.get("/:name", (req, res) => {
    if (!skillsPath || !/^[a-zA-Z0-9_-]+$/.test(req.params.name)) return res.status(404).json({ error: "not_found" });
    const kind = req.query.kind;
    if (kind !== "skill" && kind !== "command") return res.status(400).json({ error: "invalid_kind" });
    const candidates = kind === "command"
      ? [join(skillsPath, "commands", req.params.name + ".md")]
      : [join(skillsPath, "skills", req.params.name, "SKILL.md"), join(skillsPath, req.params.name + ".md")];
    if (req.query.locale === "ko") {
      const localized = localizedText(skillsPath, kind, req.params.name);
      if (localized) return res.type("text/markdown").send(localized);
    }
    for (const candidate of candidates) if (existsSync(candidate)) return res.type("text/markdown").send(readFileSync(candidate, "utf8"));
    return res.status(404).json({ error: "not_found" });
  });

  router.get(
    "/:agent/:skill",
    asyncHandler(async (req, res) => {
      if (!skillsPath) return res.status(404).json({ error: "skills_not_configured" });
      const { agent, skill } = req.params;
      const rel = normalize(join("agents", agent, `${skill}.md`));
      if (rel.startsWith("..")) return res.status(400).json({ error: "invalid_path" });
      const full = join(skillsPath, rel);
      if (!existsSync(full)) return res.status(404).json({ error: "not_found" });
      res.type("text/markdown").send(readFileSync(full, "utf8"));
    }),
  );

  return router;
}

function localizedText(skillsPath: string, kind: "skill" | "command", name: string): string | null {
  const full = kind === "command"
    ? join(skillsPath, "locales", "ko", "commands", name + ".md")
    : join(skillsPath, "locales", "ko", "skills", name, "SKILL.md");
  try {
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}


/** `---` frontmatter에서 키 하나를 뽑는다. 파서를 새로 들이지 않는 최소 구현. */
function frontmatterValue(text: string, key: string): string | null {
  const m = /^---[\r\n]+([\s\S]*?)[\r\n]+---/.exec(text);
  if (!m) return null;
  const line = m[1].split(/[\r\n]+/).find((l) => l.trim().startsWith(key + ":"));
  if (!line) return null;
  return line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "") || null;
}

function readAgentMeta(agentsDir: string, id: string): { name: string; description: string } {
  for (const candidate of [join(agentsDir, id + ".md"), join(agentsDir, id, "AGENT.md")]) {
    try {
      const text = readFileSync(candidate, "utf8");
      return { name: frontmatterValue(text, "name") ?? id, description: frontmatterValue(text, "description") ?? "" };
    } catch {
      /* 다음 후보 */
    }
  }
  return { name: id, description: "" };
}

function readSkillAgent(skillsPath: string, name: string): string | null {
  for (const candidate of [join(skillsPath, "skills", name, "SKILL.md"), join(skillsPath, "commands", name + ".md")]) {
    try {
      return frontmatterValue(readFileSync(candidate, "utf8"), "agent");
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}
