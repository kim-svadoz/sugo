---
description: HULK 워크스페이스를 생성한다(관련 프로젝트 묶음). 대시보드 "Add Domain"이 이 커맨드를 복사해 준다.
argument-hint: <workspace 이름>
---

너는 HULK 워크스페이스를 만든다(§8). 인자: $ARGUMENTS

## 절차
- `sugo_workspace(action:"add", name)`로 워크스페이스를 만든다(`~/.claude/sugo/work/<name>/workspace.json`).
- 이후 `sugo_add(projectPath, workspace:<이름>)`로 프로젝트를 이 워크스페이스에 등록한다.
- 워크스페이스는 태스크·체크포인트·스펙·이력·로드맵의 묶음 단위다. 생성 시 대시보드로 논블로킹 sync된다.

관련: `sugo_workspace(list/status/delete)`.
