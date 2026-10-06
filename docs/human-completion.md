# 사람 승인 완료등급 — Plugin 0.19.0 / Console 0.12.0

2026-10-06. 자동 실행 검증과 사람이 위험을 수용한 판단을 구분한다. 게이트 통과 조건이나 테스트 증거는 바꾸지 않는다.

## 등급과 승인 단위

| 조건 | 완료등급 | 표시 |
|---|---|---|
| 현재 patch의 유효 우회 라벨이 없음 | `verified` | 검증 완료 |
| 유효 라벨 중 미승인/승인 취소가 하나라도 있음 | `unverified` | 미검증 |
| 모든 유효 라벨이 사람이 승인한 상태 | `verified_by_human` | 사람 승인 검증완료 |

라벨의 kind, 원래 reason, patchVersion, recordedAt, implementationCycle 조합이 불변 식별자다. 승인/취소 사유는 공백만 허용하지 않는다. 승인 이력은 append-only이며 사용자 ID, 서버 시각, 원래 라벨/사유, 검토 사유, 당시 work-result 경로를 저장한다. DB 순번으로 순서를 정하므로 같은 밀리초의 승인/취소도 마지막 이벤트가 적용된다. 라벨이나 과거 승인을 지우지 않는다.

## 로그인과 정본 경계

- Dashboard의 완료 TASK 개요에서 라벨별 사유를 입력해 승인/취소한다. 사용자 ID는 요청 본문이 아닌 인증 세션에서 정한다.
- `POST /api/workspaces/:name/roadmap/completion-approval`은 GitHub OAuth 로그인으로 발급된 세션 JWT만 허용한다. API 토큰, 자동 로컬 개인 로그인, 출처가 없는 구버전 세션은 403이다. 업데이트 후 다시 GitHub 로그인해야 한다.
- MCP, CLI, 스킬에 승인 액션을 제공하지 않는다. `sugo_plan`/`sugo_roadmap`은 `approve`를 받지 않는다. 플러그인의 API 토큰으로 승인 API를 호출해도 거부된다.
- 자동 로컬 로그인 모드는 사람이 개입했다는 증거가 없으므로 승인에 사용할 수 없다. 이 기능을 사용하려면 GitHub OAuth를 설정하고 로그인해야 한다.
- 승인 정본은 별도 DB 테이블 `sugo_completion_approval_events`다. 플러그인 sync/bulk는 모든 중첩 humanApprovals를 제거하고 `verified_by_human` 주장도 무시한다. TASK와 연결된 RUN, Schedule은 서버가 승인 이력으로 등급을 투영한다.
- work-result 경로·완료 시각·patch·라벨 집합의 SHA-256 키에 승인을 묶는다. 새 patch나 결과 변경 시 이전 승인이 자동 승계되지 않고, 오래 열린 화면의 승인은 409로 거부된다. 기록은 노드 삭제 후에도 유지한다.
- 신뢰 경계는 기존 OAuth/서버 서명키다. 서버 파일이나 로그인 세션을 탈취할 수 있는 주체를 이 애플리케이션만으로 사람과 구분할 수는 없다. 에이전트에 로그인 세션/서명키를 전달하지 않는다.

## 로컬 반영

```text
sugo_roadmap({ action: "pull_ordering", workspace: "orders" })
```

기존 Dashboard 정본 필드 pull에 승인 정보를 포함한다. 로컬 경로·완료 시각·patch·라벨 집합이 일치할 때 승인 이력과 등급만 병합해 work-result.md를 재생성한다. 실행 증거는 원래 로컬 report를 유지한다. 원래 라벨과 승인/취소 사유를 `사람 승인` 섹션에 남기고, 연결된 완료 세션의 report와 해당 lineage도 갱신한다. 대시보드는 즉시 반영되고 로컬 파일은 다음 pull 후 반영된다. Dashboard 장애 시 로컬 결과는 유지된다.

## 구현 사이클 결정

