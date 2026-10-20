---
description: 로컬 Sugo Console의 상태를 확인하거나 시작·재시작·종료한다.
argument-hint: "[status|start|restart|stop]"
---

로컬 Sugo Console을 관리한다. 입력: $ARGUMENTS

## 절차
- 인자가 없으면 `status`로 처리한다.
- `status`, `start`, `restart`, `stop`만 허용한다.
- 선택한 동작으로 `sugo_console(action)`을 호출한다.
- 실행 여부, 고정 로컬 주소, Console 버전, Plugin 빌드를 사용자에게 알린다.
- `start` 또는 `restart` 뒤에는 `running:true`인 경우에만 반환된 주소를 열도록 안내한다.
- 서버가 실행 중인데 `managed:false`라면 이 플러그인이 시작한 프로세스가 아니라고 설명하고 종료하지 않는다.

설치형 Console은 새 Claude Code 세션에서 자동으로 시작한다. `/reload-plugins`는 플러그인 정의만 다시
읽고 `SessionStart` 훅은 다시 실행하지 않는다. 현재 세션에서 복구할 때 이 명령을 사용한다.
