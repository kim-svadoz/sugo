# CLI로 시작한 작업이 대시보드 일정 항목에 연결되지 않는 문제

작성: 2026-10-27 (momonga 프로젝트 작업 중 발견)  
보완: 2026-10-29

## 처리 결과

| 항목 | 결과 |
| --- | --- |
| CLI 작업의 Schedule 저장소·브랜치·목표일 연결 | 수정. 새 SPEC의 값이 비어 있을 때만 `sugo_plan(prd)`가 저장하고, 실패는 `scheduleLinkWarning`으로 알린다. |
| CLI에서 Schedule 메타데이터 수정 | 수정. `sugo_roadmap`에 `set_project`, `set_work_branch`, `set_due_date`를 추가했다. |
| 다른 컴퓨터에서 옛 install manifest 경로 사용 | 수정. `sugo_add`가 현재 인자로 받은 `projectPath`를 정본으로 다시 기록한다. |
| `integrate` 분석 게이트 문구 | 수정. 실제 차단 동작인 `integrate`를 표시한다. |
| 로드맵 대용량 목록 | 수정. `sugo_roadmap(list, summary:true)`가 계보와 파일 본문을 생략한다. |
| PRD 원장 오류 안내 | 수정. 각 항목 끝의 `(REQ-N)` 표기 방법을 안내한다. |
| 분해 작업의 work-result 누락·거짓 검증완료 | 수정. commit에서 표준 work-result를 만들고 별도 리뷰·런타임 증거가 없으면 `unverified`로 기록한다. |
| 원격 기본 브랜치 오판 | 수정. `origin/HEAD`, Git 기본 브랜치, 현재 브랜치 순으로 판정한다. |
| 로드맵 노드 삭제 후 고아 자식 | 수정. 하위 트리와 그 트리를 향한 의존을 함께 제거한다. |
| 기존 완료 이력의 work-result 복원 | 이미 제공됨. 사후 생성 표시가 있는 최소 결과만 별도 보정하며 기존 파일은 덮어쓰지 않는다. |
| 같은 일을 새 FEAT로 다시 시작하는 문제 | 미해결. 자동 병합은 계보를 바꿀 수 있어 명시적인 patch 선택 UX와 함께 별도 처리한다. |

아래 내용은 발견 당시의 증상과 판단 근거를 보존한 기록이다.

## 증상

CLI(`sugo_plan`)에서 직접 시작해 끝낸 작업을 대시보드 일정(Schedule) 상세에서 열면 아래처럼 비어 있다.

- 완료 목표일: "날짜 선택"
- 저장소: "미지정"
- 작업 브랜치: "현재 브랜치 사용" (입력 불가)
- 후속 개발: "Patch 준비 중" 버튼이 눌리지 않고 "Repository를 선택하면 명령을 생성할 수 있습니다." 안내가 뜬다.

그래서 CLI에서 끝낸 작업은 대시보드에서 바로 Patch 명령을 만들 수 없다.

## 재현

1. 워크스페이스에 등록된 프로젝트에서 `sugo_plan(action:"start", projectPath, featureName)`만 호출한다. `specPath`, `specDraftId`, `workBranch`는 넘기지 않는다.
2. `clarify → prd → decompose → … → commit`으로 `DONE`까지 진행한다.
3. 대시보드 Schedule에서 해당 항목을 연다.

## 확인한 사실 (코드·도구 출력으로 직접 본 것)

| 사실 | 근거 |
| --- | --- |
| 저장소·브랜치·목표일은 **일정 항목(spec 노드)** 에 저장된다 | `dashboard/frontend/src/api/roadmapMutationsApi.ts` 168~190줄: `setDueDate`, `setProject`, `setWorkBranch`가 `POST /api/workspaces/:name/due-date`, `/project`, `/work-branch`를 `{ nodeId, … }`로 호출한다. 주석: "level='spec' 노드에만 적용 가능" |
| `project_path`가 없으면 화면이 막힌다 | `dashboard/frontend/src/pages/SchedulePage.tsx` 1019줄 안내문, 947·977·986·1025줄의 `disabled={!selected.project_path …}` |
| 저장소 드롭다운은 워크스페이스에 등록된 프로젝트 목록이다 | 같은 파일 937줄 `selectedWorkspaceProjects` |
| CLI에서 만든 Task에는 저장소·브랜치·목표일 필드가 없다 | `sugo_task(get)` 결과: `project`(경로)와 `prd_ref`, 시각 필드뿐 |
| 로드맵 spec 노드에서 확인된 연결 키는 `specPath`뿐이다 | 로드맵 목록 출력에서 `repository`, `workBranch`, `dueDate`, `specDraftId` 키는 한 번도 나오지 않았고 `specPath`만 3번 나왔다 |
| CLI 도구에는 이 값을 넣는 동작이 없다 | `sugo_roadmap`의 action 목록(add/remove/status/link/unlink/group/backfill/list/ready/get/mark_req/pull_ordering/block_for_human/request_review_confirmation/resume_with_decision)에 project·branch·due 설정이 없다. `sugo_plan(start)`가 받는 연결 값은 `projectPath`, `specPath`, `specDraftId`, `workBranch`뿐이다 |

