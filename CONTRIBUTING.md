# 기여 안내

이 저장소에는 버전을 따로 관리하는 두 제품이 있습니다.

| 제품 | 코드 | 버전 정본 |
| --- | --- | --- |
| Sugo Plugin | `sugo/` | `sugo/package.json` |
| Sugo Console | `dashboard/backend`, `dashboard/frontend` | 두 `package.json`(같은 버전) |

게이트 원칙, 크로스플랫폼 규칙, 릴리스 절차 같은 개발 정책은 [AGENTS.md](AGENTS.md)에 있습니다. 코드를 고치기 전에 읽으세요. 게이트를 약화시키는 변경은 받지 않습니다.

## 구조

```text
.claude-plugin/marketplace.json   마켓플레이스 정의
sugo/                             플러그인: commands, agents, skills, hooks, harness-library, src, test
sugo/dist/                        빌드된 MCP 번들(커밋 대상)
sugo/dashboard-runtime/           플러그인에 실리는 빌드된 Console(커밋 대상)
dashboard/backend/                Express + TypeScript, SQLite 또는 MySQL
dashboard/frontend/               React + Vite + Tailwind + React Flow
dashboard/e2e/                    실제 MySQL·OIDC·브라우저 검증
docs/                             설계 불변식과 계약
```

루트 npm workspace는 없습니다. 각 패키지 디렉터리에서 실행합니다.

| 디렉터리 | 설치 | 검증 |
| --- | --- | --- |
| `sugo/` | `npm ci` | `npm run typecheck`, `npm run build`, `npm test`, `npm run release-verify` |
| `dashboard/backend/` | `npm ci` | `npm run typecheck`, `npm run build`, `npm test` |
| `dashboard/frontend/` | `npm ci` | `npm run typecheck`, `npm run build`, 아래 Vitest 명령 |
| `dashboard/e2e/` | `npm ci` | [dashboard/e2e/README.md](dashboard/e2e/README.md) 참고 |

프론트엔드에는 아직 `test` 스크립트와 Vitest 의존성이 없습니다.

```bash
npm install --no-save --package-lock=false vitest@2.1.9
npx vitest run
```

`npm run release-verify`는 마켓플레이스 설치와 같은 형태(`node_modules` 없음, 빈 HOME)로 플러그인을 띄워 실제 MCP 호출을 검증합니다. 모든 플러그인 릴리스 전과 새 컴퓨터에서 처음 개발할 때 실행합니다.

## 소스에서 Console 실행

포트는 [`dashboard/ports.env`](dashboard/ports.env)에서 정합니다. 포트가 사용 중이면 실행기는 다른 포트로 옮기지 않고 실패합니다.

| 실행기 | 용도 | 주소 |
| --- | --- | --- |
| `bash dashboard/sd.sh` | 현재 소스를 `sugo/dashboard-runtime/`으로 빌드하고, 플러그인이 띄운 Console 대신 백그라운드로 재시작 | `http://localhost:3001` |
| `bash dashboard/dev-local.sh` | 로컬 로그인(`LOCAL_DEV_MODE=1`)으로 API와 Vite UI를 포그라운드 실행. 데모 데이터는 `SUGO_LOCAL_DEMO=1` | UI `:5175`, 로그인 `:3001/api/auth/local` |
| `dashboard/dev.ps1`(Windows) | GitHub OAuth 개발 모드. `dashboard/backend/.env` 필요 | UI `:5175` |
| `dashboard/dev-mysql.sh`, `dev-mysql.ps1` | 실제 MySQL, 시드 데이터, 개발용 로그인 페이지 | `http://localhost:4173/dev-login.html` |

- `sd.sh`와 `dev-local.sh`는 설치형 Console과 같은 DB(`~/.claude/sugo/dashboard/dashboard.db`)를 씁니다.
- `sd.sh`는 커밋 대상인 `sugo/dashboard-runtime/`을 다시 만듭니다. 플러그인 릴리스 때만 커밋합니다.
- MySQL 모드에서 프론트 빌드는 `dist/`의 `dev-login.html`까지 지웁니다. 빌드 → 시드 순서를 지킵니다.
- SQLite 통과는 MySQL 통과가 아닙니다. 스키마 변경은 실제 MySQL로 확인합니다.

`dev.ps1`을 쓰려면 본인 OAuth App 값과 새 세션 비밀값으로 `dashboard/backend/.env`를 만듭니다. 이 파일은 커밋하지 않습니다.

```dotenv
HOST=127.0.0.1
DB_DRIVER=sqlite
SQLITE_FILE=./local.db
SESSION_SECRET=<랜덤 값>
GITHUB_CLIENT_ID=<OAuth App Client ID>
GITHUB_CLIENT_SECRET=<OAuth App Client Secret>
GITHUB_REDIRECT_URI=http://localhost:3001/api/auth/github/callback
```

## 다른 Console에 플러그인 연결

설치형 Console과 `dev-local.sh`는 연결을 자동 설정합니다. 그 밖의 Console은 **Integrations → Plugin API Tokens**에서 토큰을 만들고 `~/.claude/sugo/settings.json`에 병합합니다.

```json
{
  "dashboard": {
    "enabled": true,
    "apiUrl": "http://localhost:3001",
    "userId": "<Console 사용자 ID>",
    "apiToken": "<플러그인 API 토큰>"
  }
}
```

`apiUrl`은 백엔드 base URL이며 `/api`를 붙이지 않습니다. 환경변수 `SUGO_DASHBOARD_API_URL`, `SUGO_DASHBOARD_USER_ID`, `SUGO_DASHBOARD_API_TOKEN`이 파일 설정보다 우선합니다. URL을 환경변수로 주면 토큰도 환경변수로 줍니다.

## 릴리스

요약입니다. 전체 절차는 [AGENTS.md](AGENTS.md)에 있습니다.

- 사용자가 보는 동작을 바꾼 작업은 버전 갱신, 빌드, 테스트, 커밋, push까지가 한 작업입니다.
- Plugin: `sugo/package.json`만 고칩니다. `npm run build`가 나머지 매니페스트와 번들에 버전을 전파합니다. 버전 문자열이 `claude plugin update`의 유일한 갱신 신호입니다.
- Console: frontend와 backend를 `npm version <v> --no-git-tag-version`으로 함께 올리고, frontend를 다시 빌드하고, `sugo/`에서 `npm run build:dashboard`로 플러그인에 실을 Console을 만듭니다.
- 사용자에게 보이는 변경은 [CHANGELOG.md](CHANGELOG.md)의 `[Unreleased]`에 적고, 릴리스할 때 버전 제목으로 옮깁니다.
- 문서만 바뀌면 버전을 올리지 않습니다.
- `git add`와 `git commit`은 따로 실행합니다.

## 설계 문서

| 문서 | 내용 |
| --- | --- |
| [docs/invariants.md](docs/invariants.md) | 문서로 지키는 설계 불변식 |
| [docs/roadmap-sync-contract.md](docs/roadmap-sync-contract.md) | 동기화 크기 제한, 실패 처리, 복구 |
| [docs/human-completion.md](docs/human-completion.md) | 사람 승인과 완료 등급 |
| [docs/spec-deployment.md](docs/spec-deployment.md) | 스펙의 환경별 배포 태그 판정 |