성공한 `code_start`마다 서버가 implementationCycle을 올리고 시작 시각을 기록한다. 그 사이클에서 새로 기록된 테스트 실행 증거로 **우회 없이 test_done을 통과했을 때만** 이전 사이클의 `evidenceResnapshot`을 해소한다. supersededAt/supersededByCycle을 원래 라벨에 추가하고 최종 등급 계산에서는 제외하며 화면/문서에는 이전 사이클 라벨로 보존한다.

재스냅샷은 특정 테스트 판정의 재개방 기록이므로 새 구현의 정식 검증이 이를 대체할 수 있다. 다른 라벨은 환경·계약·배선·런타임 또는 작업 전체의 예외를 나타내므로 테스트 한 번으로 해소했다고 추정하지 않는다. 특히 abandonedChain은 계속 남는다. 최신 사이클에서 새 test_reverify를 사용하면 그 라벨은 다시 유효하다. 과거 그린 증거를 재사용하거나 새 테스트가 실패/미검증이면 해소하지 않는다.

구버전 라벨의 사이클은 0으로 취급한다. **이미 완료된 구버전 세션을 추측으로 일괄 verified 처리하지 않는다.** 구버전에는 마지막 code_start의 시각/사이클 증거가 없기 때문이다. 기존 모듈 재스냅샷 뒤 새 모듈을 구현하는 흐름을 새 버전에서 같은 순서로 수행하면 자동 verified가 된다. 과거에 완료된 해당 세션은 현재 라벨을 사람이 검토해 승인하거나, 새 구현 사이클에서 정식 재검증해야 한다. 라벨 필드가 없는 구버전 report는 로컬에 남아 있는 같은 경로의 DONE 세션 chainInfo에서 원래 라벨을 보충한다. 최신 Plugin에서 `sugo_workspace({action:"sync",name:"orders"})`로 다시 동기화한 뒤 화면에서 승인하면 된다. 원 세션이 없으면 추측으로 라벨을 만들어 승인하지 않는다.

## 표시와 검증

TASK 개요에 `완료등급 사유 · 우회 라벨`과 `참고용 경고 · 완료등급과 별개`를 분리한다. analyze partial/blockers는 완료등급 입력이 아니다. 사람 승인 등급은 보라색 문구로 자동 검증과 구별한다.

검증: Plugin 순수 함수 red-first 후 구현, 부분/전체/취소·빈 사유·API 토큰/자동 로컬 로그인/다른 사용자 거부·위조 sync·결과 변경·삭제 후 감사 유지·MCP 액션 부재·실제 파일 pull·재진입 회귀 테스트. `dashboard/e2e/human-completion-flow.mjs`는 실제 HTTP/SQLite/브라우저 승인 흐름과 스크린샷, `human-completion-mysql.mjs`는 실제 MySQL의 JSON/한글/감사 순번/원자적 INSERT/재동기화를 검증한다.

## 배포와 마이그레이션

- Plugin 0.19.0 / Console 0.12.0. Plugin을 업데이트하고 `/reload-plugins`한다.
- **Dashboard 백엔드 재시작이 필요하다.** initDb가 감사 테이블을 추가 생성한다. 기존 테이블/라벨/실행 증거를 수정하지 않는다. DB 계정에 CREATE TABLE 권한이 필요하다.
- 운영에서 DDL 권한을 분리했다면 `dashboard/backend/src/db/human-completion.mysql.sql`을 먼저 DBA 계정으로 적용한 뒤 백엔드를 재시작한다. SQLite도 동일 필드의 테이블이 자동 생성된다.
- 프론트엔드를 새 버전으로 빌드·배포하고, 승인을 사용할 사람은 GitHub에서 다시 로그인한다. 기존 세션은 일반 조회/동기화에는 계속 사용할 수 있다.
- 롤백할 때 감사 테이블을 삭제하지 않는다. 구버전 Plugin은 사람 승인 등급을 이해하지 못하므로 양쪽 제품을 함께 업데이트한다.
