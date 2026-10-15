---
description: 'Sugo가 만든 프로젝트 파일과 전역 데이터를 제거하고 Claude/Codex 프로젝트 설정을 설치 전 상태로 복원한 뒤 플러그인을 제거한다.'
argument-hint: ""
---

Sugo를 안전하게 제거한다. 이 명령은 되돌릴 수 없는 데이터 삭제를 포함하므로 아래 순서를 바꾸지 않는다.

1. `sugo_uninstall(action: "preview")`를 호출하고 제거 대상 프로젝트, 소유권 기록 여부, 보존될 항목을 보여준다.
2. 사용자에게 전역 Sugo 데이터와 Sugo가 소유한 프로젝트 산출물을 영구 삭제한다는 점을 설명하고, 정확히 `DELETE_SUGO_DATA`라고 입력받는다. 다른 답이면 중단한다.
3. `sugo_uninstall(action: "execute", confirmation: "DELETE_SUGO_DATA")`를 호출한다.
4. `verifiedClean: true`를 확인한다. `preserved`가 있으면 소유권을 증명할 수 없어 안전하게 남긴 경로이므로 숨기지 말고 그대로 알린다.
5. 정리가 검증된 뒤에만 `claude plugin uninstall sugo@sugo-marketplace --scope user`를 실행한다. 실패하면 데이터 정리는 완료됐지만 플러그인 캐시 제거가 실패했다고 구분해 보고한다.

규율:
- native uninstall을 먼저 실행하지 않는다. Claude Code에는 plugin uninstall lifecycle hook이 없어서 Sugo가 프로젝트 설정을 복원할 기회를 잃는다.
- 사용자 파일을 이름이나 위치만 보고 추측해서 삭제하지 않는다. install manifest에 기록된 파일만 Sugo 소유로 본다.
- 기존 `CLAUDE.md`, `AGENTS.md`, 사용자 `.claude/rules/**`는 보존한다.
