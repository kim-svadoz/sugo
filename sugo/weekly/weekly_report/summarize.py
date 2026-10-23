"""Turn week.json into report.json with Claude (headless `claude -p`, no tools, no MCP), then check every cited source.

The model writes the sentences; this module decides what is true: a topic may only cite ids that exist in week.json, and
every commit that no topic cites is listed separately, so nothing done in the week disappears from the report.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from collections.abc import Mapping

from . import paths
from .mask import mask

_S = {"type": "string"}
_SL = {"type": "array", "items": _S}
_EV = {"type": "array", "items": _S}
TODO_KINDS = ["결정 필요", "작업", "확인"]

SCHEMA = {
    "type": "object",
    "required": ["headline", "topics", "next_week", "blocked", "missing_context", "last_week_plan"],
    "properties": {
        "headline": {"type": "array", "items": _S, "maxItems": 3},
        "topics": {"type": "array", "items": {"type": "object",
            "required": ["title", "workspace", "category", "one_line", "context", "goal", "done", "results", "todo", "evidence"],
            "properties": {"title": _S, "workspace": _S, "category": {"type": "string", "enum": ["기능", "개선", "수정", "운영", "도구"]},
                           "one_line": _S, "context": _S, "goal": _S, "done": _SL, "results": _SL,
                           "todo": {"type": "array", "items": {"type": "object", "required": ["text", "kind"],
                                                               "properties": {"text": _S, "kind": {"type": "string", "enum": TODO_KINDS}}}},
                           "evidence": _EV}}},
        "next_week": {"type": "array", "items": {"type": "object", "required": ["text", "evidence"], "properties": {"text": _S, "evidence": _EV}}},
        "blocked": {"type": "array", "items": {"type": "object", "required": ["text", "evidence"], "properties": {"text": _S, "evidence": _EV}}},
        "missing_context": {"type": "array", "items": {"type": "object", "required": ["ref", "reason"], "properties": {"ref": _S, "reason": _S}}},
        "last_week_plan": {"type": "array", "items": {"type": "object", "required": ["text", "status", "evidence"],
                                                      "properties": {"text": _S, "status": {"type": "string", "enum": ["완료", "진행", "미착수", "판단 불가"]},
                                                                     "evidence": _EV}}},
    },
}

STYLE = """문장 규칙: ASD-STE100 원칙 기반 한국어 + 보고서 개조식
- 모든 항목은 개조식이다. 명사로 끝낸다(예: "추가", "적용", "확인", "통과", "결정 대기", "미확인"). "~했다", "~이다", "~함", "~됨"으로 끝내지 않는다.
- 한 항목에 한 사실. 순서는 "대상 → 조치 → 결과·수치"다. 예: "로그인 실패 제한: 5회 초과 시 10분 잠금", "주문 조회 API 응답 시간: 캐시 적용 후 절반으로 감소".
- 기록에 나온 도메인 용어와 코드 이름(모듈, 엔드포인트, 설정 키, 테이블·클래스 이름)을 그대로 쓴다. 같은 대상에는 끝까지 같은 용어를 쓴다.
- 의도와 맥락이 드러나게 쓴다. 무엇을 바꿨는지만이 아니라 왜(문제·목적)와 그래서 무엇이 달라졌는지(결과)를 항목 단위로 잇는다.
- 화살표(→), 콜론(:), 가운뎃점(·)으로 관계를 짧게 표현한다. 접속사로 긴 문장을 만들지 않는다.
- 수사, 강조, 감탄, 홍보 표현을 쓰지 않는다("성공적으로", "대폭", "획기적", "효과적으로" 금지).
- "입력", "JSON", "기록되지 않았다" 같은 작성 과정의 말을 쓰지 않는다. 마스킹 표시(<ACCOUNT_ID>, <SECRET> 등)는 그대로 둔다."""

INSTRUCTION = f"""너는 한 개발자의 주간 작업 보고서를 쓴다. 표준 입력의 JSON이 이번 주(월~금) 작업 기록의 전부다.

