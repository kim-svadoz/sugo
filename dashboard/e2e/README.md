# 실물 검증 하네스 (dashboard e2e)

mock/jose-local이 아니라 **실제 인프라**로 대시보드+플러그인을 검증한다. 실제 MySQL로만 잡히는
버그(JSON 컬럼 타입·datetime·회복력), 실제 OIDC provider로만 잡히는 갭(opaque access token),
실제 브라우저 렌더링, 실제 Bitbucket 클라이언트 HTTP 경로를 확인한다.

## 구성 요소
- `../ports.env` — 로컬/E2E 포트의 유일한 정본. 다른 빈 포트로 자동 우회하지 않는다.
- `oidc-server.mjs` — 실제 OIDC provider(`oidc-provider`, RS256 JWKS + devInteractions 로그인/동의). :9100
- `mock-bitbucket.mjs` — Bitbucket Server REST v1.0 응답 SHAPE mock(branches/pull-requests). :9210
  - ⚠️ 실제 Bitbucket Server가 아니라 Atlassian 문서 기준 응답 형태 mock — 클라이언트 HTTP 경로는
    진짜로 태우지만, 실제 서버 응답과의 최종 일치는 residual(미검증).
- `browser-flow.mjs` — 헤드리스 Chromium(Playwright): 프론트 → 실 OIDC 로그인/동의 → 콜백 →
  실 토큰 교환(JWKS 검증) → Sessions/Canvas 한글 렌더까지 완주 검증.
- `bitbucket-flow.mjs` — 실 로그인 JWT로 PAT 저장→PR 생성(실 HTTP)→기존조회→BRANCH_NOT_PUSHED→삭제.

## 사전 준비
- 로컬 MySQL 8.4 실행 중(127.0.0.1:3306, root/`sugo_local_dev`). `sugo_e2e` DB에 `schema.mysql.sql` 적용.
- `npm install` + `npx playwright install chromium`.

## 실행 순서 (수동 오케스트레이션)
1. `source ../ports.env`로 같은 셸에 포트 계약을 로드한다.
2. `node oidc-server.mjs` (:9100), `node mock-bitbucket.mjs` (:9210)
3. 백엔드를 실제 env로 부팅(:4000): `PORT=$SUGO_E2E_API_PORT DB_DRIVER=mysql MYSQL_*=... SECRET_ENC_KEY=<base64 32B>
   OIDC_ISSUER=http://localhost:9100 OIDC_JWKS_URI=.../jwks OIDC_TOKEN_ENDPOINT=.../token
   OIDC_AUTH_ENDPOINT=.../auth OIDC_CLIENT_ID=sugo-dashboard OIDC_CLIENT_SECRET=e2e-test-secret
   OIDC_REDIRECT_URI=http://localhost:4173/auth/callback CORS_ORIGINS=http://localhost:4173
   npx tsx src/index.ts`
4. 프론트 빌드+서빙(:4173): `VITE_API_BASE=http://localhost:$SUGO_E2E_API_PORT npx vite build && npx vite preview --host 127.0.0.1 --port $SUGO_E2E_UI_PORT --strictPort`
5. 데이터 시딩: `/api/sync/user`,`/workspace`,`/task`,`/canvas`로 userId=`e2euser`(OIDC sub) 데이터.
6. `node browser-flow.mjs`, `node bitbucket-flow.mjs`

## 이 하네스로 실제 잡은 것 (2026-07-25)
- **JSON 컬럼 반환 타입**(mysql2 파싱 vs sqlite 문자열) — 별도 커밋에서 수정.
- **ISO 8601 datetime을 MySQL TIMESTAMP가 거부** + 그 에러가 프로세스를 죽임(회복력) — 수정.
- **opaque OIDC access token → auth-gated 라우트 401**: OIDC provider가 opaque access token을
  발급하면(oidc-provider 기본/일부 Keycloak 설정) 프론트가 그걸 Bearer로 보내도 requireAuth의
  JWKS 검증이 거부한다. → 대시보드가 id_token(항상 JWKS로 검증 가능한 JWT)을 Bearer로 반환하도록
  수정(auth 라우터). IdP의 access-token 형식과 무관하게 동작.

## 남은 residual(실물이 더 필요한 것)
- 실제 Bitbucket Server(Data Center) 응답 형태 최종 일치(지금은 mock SHAPE).
- 원격/배포 환경(원격 MySQL·네트워크 지연·실 Keycloak)에서의 재검증.
