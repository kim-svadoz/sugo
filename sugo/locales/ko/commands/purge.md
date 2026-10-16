---
description: 'Sugo 프로젝트 연결, 사용자 데이터, 독립 제거기까지 영구 삭제한다.'
---

1. `sugo_uninstall(action: "preview", mode: "purge")`로 대상을 보여준다.
2. 복구할 수 없는 완전 삭제임을 알리고 정확히 `DELETE_SUGO_DATA`를 입력받는다.
3. `sugo_uninstall(action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA")`를 호출한다.
4. `verifiedClean: true`를 확인한 다음 `claude plugin uninstall sugo@sugo-marketplace --scope user`를 실행한다.

플러그인 캐시가 이미 없다면 `node ~/.sugo/bin/sugo-uninstall.mjs purge`를 사용한다.

