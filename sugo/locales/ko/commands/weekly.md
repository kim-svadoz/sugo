---
description: 한 주의 주간 작업 보고서와 기술 학습 노트를 지금 만든다. 인자가 없으면 금~일은 그 주, 월~목은 지난주다.
argument-hint: "[2026-W42] [--force] [--render-only]"
---

주간 보고서를 만든다. 입력: $ARGUMENTS

## 절차
1. `node "${CLAUDE_PLUGIN_ROOT}/weekly/run.mjs" build $ARGUMENTS`를 실행한다. 몇 분 걸린다(Claude 2회 호출).
2. 마지막 줄(HTML 경로, 주제 수, 기술 수, 근거 없는 주제, 묶이지 않은 커밋, 비용)을 보고한다.
3. Console이 켜져 있으면 엔진이 보고서를 Console Weekly 화면에 올린다. 꺼져 있어도 `~/.weekly/reports/`의 로컬 HTML은 만든다.

## 규칙
- 엔진은 Python 3.12 이상이 필요하다. `run.mjs`가 Python이 없다고 하면 사용자에게 설치를 안내한다. 직접 설치하지 않는다.
- 기록이 바뀌지 않았으면 Claude를 다시 부르지 않는다. 다시 만들려면 `--force`, 화면만 다시 그리려면 `--render-only`.
- 보고서 문장을 직접 고치지 않는다. 고칠 문장은 `~/.weekly/reports/<주>.edits.json`에 적는다.
- 일정·모델·추가 저장소는 Console Preferences에서 정한다. 이 명령은 바꾸지 않는다.