사실 규칙
- 기록에 있는 사실만 쓴다. 기록에 없는 수치, 이유, 효과, 계획을 만들지 않는다.
- 모든 topic의 evidence에는 기록의 id(커밋 sha 12자리, 문서 path, log id)를 1개 이상 넣는다. 기록에 없는 id를 쓰지 않는다.

묶는 규칙
- 커밋 하나당 topic 하나가 아니다. 같은 기능·목적의 커밋과 문서를 한 topic으로 묶는다. topic은 3~8개다.
- 중요한 순서로 정렬한다: 서비스·사용자 영향 기능 > 품질·운영 개선 > 도구·내부 작업.
- workspace는 기록의 workspace 값을 쓴다.
- 커밋 제목만 있고 목적을 알 수 없는 작업은 missing_context에 ref(sha)와 이유를 적는다.

칸 규칙
- headline: 이번 주 핵심 3항목. "대상: 결과" 형식.
- one_line: 팀 보고에 붙일 한 줄(50자 이내).
- context: 작업 전 상황·문제 1항목. goal: 이 작업의 목적 1항목. 근거가 없으면 빈 문자열.
- done: 한 일 2~5항목. 테스트 코드 추가·수정만으로는 항목을 만들지 않는다.
- results: 동작을 실제로 확인한 결과 0~3항목(검증·운영 환경 실호출, 실데이터 조회, 기존 대비 비교, 배포·반영 여부). 근거가 없으면 빈 배열.
  빌드·테스트 통과(gradlew check, pytest, 단위·계약 테스트 건수, red→green), 테스트 코드 확인, 리뷰 확인은 당연한 절차라 쓰지 않는다. headline과 one_line에도 쓰지 않는다.
- todo: 남은 일. 기록(진행 중 태스크, work-result의 남은 일·후속, PRD의 범위 밖)에 있을 때만 쓴다. 항목마다 kind를 고른다.
  결정 필요 = 팀·담당자·사용자의 결정이나 합의가 있어야 진행할 수 있는 것(정책, 방식 선택, 문구, 승인).
  작업 = 이미 정해진 후속 작업. 확인 = 검증·관찰이 남은 것.
- next_week: 다음 주에 할 일. blocked: 결정·외부 요인 때문에 막힌 것.
- last_week_plan: 기록의 last_week_plan(지난주 보고서의 다음 주 항목)마다 상태를 판정한다.
  완료(끝낸 근거 있음), 진행(손댄 근거는 있으나 미완료), 미착수(관련 기록 없음), 판단 불가. 완료·진행은 evidence에 이번 주 id를 넣는다. 기록에 없으면 빈 배열.

{STYLE}"""


def _compact(week: dict, last_plan: list[str] | None = None) -> dict:
    """What the model reads: the week's records with ids it can cite."""
    return {"last_week_plan": last_plan or [],
        "week": week["week"], "start": week["start"], "end": week["end"],
        "features": [{"task_id": f["task_id"], "workspace": f["workspace"], "title": f["title"], "status": f["status"], "summary": f.get("summary"),
                      "work_logs": [{"id": f"log:{f['task_id']}:{i}", "at": l["at"], "summary": l.get("summary"),
                                     "commits": [{"sha": c["sha"], "subject": c.get("subject"), "body": c.get("body")} for c in l.get("commits", [])]}
                                    for i, l in enumerate(f.get("work_logs", []))],
                      "docs": [{"path": d["path"], "name": d["name"], "text": d["text"]} for d in f.get("docs", [])]} for f in week["features"]],
        "commits": [{"sha": o["sha"], "workspace": o["workspace"], "day": o["day"], "subject": o["subject"], "body": o.get("body"),
                     "stat": o.get("stat"), "files": o.get("files", [])[:15]} for o in week["other_commits"]],
        "in_progress": week.get("in_progress", []),
        "checkpoints": week.get("checkpoints", []),
    }


