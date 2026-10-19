# Sugo 개발 컨텍스트

> **공통 정책 정본은 이 파일 하나다.** Codex는 `AGENTS.md`를 직접 읽고, Claude Code는 루트
> `CLAUDE.md`의 `@AGENTS.md` import로 같은 내용을 읽는다. 공통 규칙을 두 파일에 복제하지 말 것.

한 git 저장소에 **독립된 두 프로젝트**가 들어 있습니다.

| | 코드 |
|---|---|
| ① Sugo 플러그인 | `sugo/` |
| ② Sugo Console | `dashboard/{backend,frontend}` |

## 세션 시작 시 읽는 순서

1. 설계 근거는 코드와 테스트가 정본이다. 문서로만 지키는 불변식은 `docs/invariants.md`에 있다.

## 핵심 원칙

- 개인 환경 값(계정 이름·URL·토큰·경로)을 소스에 넣지 않는다. 사용자별 값은 `~/.claude/sugo/settings.json`
  같은 opt-in 설정으로만 받는다.
- **게이트(순서강제·자기보고 불신·실행증거 대조)가 이 프로젝트의 정체성 — 절대 약화시키지 말 것.**
- 게이트는 **순수 함수 + 단위테스트**(적대적 입력, mock 없이)로 **먼저 red 확인 후** 구현.

## 대시보드 작업 시 반드시 지킬 것

- **캔버스(Agent Canvas)는 읽기전용 뷰어다.** `nodesDraggable/Connectable/Focusable = false`.
  **드래그 이동·링크 생성을 붙이지 말 것.** 구조 변경은 각각 제자리가 있다 — Spec 편입/분리는
  오른쪽 패널 드롭다운, 폐기·복구는 우클릭과 폐기함, 의존 삭제는 엣지의 ✕, 배치는 dagre 자동.
- **SQLite 통과 ≠ MySQL 통과.** seam은 실제 MySQL로 검증한다(ENUM/JSON/DECIMAL 차이).
- 화면은 `dashboard/e2e`로 **셀프 스크린샷을 찍어 눈으로 대조**한 뒤 "됐다"고 말할 것.

## 로컬 실행 (실제 MySQL)

```powershell
# Windows
cd <저장소 경로>\dashboard
.\dev-mysql.ps1
```

```bash
# mac / 리눅스 — 같은 일을 하는 대응판(포트·순서·기본값 동일)
cd <저장소 경로>/dashboard
./dev-mysql.sh
# MySQL 위치가 다르면: MYSQLD_BIN=/opt/homebrew/opt/mysql/bin/mysqld ./dev-mysql.sh
```

둘 다 → http://localhost:4173/dev-login.html

⚠️ `vite build`가 `dist/`를 비우면서 `dev-login.html`까지 지운다. **빌드 → 시드** 순서 필수
(스크립트는 지키고 있음). 프론트를 따로 빌드했다면 `dashboard/backend`에서 시드를 다시 돌릴 것.

## 콜드 환경 검증

```bash
cd sugo && npm run build && npm run release-verify
```

마켓플레이스가 주는 것만(= `node_modules` 없이) 빈 HOME + 대시보드/DB 미설정으로 띄워
실제 MCP 프로토콜로 핵심 기능을 검증한다. 매 릴리스는 짧은 설치·멱등·제거 대칭성 core를 돌리고,
patch가 10의 배수인 버전(새 minor의 `.0` 포함)은 전체 파이프라인·온톨로지 full까지 자동 실행한다.
**새 머신에 처음 깔 때도 이 명령을 먼저 돌릴 것.** 단위테스트가 못 잡는 "배포 형태"의 문제를 잡는
자리다. full을 강제로 돌릴 때는 `npm run cold-smoke:full`을 쓴다.

## 크로스플랫폼 규칙

