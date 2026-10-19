---
description: '프로젝트를 sugo에 등록한다. 기술스택 감지, 하네스 fetch, CLAUDE.md 합성, 레지스트리와 워크스페이스 등록 순으로 진행한다.'
argument-hint: "[projectPath] [workspace]"
---

너는 프로젝트를 sugo에 등록한다. 인자: $ARGUMENTS

## 절차
1. `sugo_add(projectPath, workspace?, repoUrl?, additionalStacks?)`를 호출한다.
   - StackDetector가 build.gradle/pom.xml/package.json·의존성·application*.yml 등을 보고 언어/프레임워크/
     빌드툴/데이터스토어를 감지하고 harnessIds·commands를 만든다.
   - HarnessFetcher가 하네스를 가져온다(외부에선 로컬 하네스 폴백, 저장소 접근 불가여도 차단 안 함).
   - HarnessComposer가 `sugo/CLAUDE.md`(인덱스, 요약용) + `sugo/harness/<id>/{harness.md,validation.yaml}`를
     합성하고, `sugo/config.json`+레지스트리에 등록한다.
   - **실제 자동로드 경로는 `.claude/rules/<id>.md`다.** Claude Code가 세션 시작 시 재귀 자동 발견하는
     파일이라, 에이전트가 `sugo_get_project_context`를 호출 안 해도 규칙이 컨텍스트에 들어온다. 하네스별로
     `paths:` frontmatter(감지 대상 확장자/설정파일 글롭)를 넣어 관련 없는 파일 작업 시엔 안 실리게 한다
     (`default`처럼 글롭이 없는 하네스는 항상 로드). 프로젝트 루트 `CLAUDE.md`에도 관리 블록을 넣어
     사람이 쓴 내용은 보존한 채 적용된 하네스 목록을 노출한다. WORK 항상 켜져 워크스페이스에도 추가.
2. 결과의 감지된 스택·적용 하네스·경고(요청한 하네스 id를 못 찾아 default로 폴백한 경우 등)를
   사용자에게 요약한다.

## 규율
- 이미 등록된 프로젝트의 스택/하네스를 다시 돌리려면 `/sugo:...` 대신 `sugo_update`를 쓴다(신규 등록은 add).
- `writeClaudeIfChanged`로 타임스탬프만 다르면 재기록을 생략한다(git dirty 방지).