## 아직 확인하지 못한 것 (추정)

- CLI로 시작할 때 서버가 spec 노드의 `project_path`를 **채우지 않는 것인지**, 채우는데 이 항목이 다른 노드인지는 서버 코드를 보지 않았다. 대시보드에서 만든 SPEC 초안으로 시작하면(`--spec-draft`, `--branch`) 값이 채워질 것으로 보이지만 확인하지 않았다.
- `sugo_plan(start)`의 `workBranch`가 일정 항목의 `work_branch`로 저장되는지도 확인하지 않았다.

## 수정 제안

우선순위 순이다.

1. **`sugo_plan(start)`이 `projectPath`를 알고 있으면 해당 spec 노드의 `project_path`를 자동으로 채운다.** 가장 작은 수정이고, 위 증상의 대부분이 사라진다.
2. **`sugo_roadmap`에 `set_project`, `set_work_branch`, `set_due_date` 동작을 추가한다.** 대시보드 API가 이미 있으므로 MCP 도구가 감싸기만 하면 된다. `sugo_plan(start)`에 `dueDate` 입력을 받는 방법도 있다.
3. **`start`나 `commit` 결과에 연결 상태 경고를 넣는다.** "일정 항목에 저장소가 지정되지 않아 대시보드에서 Patch 명령을 만들 수 없다"를 알려 준다. 지금은 조용히 넘어간다.
4. **대시보드에서 `spec_path`는 있는데 `project_path`가 없을 때**, 워크스페이스 프로젝트가 하나뿐이면 자동 선택하거나 "이 프로젝트로 지정" 버튼을 보여 준다.

## 임시 우회

대시보드 화면에서 "저장소" 칸을 눌러 프로젝트를 고른다. 고르면 작업 브랜치 입력과 Patch 명령 생성이 활성화된다.

## 함께 발견한 다른 문제

### A. `sugo_add`가 git에 올라간 옛 경로를 믿는다

- 증상: 다른 컴퓨터에서 clone한 저장소에 `sugo_add`를 실행하면 `EACCES: permission denied, mkdir '/Users/simson'`으로 실패한다.
- 원인(확인함): 저장소 안의 `sugo/install-manifest.json`에 이전 컴퓨터의 `projectPath`(`/Users/simson/content-studio`)가 들어 있었고, 도구가 인자로 받은 `projectPath` 대신 이 값으로 폴더를 만들려 했다.
- 임시 처치: 그 파일의 경로를 고치고 재실행했다. 이후 `sugo/config.json`과 `install-manifest.json`을 `.gitignore`에 넣었다.
- 수정 제안: `sugo_add`는 인자로 받은 `projectPath`를 기준으로 하고, manifest의 경로가 다르면 무시하거나 덮어쓴다. 처음부터 이 파일들을 git에 올리지 않도록 `.gitignore`에 넣어 주는 방법도 있다.

### B. `integrate`의 오류 문구가 분해(decompose) 경로에서 혼란스럽다

- 증상: `decompose → subtask_* → integrate`로 진행하면 `ANALYZE_NOT_CALLED: code_done 전에 sugo_analyze를 최소 1회 실제 호출해야 합니다.`가 나온다. 이 경로에는 `code_done`이 없다.
- 영향: 게이트를 막는 것은 맞지만 "integrate 전에 필요하다"는 안내가 없어서 원인을 찾기 어렵다.
- 수정 제안: 오류 문구에 실제로 막은 단계 이름(`integrate`)을 쓴다.

### C. `sugo_roadmap(list)`의 출력이 한도를 넘는다

- 증상: `filterLevel`, `filterParent` 없이 호출하면 약 80만 자(1,415줄)가 나와 도구 출력 한도를 넘는다. 호출한 쪽은 파일로 저장된 결과를 따로 열어야 한다.
- `filterParent`로 spec 하나만 골라도 12만~27만 자가 나왔다. 아래 workstream 노드마다 `workResult` 전체가 들어 있기 때문이다.
- 수정 제안: 요약만 돌려주는 선택(예: `summary: true`)을 추가한다. 기본 출력을 바꾸면 기존 호출부가 깨질 수 있으니 기본값은 그대로 두고 선택으로 추가한다.

### D. PRD 게이트 오류가 무엇을 고치라는 것인지 길다

