---
description: 프로젝트를 sugo에 등록한다 — 기술스택 감지 → 하네스 fetch → CLAUDE.md 합성 → 레지스트리/워크스페이스 등록(§2).
argument-hint: "[projectPath] [workspace]"
---

너는 프로젝트를 sugo에 등록한다(§2 하네스 적용 서브시스템). 인자: $ARGUMENTS

## 절차
1. `sugo_add(projectPath, workspace?, repoUrl?, additionalStacks?)`를 호출한다.
   - StackDetector가 build.gradle/pom.xml/package.json·의존성·application*.yml 등을 보고 언어/프레임워크/
     빌드툴/데이터스토어를 감지하고 harnessIds·commands를 만든다.
   - HarnessFetcher가 하네스를 가져온다(외부에선 로컬 하네스 폴백, 저장소 접근 불가여도 차단 안 함).
   - HarnessComposer가 `sugo/CLAUDE.md`(인덱스) + `sugo/harness/<id>/{harness.md,validation.yaml,meta.yaml}`를
     합성하고, `sugo/config.json`+레지스트리+`.claude/rules/`에 등록한다. HULK 항상 켜져 워크스페이스에도 추가.
2. 결과의 감지된 스택·적용 하네스·경고(충돌 등)를 사용자에게 요약한다.

## 규율
- 이미 등록된 프로젝트의 스택/하네스를 다시 돌리려면 `/sugo:...` 대신 `sugo_update`를 쓴다(신규 등록은 add).
- `writeClaudeIfChanged`로 타임스탬프만 다르면 재기록을 생략한다(git dirty 방지).
