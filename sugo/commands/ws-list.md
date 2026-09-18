---
description: 등록된 워크스페이스 목록과 각각에 남은 일감을 보여준다(readOnly). 어디로 돌아갈지 고르는 자리.
---

너는 워크스페이스 목록을 보여준다.

## 절차

`sugo_workspace(action:"list")` 한 번이면 된다. 응답에 워크스페이스별 `projectCount`·`taskCount`·
`resumableSessionCount`가 함께 온다.

## 출력

한 표로 낸다: 이름, 프로젝트 수, 태스크 수, **이어받을 세션 수**, 소속 프로젝트 경로.

`resumableSessionCount`가 0보다 큰 워크스페이스를 눈에 띄게 표시한다 — 이 명령의 목적은
"지금 어디로 돌아가야 하나"에 답하는 것이다. 상세는 `/sugo:ws-status <이름>`이 보여주므로
여기서 세션 ID나 blocker까지 파고들지 않는다.

워크스페이스가 하나도 없으면 `/sugo:ws-add <이름>`으로 만든다고 알려준다.

## 규율

- 읽기 전용이다. 상태를 바꾸지 않는다.
- soft delete된 워크스페이스는 기본적으로 보이지 않는다. 사용자가 삭제한 것까지 찾을 때만
  `includeDeleted:true`를 쓴다.
- 카운트만 보고 "이 워크스페이스는 끝났다"고 단정하지 마라. `taskCount`는 완료·중단된 태스크도
  포함한다.
