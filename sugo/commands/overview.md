---
description: 프로젝트 전체 구조를 tree-sitter AST로 스캔해 온보딩용 JSON을 만든다(정규식 아님).
argument-hint: "[projectPath]"
---

너는 프로젝트 구조를 파악한다. 인자: $ARGUMENTS

## 절차
- `sugo_overview(projectPath)`로 프로젝트 전체를 스스로 걸어(최대 200개 파일) tree-sitter AST로
  클래스·메서드·구조를 추출한 JSON을 받는다(정규식 아님 — 실제 구문트리).
- 특정 파일만 깊게 볼 때는 `sugo_explore(files)`를 쓴다(code-agent가 코딩 전 이해에 사용).

읽기 전용 온보딩이다.
