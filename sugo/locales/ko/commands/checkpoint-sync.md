---
description: 대시보드의 체크포인트를 로컬 .claude/rules/로 pull한다.
argument-hint: "[projectPath]"
---

너는 대시보드→로컬 체크포인트 동기화를 한다. 인자: $ARGUMENTS

## 절차
- `sugo_checkpoint(action:"pull", workspace, projectPath)`를 호출한다. 내부적으로
  `GET /api/workspaces/checkpoint-sync`로 원격 체크포인트를 받아 `category`에 따라
  `.claude/rules/<category>/<slug>.md`(general=루트)로 기록한다.
- 대시보드가 disabled/다운이면 조용히 아무것도 안 한다(로컬 상태가 안전한 폴백 — 파이프라인을 막지 않는다).

## 규율
- 소유권 경계: 대시보드가 SOT인 체크포인트를 로컬로 내려받는 방향이다. 로컬에서 만든 건 push 방향.