플러그인은 **배포 대상**이라 Windows·mac·리눅스에서 똑같이 돌아야 한다. 한 플랫폼에서만
개발하면 다른 플랫폼 전용 실패는 재현되지 않는다 — 아래를 지키는 것으로 대신한다.

- **경로가 될 사용자 텍스트는 `toNfc()`를 먼저 통과시킬 것**(`sugo/src/unicodeName.ts`).
  mac발 조합형 한글(NFD)은 `가-힣`에 안 걸려 슬러그가 통째로 붕괴하고, 서로 다른 기능이
  **같은 디렉터리에서 PRD를 덮어쓴다.** 에러 없이 조용히 일어난다.
- **`relative()` 결과를 출력에 실을 땐 POSIX 구분자로 통일**할 것(플랫폼 구분자를 쓴다).
- **`process.platform` 분기를 새로 만들지 말 것.** 꼭 필요하면 주입 가능하게 만들고
  양쪽 분기를 다 테스트할 것 — `stackDetector`가 그 형태다(회귀 가드가 그 파일만 허용).
- 드라이브 문자 절대경로를 `src/`·`hooks/`에 하드코딩 금지.
- 위 세 가지는 `sugo/test/crossPlatform.test.ts`가 강제한다.

## 커밋 규칙

- `git add`와 `git commit`은 **반드시 분리**한다.
- `cd X && git ...` 체이닝 금지 — 권한 프롬프트를 유발한다.

## 릴리스 규칙 — Console과 Plugin 공통

**사용자에게 보이는 동작을 바꾼 작업은 버전 갱신·빌드·테스트·커밋·push까지가 한 작업이다.**
코드만 push하고 버전을 그대로 두지 않는다. 두 제품은 독립 배포물이므로 손댄 쪽만 올린다.

- `dashboard/`의 frontend/backend 기능·UI·API·DB 동작 변경 → **Console 버전**을 올린다.
- `sugo/`의 명령·MCP·hook·agent·skill·배포 번들 변경 → **Plugin 버전**을 올린다.
- 양쪽을 모두 변경 → Console과 Plugin 버전을 각각 판정하고 둘 다 올린다.
- 문서·테스트·주석만 바뀌고 배포 동작이 동일하면 버전을 올리지 않아도 된다.
- SemVer 기준: 호환 버그/UI 수정은 patch, 호환 기능 추가는 minor, 비호환 계약 변경은 major.
- 커밋 직전 `git diff --cached --name-only`로 변경 영역과 버전 파일 포함 여부를 다시 확인한다.

### Console 릴리스 규칙

`dashboard/frontend/package.json`과 `dashboard/backend/package.json`은 같은 Console 버전을 사용한다.
각 package의 `package-lock.json`도 `npm version <version> --no-git-tag-version`으로 함께 갱신한다.
화면의 `Console v...`는 frontend package version을 Vite가 `__DASHBOARD_VERSION__`으로 빌드할 때
주입하므로 **버전 변경 후 frontend 재빌드가 필수**다.

```
dashboard/frontend: npm version <version> --no-git-tag-version
dashboard/backend:  npm version <version> --no-git-tag-version
dashboard/frontend: npm run build && npx vitest run
dashboard/backend:  npm run build && npm test
git add / git commit (분리) / git push
로컬 확인이 필요하면 대시보드를 재시작하고 헤더의 Console 버전을 확인
```

### Plugin 릴리스 규칙 — 플러그인 작업을 끝냈으면 반드시

**`sugo/` 코드를 고쳤으면 버전을 올리고 빌드해서 push하는 것까지가 한 작업이다.** 여기서 멈추면
커밋은 됐는데 설치본은 옛 번들 그대로다 — 고친 게 아무 데도 반영되지 않는다.

**버전 문자열이 `claude plugin update`의 유일한 갱신 신호다.** 같은 버전으로 내용만 push하면
`already at the latest version (x.y.z)`로 건너뛴다.