def known_ids(week: dict) -> set[str]:
    ids = {o["sha"] for o in week["other_commits"]}
    for f in week["features"]:
        ids.add(f["task_id"])
        ids |= {d["path"] for d in f.get("docs", [])}
        for i, l in enumerate(f.get("work_logs", [])):
            ids.add(f"log:{f['task_id']}:{i}")
            ids |= {c["sha"] for c in l.get("commits", [])}
    return ids


def _resolver(week: dict):
    """The cited id itself, or the one id a short commit hash (7+ chars) starts; None for anything not in the records."""
    ids = known_ids(week)

    def fix(e: str) -> str | None:
        if e in ids:
            return e
        hits = [i for i in ids if len(e) >= 7 and i.startswith(e)]
        return hits[0] if len(hits) == 1 else None
    return fix


RETRY_WAIT = (60, 180)  # seconds; right after waking from sleep the network may not be up yet


def _run(instruction: str, schema: dict, payload: dict, model: str | None, timeout: int = 900) -> dict:
    """One headless Claude call: no tools, no MCP, no user settings; the answer must match ``schema``. Retried twice on failure."""
    cmd = ["claude", "-p", instruction, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
           "--output-format", "json", "--json-schema", json.dumps(schema, ensure_ascii=False)]
    if model:
        cmd += ["--model", model]
    for attempt in range(len(RETRY_WAIT) + 1):
        try:
            return _once(cmd, payload, model, timeout)
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            if attempt == len(RETRY_WAIT):
                raise
            print(f"claude 호출 실패, {RETRY_WAIT[attempt]}초 뒤 다시 시도: {mask(str(exc))[:200]}", flush=True)
            time.sleep(RETRY_WAIT[attempt])


def claude_env(base: Mapping[str, str] | None = None) -> dict[str, str]:
    """Environment for `claude`. The scheduled run has no login, so use the long-lived token the user saved (`claude setup-token`)
    unless the environment already carries one."""
    env = dict(os.environ if base is None else base)
    if env.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return env
    try:
        token = paths.CLAUDE_TOKEN.read_text(encoding="utf-8").strip()
    except OSError:
        return env
    if token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = token
    return env


def _reason(out: subprocess.CompletedProcess) -> str:
    """Why `claude -p` failed. With --output-format json the reason is in stdout ({"result": ...}); stderr is usually empty."""
    try:
        reason = json.loads(out.stdout).get("result")
    except (json.JSONDecodeError, AttributeError):
        reason = None
    return str(reason or out.stderr[-500:] or out.stdout[-500:])


def _once(cmd: list[str], payload: dict, model: str | None, timeout: int) -> dict:
    out = subprocess.run(cmd, input=json.dumps(payload, ensure_ascii=False), capture_output=True, text=True, timeout=timeout, env=claude_env())
    if out.returncode != 0:
        raise RuntimeError(f"claude 실행 실패(코드 {out.returncode}): {mask(_reason(out)[:500])}")
    res = json.loads(out.stdout)
    if res.get("is_error") or not isinstance(res.get("structured_output"), dict):
        raise RuntimeError(f"claude 응답 오류: {mask(str(res.get('result'))[:500])}")
    body = res["structured_output"]
    body["_llm"] = {"model": next(iter(res.get("modelUsage") or {}), model), "cost_usd": res.get("total_cost_usd")}
    return body


def call_claude(week: dict, model: str | None = None, last_plan: list[str] | None = None) -> dict:
    return _run(INSTRUCTION, SCHEMA, _compact(week, last_plan), model)


# routine checks every change goes through; they are not a result worth reporting
ROUTINE = re.compile(r"gradlew|gradle|pytest|\bcheck\b|\d+/\d+\s*(통과|pass)|단위\s*테스트|계약\s*테스트|red\s*→\s*green|red→green|테스트\s*(코드\s*)?(통과|추가|확인|수정)|리뷰\s*확인|lint", re.I)


