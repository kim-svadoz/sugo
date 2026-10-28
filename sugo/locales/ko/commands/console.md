---
description: 로컬 Sugo Console의 상태를 확인하거나 시작·재시작·종료하고, 브라우저로 연다.
argument-hint: "[status|start|restart|stop|open]"
---

로컬 Sugo Console을 관리한다. 입력: $ARGUMENTS

## 절차
- 인자가 없으면 `status`로 처리한다.
- `status`, `start`, `restart`, `stop`, `open`만 허용한다.
- 선택한 동작으로 `sugo_console(action)`을 호출한다.
- 실행 여부, 결과의 주소(`http://sugo.localhost:<포트>`), Console 버전, Plugin 빌드를 사용자에게 알린다. 기본 포트는 3001이지만 쓰이고 있으면 다음 빈 포트로 뜨므로, 3001을 가정하지 말고 반환된 `url`을 그대로 알린다.
- `open`은 필요하면 Console을 띄운 뒤 반환된 주소를 기본 브라우저로 연다. 결과의 `message`가 브라우저를 열지 못했다고 하면 주소를 사용자에게 알린다.
- `start` 또는 `restart` 뒤에는 `running:true`인 경우에만 반환된 주소를 열도록 안내한다.
- 서버가 실행 중인데 `managed:false`라면 이 플러그인이 시작한 프로세스가 아니라고 설명하고 종료하지 않는다.

Console은 세션마다 뜨지 않는다. `open`이나 `start`로 띄우고, 작업이 사람의 판단을 기다릴 때도 스스로 뜬다. 꺼져 있던 동안의 기록은 Console이 뜰 때 동기화한다.
