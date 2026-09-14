---
description: 설치된 sugo 플러그인 버전을 조회한다(readOnly). 업데이트가 실제로 적용됐는지 확인할 때 쓴다.
---

너는 설치된 sugo 버전을 확인한다.

## 절차
- `sugo_version()`으로 버전을 읽어 사용자에게 보여준다.
- 보고하는 값은 **지금 돌고 있는 번들에 빌드타임으로 박힌 상수**다(`__SUGO_VERSION__`). 저장소의
  `package.json`이 아니라 실제 실행 중인 설치본을 가리키므로, 업데이트가 적용됐는지 확인하는 근거가 된다.
- 기대한 버전과 다르면 갱신이 아직 반영되지 않은 것이다. 순서는
  `claude plugin marketplace update sugo-marketplace` → `claude plugin update sugo` →
  **Claude Code 재시작**이다. 재시작 전에는 이전 번들이 계속 돌기 때문에 값이 바뀌지 않는다.
- `updateCheckAvailable`이 false면 원격 업데이트 확인 기능이 없다는 뜻이다. 최신 여부를 여기서
  판단하지 말고, 저장소의 버전과 직접 대조한다.

읽기 전용이다 — 아무 상태도 바꾸지 않는다.