def check(report: dict, week: dict) -> dict:
    """Keep only citable evidence, flag topics left without any, list the commits no topic covers, mask the model's text."""
    fix = _resolver(week)
    cited = set()
    for t in report["topics"]:
        ev = [fix(e) for e in t.get("evidence", [])]
        t["invalid_evidence"] = [e for e, v in zip(t.get("evidence", []), ev) if v is None]
        t["evidence"] = [v for v in ev if v]
        t["unsupported"] = not t["evidence"]
        cited |= set(t["evidence"])
        for k in ("title", "one_line", "context", "goal"):
            t[k] = mask(t.get(k) or "")
        t["done"] = [mask(x) for x in t.get("done", [])]
        t["results"] = [mask(x) for x in t.get("results", []) if not ROUTINE.search(x)]
        t["todo"] = [{"text": mask(x["text"]), "kind": x["kind"] if x.get("kind") in TODO_KINDS else "작업"} for x in t.get("todo", [])]
    report.setdefault("last_week_plan", [])
    for group in ("next_week", "blocked", "last_week_plan"):
        for x in report[group]:
            x["text"] = mask(x["text"])
            x["evidence"] = [v for v in (fix(e) for e in x.get("evidence", [])) if v]
    report["headline"] = [mask(s) for s in report["headline"]]
    report["uncovered_commits"] = [o["sha"] for o in week["other_commits"] if o["sha"] not in cited]
    return report


def _pairs(*keys: str) -> dict:
    return {"type": "array", "items": {"type": "object", "required": list(keys), "properties": {k: _S for k in keys}}}


TECH_SCHEMA = {
    "type": "object", "required": ["learning_summary", "items"],
    "properties": {
        "learning_summary": {"type": "array", "items": _S, "maxItems": 3},
        "items": {"type": "array", "items": {"type": "object",
            "required": ["name", "category", "level", "definition", "key_points", "how_it_works", "example", "when_to_use", "when_not_to_use",
                         "pitfalls", "complements", "alternatives", "rationale_recorded", "rationale_general", "quiz", "keywords", "topics", "evidence"],
            "properties": {
                "name": _S,
                "category": {"type": "string", "enum": ["언어·런타임", "프레임워크·라이브러리", "데이터 저장소", "메시징·스트리밍", "인프라·배포", "설계·패턴", "테스트·검증", "도구"]},
                "level": {"type": "string", "enum": ["기초", "중급", "심화"]},
                "definition": _S, "key_points": _SL, "how_it_works": _SL, "example": _SL,
                "when_to_use": _SL, "when_not_to_use": _SL, "pitfalls": _SL,
                "complements": _pairs("name", "why"),
                "alternatives": _pairs("name", "pros", "cons", "when"),
                "rationale_recorded": {"type": "array", "items": {"type": "object", "required": ["text", "evidence"], "properties": {"text": _S, "evidence": _EV}}},
                "rationale_general": _S,
                "quiz": _pairs("q", "a"),
                "keywords": _SL, "topics": _SL, "evidence": _EV}}},
    },
}