- 증상: `CONFORMANCE_LEDGER_INCOMPLETE`가 "REQ 미매핑 11건"과 함께 항목 전문을 한 줄로 길게 나열한다. 해결 방법(각 항목에 `(REQ-N)`을 붙인다)은 문구에 없다.
- 수정 제안: 오류 문구에 "범위·완료조건의 각 항목 끝에 (REQ-N)을 붙이세요" 예시를 포함한다.

### E. 같은 작업을 이어서 해도 CLI 세션마다 일정 항목이 새로 생긴다

- 증상: 1~2단계와 3단계를 각각 `sugo_plan(start)`로 시작했더니 일정에 항목이 2개 생겼다. 사용자에게는 한 작업이다.
- 원인(확인함): `start`마다 새 Task와 spec 노드(`spec-task-<taskId>`)를 만든다. 이어서 하려면 `sugo:patch`(`workResultPath`)로 시작해야 같은 항목에 붙는데, CLI에서는 이 선택을 안내하지 않는다.
- 2026-10-27 정리한 방법:
  1. 로컬 `~/.claude/sugo/work/<워크스페이스>/roadmap.json`에서 두 번째 실행 기록(`run-task-…`)의 `parent`를 첫 spec으로 바꾸고 두 번째 spec 노드를 뺐다. CLI 동기화가 로컬 값으로 `parent`를 덮어쓰기 때문에 로컬부터 고쳐야 한다.
  2. 대시보드 API `POST /roadmap/parent`, `/rename`, `/project`로 같은 변경을 바로 반영했다.
  3. `POST /roadmap/drop`은 완료(`done`) 상태 항목을 거절한다(`SUBTREE_HAS_DONE_TASK`). 대신 로드맵 변경으로 스냅샷 동기화를 일으키면 서버가 로컬에 없는 spec 노드를 지운다(`computeNodesToDelete`).
- 수정 제안:
  - `start` 때 같은 프로젝트에 최근 완료된 작업이 있으면 "새 작업인지, 이어서 하는 patch인지" 묻는다.
  - 일정 항목 합치기(merge) 기능을 대시보드나 `sugo_roadmap`에 둔다.

### F. 분해(decompose) 경로로 끝내면 작업 결과(work-result.md)가 없어 patch·이어붙이기가 막힌다

- 증상: 일정 상세의 "후속 개발"이 "Patch 준비 중"에서 바뀌지 않는다. 개발 이력 2건이 모두 `FEAT`로 표시된다.
- 확인한 사실:
  - `dashboard/frontend/src/pages/SchedulePage.tsx` 43~51줄 `latestWorkResultPath`: `development_history[].work_result_path`나 `focus_task_work_result.path`가 있어야 "새 Patch 시작"이 된다.
  - 대시보드 일정 조회 결과: 두 이력 모두 `version: 0`, `work_result_path: null`. `focus_task_work_result`에는 `path`가 없다(`patchVersion: 0`, 파일 목록만 있음).
  - 프로젝트 폴더 `sugo/features/<날짜>/<기능>/`에는 `prd.md`만 있고 `work-result.md`가 없다.
  - 두 세션 모두 `decompose → subtask_* → integrate → docs_done → commit`으로 끝났다. 이 경로는 `review_done`(작업 결과를 만드는 단계)을 지나지 않는다. 그런데도 완료 등급은 `verified`로 나왔다.
  - FEAT/PATCH 표시는 `version`으로 정해진다(`lib/scheduleDevelopmentPreview.ts` 7줄: 0이면 FEAT). 두 번째 세션을 patch가 아닌 새 feat으로 시작해서 0이 됐다.
- 수정 제안:
  1. `integrate`(또는 `commit`)에서 리뷰 경로와 같은 형식의 `work-result.md`를 만들고 `work_result_path`를 동기화한다. 분해 경로와 단일 경로의 산출물이 같아야 한다.
  2. 작업 결과가 없는데 `verified`로 끝나지 않게 한다.
  3. 같은 일정 항목(또는 같은 프로젝트의 최근 완료 작업)이 있을 때 `start`가 patch로 이어갈지 묻는다(E와 같은 제안).
- 대시보드와 CLI가 같은 규격으로 움직여야 한다는 것이 사용자 요구다(2026-10-27): 어디서 시작하든 저장소·브랜치·목표일·작업 결과·patch 번호가 같은 방식으로 남아야 한다.


### G. 세션 시작 때 sugo 연결 실패와 과한 출력

