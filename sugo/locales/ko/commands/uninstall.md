---
description: '프로젝트 연결과 자동 규칙을 제거하고 사용자 데이터는 비활성 보관한 뒤 플러그인을 제거한다.'
argument-hint: ""
---

Sugo를 안전하게 제거한다. 이 명령은 되돌릴 수 없는 데이터 삭제를 포함하므로 아래 순서를 바꾸지 않는다.

1. `sugo_uninstall(action: "preview", mode: "retain")`을 호출한다.
2. 프로젝트 자동 규칙은 제거되고, 로컬 대시보드 서버는 멈추며, 데이터는 `~/.sugo/data`에 비활성 보관된다고 설명하고, 정확히 `UNINSTALL_SUGO`라고 입력받는다.
3. `sugo_uninstall(action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO")`를 호출한다.
4. `verifiedClean: true`를 확인한다. `preserved`가 있으면 소유권을 증명할 수 없어 안전하게 남긴 경로이므로 숨기지 말고 그대로 알린다.
5. 정리가 검증된 뒤에만 `claude plugin uninstall sugo@sugo-marketplace --scope user`를 실행한다. 실패하면 데이터 정리는 완료됐지만 플러그인 캐시 제거가 실패했다고 구분해 보고한다.

규율:
- 완전 삭제 요청에는 `/sugo:purge`를 사용한다.
- 캐시가 먼저 사라졌다면 `node ~/.sugo/bin/sugo-uninstall.mjs uninstall`로 같은 연결 해제를 수행한다.
- 사용자 파일을 이름이나 위치만 보고 추측해서 삭제하지 않는다. install manifest에 기록된 파일만 Sugo 소유로 본다.
- 기존 `CLAUDE.md`, `AGENTS.md`, 사용자 `.claude/rules/**`는 보존한다.

