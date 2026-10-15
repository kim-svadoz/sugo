---
description: '재설치 후 보관된 이전 데이터를 폐기하고 새 Sugo 환경으로 시작한다.'
---

1. `~/.sugo/data`의 이전 워크스페이스·세션이 영구 삭제되며 복구할 수 없다고 설명한다.
2. 정확히 `DELETE_RETAINED_DATA`를 입력받는다. 다른 답이면 중단한다.
3. `sugo_uninstall(action: "discard", confirmation: "DELETE_RETAINED_DATA")`를 호출한다.
4. 이후 사용자가 선택한 프로젝트에 `sugo_add`를 실행한다. 폐기 전에 새 등록을 우회하지 않는다.
