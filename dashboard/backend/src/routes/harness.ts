import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, normalize } from "node:path";
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
    const p = harnessPath ? join(harnessPath, "harness.md") : "";
    if (!p || !existsSync(p)) return res.type("text/markdown").send("");
    res.type("text/markdown").send(readFileSync(p, "utf8"));
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
    const skills = readdirSync(skillsPath, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".md"))
      .map((d) => d.name.replace(/\.md$/, ""));
    res.json({ skills });
  });

  router.get("/agents", (_req, res) => {
    if (!skillsPath || !existsSync(join(skillsPath, "agents"))) return res.json({ agents: [] });
    const agents = readdirSync(join(skillsPath, "agents"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    res.json({ agents });
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