- 증상 1: 세션 시작 직후 sugo MCP 서버가 "Skipping connection (recent failure cached …)"로 연결되지 않아 sugo 도구를 쓸 수 없었다. `/reload-plugins` 뒤에야 연결됐다.
- 증상 2: 세션 시작 훅이 `0.51.13/code-agent.md: +29개 도구` 같은 줄을 버전·에이전트마다 수백 줄 출력했다(`패치 156개, 기존 356개`). 매 세션 대화 앞부분을 차지한다.
- 수정 제안: 연결 실패 원인을 시작 출력에 한 줄로 남긴다. 도구 목록 동기화 결과는 "에이전트 N개에 도구 M개 반영"처럼 요약 한 줄로 줄인다. 상세는 로그 파일로 보낸다.

### H. 이미 끝난 일정을 feat → patch로 바로잡을 정식 경로가 없다

- 상황: 위 E·F 때문에 두 번째 작업이 PATCH가 아니라 FEAT로 남았다. 사용자는 FEAT 1개 + PATCH 1개로 바로잡기를 원했다.
- 막힌 이유(확인함): `/sugo:patch-attach`는 기준이 될 `work-result*.md`가 있어야 시작할 수 있다(절차 1단계, 서버도 계보가 없으면 거절). 첫 작업의 작업 결과가 없어서(F) 시작할 수 없다. 대시보드 값을 직접 바꾸면 계보를 지어내는 것이라 하지 않았다.
- 수정 제안: F를 고칠 때, 작업 결과 없이 끝난 기존 세션의 작업 결과를 세션 기록(변경 파일, 시험 증거, PRD)으로 다시 만드는 보정 명령을 함께 둔다. 보정된 결과에는 "사후 생성"이라고 표시한다. 그 뒤 두 번째 작업은 `/sugo:patch-attach`로 PATCH 1이 될 수 있다.
- 사용자 결정(2026-10-27): fashion-content의 `spec-task-1793083552015-92a55dc1`은 **FEAT 2개 그대로 둔다.** 이 일정은 보정하지 않는다. 보정 명령은 앞으로 생길 같은 사례를 위한 것이다.

### I. 작은 관찰

- `subtask_done`이 분해 계획(manifest)에 없던 파일(`apps/shorts-editor/index.html`, `test_profile.mjs`)을 경고 없이 받았다. 의도한 동작이면 괜찮지만, 계획과 실제 변경이 다르다는 표시는 남기는 게 좋다.
- 작업 결과의 `prRefs.targetBranch`가 `develop`으로 기록됐다. 이 저장소(momonga)에는 `main`만 있다. 기본값을 저장소의 기본 브랜치에서 읽어야 한다.
- 로컬 `sugo_roadmap(remove)`는 해당 노드만 빼고 자식 노드는 그대로 둔다(부모 없는 노드가 남는다). 대시보드 반영은 `writeRoadmapFile`의 스냅샷 동기화로 된다(`sugo/src/work/roadmap.ts` 94~101줄).

## 기존 흐름을 깨지 않는 방법

모든 제안은 **선택 입력 추가, 비어 있을 때만 채우기, 문구 변경** 수준으로 하면 지금 흐름이 그대로 동작한다.

| 제안 | 깨지 않게 하는 방법 |
| --- | --- |
| CLI 시작 때 저장소 채우기 (본 문제 1) | spec 노드의 `project_path`가 **비어 있을 때만** 채운다. 대시보드에서 지정한 값은 덮어쓰지 않는다. |
| `set_project`·`set_work_branch`·`set_due_date` (본 문제 2) | 새 action 추가만 한다. 기존 action은 바꾸지 않는다. |
| 연결 상태 경고 (본 문제 3) | 결과에 경고 필드만 추가한다. 게이트로 막지 않는다. |
| `start`가 patch 여부를 묻기 (E) | 같은 프로젝트에 완료 작업이 있을 때만 묻는다. `workResultPath`를 넘기면 지금처럼 바로 patch, 아무것도 안 넘기면 지금처럼 feat로 진행하는 선택지를 남긴다. |
| 분해 경로에서 작업 결과 만들기 (F) | 리뷰 경로가 만드는 것과 **같은 형식**으로 만든다. 리뷰 경로는 바꾸지 않는다. |
| 작업 결과 없으면 `verified` 금지 (F) | 등급만 낮춘다(`unverified` 등). 완료 자체는 막지 않는다. |
| 기존 세션 보정 명령 (H) | 별도 명령으로 두고, 자동으로 돌지 않게 한다. |
| 로드맵 요약 출력 (C) | 선택 입력으로 추가한다. 기본 출력은 그대로 둔다. |
| 오류 문구 (B, D) | 오류 코드는 그대로 두고 문구만 바꾼다. 코드로 분기하는 호출부가 깨지지 않는다. |
| `sugo_add` 경로 (A) | 인자로 받은 `projectPath`를 우선한다. manifest 경로가 같으면 지금과 동작이 같다. |
