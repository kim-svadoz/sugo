import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writePrdFile } from "../src/feature.js";
import { detectStack } from "../src/harness/stackDetector.js";
import { slugify } from "../src/work/slug.js";
import { handleSugoOverview } from "../src/tools/sugoOverview.js";

/**
 * 크로스플랫폼 동등성 코퍼스 — "Windows에서 통과 == mac에서 통과"를 호스트 OS와 무관하게 증명한다.
 * 플랫폼 차이가 실제로 존재하는 지점(유니코드 정규화 / 래퍼 명령 / 경로 구분자)만 다룬다.
 */

let tmpDirs: string[] = [];

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function write(dir: string, relPath: string, content: string) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

/**
 * 한글은 완성형(NFC)과 조합형(NFD)이 화면상 구별되지 않는다. macOS 경로에서 조합형이 흘러들어오면
 * 슬러그 화이트리스트 `가-힣`(완성형 전용)에 하나도 안 걸려 이름이 통째로 붕괴한다 — Windows에선
 * 재현되지 않는 mac 전용 사고라 코퍼스로 못박는다.
 */
describe("유니코드 정규화 — mac발 조합형 한글(NFD)", () => {
  it("반드시 허용: NFD 기능명이 NFC와 같은 슬러그를 낸다", () => {
    const nfc = "로그인 기능";
    expect(slugify(nfc.normalize("NFD"))).toBe(slugify(nfc));
    expect(slugify(nfc.normalize("NFD"))).toBe("로그인-기능");
  });

  it("반드시 거부: 서로 다른 NFD 기능명이 같은 슬러그로 붕괴하면 안 된다", () => {
    const a = slugify("회원가입".normalize("NFD"));
    const b = slugify("결제연동".normalize("NFD"));
    expect(a).not.toBe(b);
    expect(a).not.toBe("untitled");
    expect(b).not.toBe("untitled");
  });

  it("영문·혼합 이름은 정규화와 무관하게 기존 동작 그대로", () => {
    expect(slugify("Login API v2")).toBe("login-api-v2");
    expect(slugify("결제 API")).toBe("결제-api");
    expect(slugify("!!!")).toBe("untitled");
  });

  it("writePrdFile: NFD 기능명이 NFC와 같은 디렉터리에 쓰이고 내용이 덮이지 않는다", async () => {
    const project = makeDir("sugo-xplat-prd-");
    const nfc = await writePrdFile(project, "로그인 기능", "# NFC로 쓴 PRD");
    const nfd = await writePrdFile(project, "회원 탈퇴".normalize("NFD"), "# NFD로 쓴 PRD");

    // 서로 다른 기능이므로 서로 다른 디렉터리여야 한다(붕괴하면 같은 경로가 되어 덮어쓴다).
    expect(nfd.prdPath).not.toBe(nfc.prdPath);
    expect(readFileSync(nfc.prdPath, "utf-8")).toBe("# NFC로 쓴 PRD");
    expect(readFileSync(nfd.prdPath, "utf-8")).toBe("# NFD로 쓴 PRD");

    // 디렉터리명이 "feature" 폴백으로 뭉개지지 않았는지 실제 파일시스템으로 확인.
    const dayDir = join(nfc.featurePath, "..");
    const names = (await readdir(dayDir)).map((n) => n.normalize("NFC"));
    expect(names).toContain("로그인-기능");
    expect(names).toContain("회원-탈퇴");
    expect(names).not.toContain("feature");
  });
});

/**
 * 래퍼 명령은 OS에 따라 의도적으로 갈리는 유일한 지점이다. 호스트가 Windows든 mac이든
 * 양쪽 분기를 다 검증한다 — 안 그러면 반대편은 영원히 미검증으로 남는다.
 */