```
sugo/package.json 의 version만 올린다   ← 정본. 다른 3파일은 절대 손으로 고치지 않는다
npm run build:dashboard                ← Console을 바꿨으면 먼저: 백엔드 번들+프론트 정적 빌드를
                                          sugo/dashboard-runtime/에 만든다(플러그인에 실려 가는 파일)
npm run build                          ← prebuild(syncVersion.mjs)가 plugin.json·
                                          package-lock.json(2곳)·marketplace.json 전파
                                          + __SUGO_VERSION__ 빌드타임 상수 주입
npm test                               ← syncVersion.files.test.ts가 4파일+dist 정합성 검사
npm run release-verify                 ← 매번 core, 10번째 patch/minor .0에는 core+full
git add / git commit (분리) / push      ← dist/*.mjs와 dashboard-runtime/도 함께 스테이징
claude plugin update sugo@sugo-marketplace
/reload-plugins                        ← 전체 재시작 불필요
```

- **4파일 하드 규칙**: `package.json`이 정본이고 나머지가 따라간다. 하위 파일을 손으로
  고치면 4파일이 갈라지고, 재빌드를 빼면 `sugo_version`이 거짓 버전을 보고한다 — 버전은 `build.mjs`가 `pkg.version`을 esbuild define으로 주입하는 빌드타임 상수다.
- `harness-library/`·`commands/`·`agents/`·`skills/`의 `.md`는 런타임에 디스크에서 읽으므로
  **내용 자체는** 빌드 없이 반영된다. 하지만 **릴리스에는 항상 `npm run build`가 필요하다** —
  버전 상수가 번들에 박히므로, `.md`만 고친 릴리스도 재빌드를 빼면 `sugo_version`이 옛 값을
  보고한다. `syncVersion.files.test.ts`가 이 불일치를 잡는다.
- 설치본은 버전별 디렉터리로 쌓이고 구버전은 지워지지 않는다
  (`~/.claude/plugins/cache/sugo-marketplace/sugo/<버전>/`).

## 설치하기

마켓플레이스 매니페스트는 **`.claude-plugin/marketplace.json`**에 있어야 한다. 저장소 루트에
두면 `Marketplace file not found`로 등록 자체가 실패한다.

```bash
claude plugin marketplace add kim-svadoz/sugo   # 또는 로컬 경로
claude plugin install sugo@sugo-marketplace
```

설치 후 `dist/`가 그대로 실려 오므로 별도 빌드는 필요 없다. 대시보드나 DB 없이도 전 기능이
동작한다(`npm run cold-smoke`로 검증).

`claude plugin details sugo`의 `MCP servers (0)` 표기는 **집계를 안 하는 것**이지 미로딩이
아니다. `.mcp.json`으로 선언해도 똑같이 0으로 나온다.

## 미해결 (사용자가 먼저 꺼내기 전엔 제안만)

- `dashboard/backend/.env.example`의 시크릿 칸은 비워 둔다(커밋 이력에도 값 없음). 실제 값은 커밋하지
  않는 `.env`에만 둔다.
- `/sugo:commit` 원격 저장소 연동, 원격 MySQL/OIDC/Bitbucket 구성 검증.

<!-- sugo:project-context:start -->
<!-- 이 블록은 sugo가 자동 관리합니다. 손으로 고치면 다음 sugo_add/sugo_update 때 덮어써집니다. -->
## Sugo 프로젝트 컨텍스트

작업을 계획하거나 파일을 수정하기 전에 작업 대상 프로젝트의 `.claude/rules/` 아래 Markdown 파일을 재귀적으로 확인한다.
이 파일들은 Sugo 하네스와 Dashboard의 도메인 규칙 관리에서 동기화한 체크포인트다.
현재 작업에 적용되는 규칙을 구현·리뷰·검증 판단에 반영하고, 충돌하거나 적용할 수 없으면 결과에 이유를 명시한다.
<!-- sugo:project-context:end -->
