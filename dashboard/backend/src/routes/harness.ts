import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";

// §3.7 Harness (PUBLIC): 빌드타임에 구운 파일을 서빙. 로컬 로컬엔 harnessPath가 없으므로
// 미설정/부재면 빈 매니페스트나 404로 안전 반환한다("실데이터만" — 없는 걸 지어내지 않는다).
// 경로 traversal 방지: 요청 세그먼트를 정규화해 baseDir 밖으로 못 나가게 막는다.
export function createHarnessRouter(harnessPath: string): Router {
  const router = Router();

  router.get("/manifest", (_req, res) => {
    if (!harnessPath || !existsSync(join(harnessPath, "manifest.json"))) {
      return res.json({ harnesses: [] });
    }
    res.type("application/json").send(readFileSync(join(harnessPath, "manifest.json"), "utf8"));
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

// §3.7 Skills (PUBLIC): 에이전트/스킬 프롬프트 파일 서빙. 동일 원칙(미설정이면 빈 목록).
export function createSkillsRouter(skillsPath: string): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    if (!skillsPath || !existsSync(skillsPath)) return res.json({ skills: [] });
    const out: string[] = [];
    // 플러그인 레이아웃: skills/<name>/SKILL.md (서브디렉터리)
    const skillsDir = join(skillsPath, "skills");
    if (existsSync(skillsDir)) {
      for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
        if (d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md"))) out.push(d.name);
      }
    }
    // commands/*.md 도 스킬(슬래시 커맨드)로 노출
    const cmdDir = join(skillsPath, "commands");
    if (existsSync(cmdDir)) {
      for (const d of readdirSync(cmdDir, { withFileTypes: true })) {
        if (d.isFile() && d.name.endsWith(".md")) out.push(d.name.replace(/\.md$/, ""));
      }
    }
    // 폴백: skillsPath 바로 아래 flat .md
    if (out.length === 0) {
      for (const d of readdirSync(skillsPath, { withFileTypes: true })) {
        if (d.isFile() && d.name.endsWith(".md")) out.push(d.name.replace(/\.md$/, ""));
      }
    }
    // 설계안 SkillList는 `{name, agent}`로 에이전트별 필터링을 한다. 플러그인 레이아웃엔
    // 스킬→에이전트 소속이 디렉터리에 안 드러나므로 SKILL.md frontmatter의 `agent:`를 읽는다.
    // 없으면 null — 추측해서 붙이면 잘못된 에이전트 밑에 스킬이 걸린다.
    res.json({ skills: out.map((name) => ({ name, agent: readSkillAgent(skillsPath, name) })) });
  });

  router.get("/agents", (_req, res) => {
    const agentsDir = skillsPath ? join(skillsPath, "agents") : "";
    if (!agentsDir || !existsSync(agentsDir)) return res.json({ agents: [] });
    // 플러그인 에이전트는 파일(agents/*.md). 디렉터리 레이아웃도 함께 허용.
    const agents = readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => (d.isFile() && d.name.endsWith(".md")) || d.isDirectory())
      .map((d) => d.name.replace(/\.md$/, ""));
    // 설계안 에이전트 카드는 name/description을 쓴다. 파일 frontmatter에서 읽고,
    // 없으면 id를 그대로 name으로 둔다(설명을 지어내지 않는다).
    res.json({ agents: agents.map((id) => ({ id, ...readAgentMeta(agentsDir, id) })) });
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
