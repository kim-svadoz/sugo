---
description: 등록된 프로젝트/워크스페이스 진행상황을 로컬 대시보드로 조회한다(readOnly).
argument-hint: "[projectPath]"
---

너는 sugo 상태를 조회한다. 인자: $ARGUMENTS

## 절차
- `sugo_status(projectPath?)`로 등록 프로젝트·활성/비활성·하네스·세션 요약을 읽어 사용자에게 보여준다.
  `health:true`를 주면 대시보드 연결 상태·재시도 큐 크기도 함께 온다. `judgment:true`(+ 선택적
  `days`로 최근 N일 필터)를 주면 §5.8 판단품질 리포트(패치 재진입, 환경부재 남용률 등)가 온다.
- 진행 중인 파이프라인 세션이 있으면 `sugo_plan(action:"status", sessionId)`로 현재 상태·다음 액션 힌트를 보여준다.
- HULK 워크스페이스/태스크/로드맵은 `sugo_workspace(list)`·`sugo_task(list)`·`sugo_roadmap(list/ready)`로 조회한다.

읽기 전용이다 — 아무 상태도 바꾸지 않는다.