describe("stackDetector — 래퍼 명령의 OS 분기(양쪽 다 검증)", () => {
  it("gradle: mac은 ./gradlew, Windows는 .\\gradlew.bat", () => {
    const dir = makeDir("sugo-xplat-gradle-");
    write(dir, "build.gradle", "plugins { id 'java' }");
    write(dir, "gradlew", "#!/bin/sh");
    write(dir, "gradlew.bat", "@echo off");

    expect(detectStack(dir, "darwin").commands.test).toBe("./gradlew test");
    expect(detectStack(dir, "linux").commands.build).toBe("./gradlew build");
    expect(detectStack(dir, "win32").commands.test).toBe(".\\gradlew.bat test");
  });

  it("maven: mac은 ./mvnw, Windows는 mvnw.cmd", () => {
    const dir = makeDir("sugo-xplat-maven-");
    write(dir, "pom.xml", "<project></project>");
    write(dir, "mvnw", "#!/bin/sh");
    write(dir, "mvnw.cmd", "@echo off");

    expect(detectStack(dir, "darwin").commands.test).toBe("./mvnw test");
    expect(detectStack(dir, "win32").commands.test).toBe("mvnw.cmd test");
  });

  it("래퍼가 없으면 OS와 무관하게 전역 명령으로 동일", () => {
    const dir = makeDir("sugo-xplat-nowrap-");
    write(dir, "build.gradle", "plugins { id 'java' }");
    expect(detectStack(dir, "darwin").commands.test).toBe("gradle test");
    expect(detectStack(dir, "win32").commands.test).toBe("gradle test");
  });

  it("래퍼 명령 외의 감지 결과는 OS가 달라도 완전히 같다", () => {
    const dir = makeDir("sugo-xplat-same-");
    write(dir, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
    write(dir, "tsconfig.json", "{}");
    const mac = detectStack(dir, "darwin");
    const win = detectStack(dir, "win32");
    expect(mac).toEqual(win);
  });
});

/**
 * 회귀 방지 가드. 여기서 잡는 건 "이 PC에서만 되는 코드"가 다시 스며드는 것 하나뿐이라
 * 규칙을 좁게 유지한다 — 넓은 린트는 오탐으로 무력화된다.
 */
describe("이식성 가드 — 배포되는 코드에 이 PC 전용 가정이 없다", () => {
  const roots = ["src", "hooks", "commands", "agents", "skills", "locales", "harness-library", "scripts", ".claude-plugin"];

  async function sourceFiles(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.(ts|mjs|js|md|json)$/.test(e.name)) out.push(full);
      }
    };
    const testDir = dirname(fileURLToPath(import.meta.url));
    for (const r of roots) await walk(join(testDir, "..", r));
    return out;
  }

  /** 주석은 제외한다 — 설명글에 예시 경로를 적는 건 정상이고, 그걸 잡으면 가드가 오탐으로 죽는다. */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
  }

  it("드라이브 문자 절대경로(C:\\… )가 하드코딩돼 있지 않다", async () => {
    const offenders: string[] = [];
    for (const f of await sourceFiles()) {
      if (/["'`][A-Za-z]:[\\/]/.test(stripComments(readFileSync(f, "utf-8")))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("개발자 개인 홈 절대경로가 배포 파일에 하드코딩돼 있지 않다", async () => {
    const offenders: string[] = [];
    for (const f of await sourceFiles()) {
      const source = stripComments(readFileSync(f, "utf-8"));
      if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(source) || /[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+\\\\/.test(source)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("사용자 로컬 날짜를 제품 고정 시간대로 덮어쓰지 않는다", async () => {
    const offenders: string[] = [];
    for (const f of await sourceFiles()) {
      const source = stripComments(readFileSync(f, "utf-8"));
      if (/timeZone\s*:\s*["'`][^"'`]+["'`]|\bKST\b|\b(?:seoul|kst)Day\b|timestamp\s*\+\s*9\s*\*\s*60\s*\*\s*60/i.test(source)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("POSIX 전용 /tmp 경로가 하드코딩돼 있지 않다(os.tmpdir()을 쓸 것)", async () => {
    const offenders: string[] = [];
    for (const f of await sourceFiles()) {
      if (/["'`]\/tmp\//.test(stripComments(readFileSync(f, "utf-8")))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("process.platform 분기는 허용된 한 곳(stackDetector)에만 있다", async () => {
    const offenders: string[] = [];
    for (const f of await sourceFiles()) {
      if (!readFileSync(f, "utf-8").includes("process.platform")) continue;
      if (!f.endsWith(join("harness", "stackDetector.ts"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe("sugo_overview — 경로 출력은 OS와 무관하게 POSIX 구분자", () => {
  it("중첩 디렉터리의 파일도 백슬래시 없이 보고된다", async () => {
    const project = makeDir("sugo-xplat-ov-");
    write(project, join("src", "nested", "deep.ts"), "export const a = 1;\n");

    const result = await handleSugoOverview({ projectPath: project });
    const text = result.content[0].text;

    expect(text).toContain("src/nested/deep.ts");
    expect(text).not.toContain("src\\\\nested");
  });
});
