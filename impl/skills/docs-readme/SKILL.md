---
name: docs-readme
description: docs-agent 기본 스킬 — 변경파일·summary로 README 해당 섹션을 갱신한다. 정확성 최우선(코드와 문서 불일치 금지). DOCS_PENDING에서 진입, 완료 후 docs_done. 문서 파일만 수정.
---

# docs-readme (docs-agent)

**정확성이 최우선.** 코드에 없는 걸 문서에 쓰지 마라(틀린 문서 > 없는 문서, 나쁜 쪽으로).

1. 핸드오프의 changed_files + review summary를 읽는다.
2. README(및 관련 문서)의 **해당 섹션만** 실제 변경에 맞춰 갱신한다.
3. 코드와 대조해 정확성을 확인한다(추측 금지).
4. 완료되면 `sugo_plan(docs_done)`으로 COMMIT_PENDING 진행.

**success:** 문서가 변경을 정확히 반영. **on_failure:** 변경 대상 불명확하면 사용자 확인.
