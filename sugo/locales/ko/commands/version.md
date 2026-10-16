---
description: 설치된 sugo 플러그인 버전을 조회한다(readOnly). 업데이트가 실제로 적용됐는지 확인할 때 쓴다.
---

너는 설치된 sugo 버전을 확인한다.

## 절차
- `sugo_version()`으로 버전을 읽어 사용자에게 보여준다.
- 보고하는 값은 **지금 돌고 있는 번들에 빌드타임으로 박힌 상수**다(`__SUGO_VERSION__`). 저장소의
  `package.json`이 아니라 실제 실행 중인 설치본을 가리키므로, 업데이트가 적용됐는지 확인하는 근거가 된다.
- 기대한 버전과 다르면 갱신이 아직 반영되지 않은 것이다. 순서는
  `claude plugin update sugo@sugo-marketplace` → **`/reload-plugins`**다. 이 명령이 MCP 서버까지
  다시 붙이므로 Claude Code 전체 재시작은 필요 없다(`plugin update` 출력은 `Restart to apply
  changes.`라고 하지만 reload로 충분하다 — 0.3.0→0.3.1→0.3.2를 전부 reload만으로 확인했다).
- **버전이 그대로면 먼저 저장소의 `package.json`을 의심한다.** `plugin update`는 버전 문자열이
  올라갔을 때만 갱신한다 — 같은 버전으로 내용만 push하면 `already at the latest version`으로
  건너뛴다. 그리고 `package.json`을 올렸어도 재빌드하지 않았으면 번들의 상수는 옛 값 그대로다.
- `updateCheckAvailable`이 false면 원격 업데이트 확인 기능이 없다는 뜻이다. 최신 여부를 여기서
  판단하지 말고, 저장소의 버전과 직접 대조한다.

읽기 전용이다 — 아무 상태도 바꾸지 않는다.