TECH_INSTRUCTION = f"""너는 한 개발자의 주간 기술 학습 노트를 쓴다. 표준 입력의 JSON에 이번 주 작업 기록(records)과 주간 작업 주제(topics)가 있다.
목적은 학습이다. 읽는 사람이 이번 주 작업에 쓴 기술의 개념을 이해하고, 다른 선택지와 비교하고, 스스로 점검할 수 있게 쓴다.

고르는 규칙
- 이번 주 작업에서 실제로 쓴 기술 4~10개를 고른다. 기록(코드 경로, 커밋, PRD, work-result)에 근거가 있어야 한다.
- 라이브러리·프레임워크, 데이터 저장소, 스트리밍, 인프라, 설계 패턴, 테스트 기법 수준이다. Git, IDE 같은 일상 도구는 고르지 않는다.
- known_names에 같은 기술이 있으면 그 이름을 그대로 쓴다.

칸 규칙
- learning_summary: 이번 주에 배운 것 3항목. 기술 이름이 아니라 얻은 이해를 쓴다.
- level: 이 기술을 처음 배우는 개발자 기준 난이도.
- definition: 한 줄 정의.
- key_points: 핵심 개념 3~5항목. 이 기술을 이해하는 데 꼭 필요한 개념만 쓴다.
- how_it_works: 동작 원리 2~4항목. 내부에서 무엇이 어떤 순서로 일어나는지 쓴다.
- example: 이번 작업에서 본 예 1~3항목. 클래스·테이블·엔드포인트 이름을 그대로 쓴다.
- when_to_use / when_not_to_use: 맞는 상황 2~3항목, 피해야 하는 상황 1~3항목.
- pitfalls: 흔한 함정 1~3항목. 이번 작업 기록에 관련 사례가 있으면 그것을 먼저 쓴다.
- complements: 보완재 1~3개와 이유. alternatives: 대체재 1~3개. 각각 pros(장점), cons(단점), when(그것이 더 맞는 상황).
- rationale_recorded: 기록(PRD, 체크포인트, 커밋 본문, work-result)에 적힌 선택 이유만 쓴다. 항목마다 evidence에 그 기록의 id를 넣는다. 없으면 빈 배열.
- rationale_general: 이 기술이 보통 선택되는 이유 1항목. 이번 결정의 기록이 아닌 일반론이다.
- quiz: 자가 점검 문제 2~3개. 외운 것이 아니라 이해했는지 묻는다(왜, 언제, 무엇이 달라지는가). a는 2~3항목 분량의 답.
- keywords: 더 찾아볼 키워드 3~5개.
- topics: 관련 주제의 title을 topics에서 그대로 고른다. evidence: 이 기술을 썼다는 근거 id. 기록에 없는 id를 쓰지 않는다.

{STYLE}
- definition, key_points, how_it_works는 일반 지식이다. 확실하지 않은 내용은 쓰지 않는다."""


def call_tech(week: dict, report: dict, known_names: list[str], model: str | None = None) -> dict:
    payload = {"records": _compact(week), "topics": [{"title": t["title"], "one_line": t["one_line"], "done": t["done"]} for t in report["topics"]],
               "known_names": known_names}
    return _run(TECH_INSTRUCTION, TECH_SCHEMA, payload, model)


def check_tech(tech: dict, week: dict, report: dict) -> dict:
    """Recorded reasons must cite a real record; a reason without one is shown as unverified, never as the user's decision."""
    fix, titles = _resolver(week), {t["title"] for t in report["topics"]}
    for i, it in enumerate(tech["items"]):
        it["id"] = f"t{i}"
        it["evidence"] = [v for v in (fix(e) for e in it.get("evidence", [])) if v]
        kept, dropped = [], []
        for r in it.get("rationale_recorded", []):
            r["evidence"] = [v for v in (fix(e) for e in r.get("evidence", [])) if v]
            r["text"] = mask(r["text"])
            (kept if r["evidence"] else dropped).append(r)
        it["rationale_recorded"], it["rationale_unverified"] = kept, [r["text"] for r in dropped]
        it["topics"] = [t for t in it.get("topics", []) if t in titles]
        for k in ("definition", "rationale_general"):
            it[k] = mask(it.get(k) or "")
        for k in ("key_points", "how_it_works", "example", "when_to_use", "when_not_to_use", "pitfalls", "keywords"):
            it[k] = [mask(x) for x in it.get(k, [])]
    tech["learning_summary"] = [mask(x) for x in tech.get("learning_summary", [])]
    return tech
