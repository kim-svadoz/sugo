"""The checker keeps only citable evidence and lists what no topic covers; the renderer hides empty rows."""

from __future__ import annotations

from weekly_report.render import render
from weekly_report.summarize import check, known_ids

WEEK = {"week": "2026-W42", "start": "2026-10-12", "end": "2026-10-16",
        "features": [{"task_id": "t-a", "workspace": "ws", "title": "feat-a", "status": "done",
                      "work_logs": [{"at": "2026-10-13T10:00+09:00", "summary": "s", "commits": [{"sha": "aaaaaaaaaaaa", "subject": "a"}]}],
                      "docs": [{"path": "/r/sugo/features/x/feat-a/prd.md", "name": "prd.md", "text": "t"}]}],
        "other_commits": [{"sha": "bbbbbbbbbbbb", "workspace": "ws", "day": "2026-10-14", "at": "2026-10-14T09:00+09:00", "subject": "b 커밋"},
                          {"sha": "cccccccccccc", "workspace": "ws", "day": "2026-10-15", "at": "2026-10-15T09:00+09:00", "subject": "c 커밋"}]}


TECH_ITEM = {"name": "Redis", "category": "데이터 저장소", "level": "기초", "definition": "d", "key_points": ["k"], "how_it_works": ["h"], "example": ["e"],
             "when_to_use": ["u"], "when_not_to_use": ["n"], "pitfalls": ["p"], "complements": [{"name": "c", "why": "w"}],
             "alternatives": [{"name": "a", "pros": "p", "cons": "c", "when": "w"}], "rationale_recorded": [], "rationale_general": "g",
             "quiz": [{"q": "왜 TTL을 두나", "a": "답"}], "keywords": ["kw"], "topics": ["주제"], "evidence": []}


def _report(**topic):
    t = {"title": "주제", "workspace": "ws", "category": "기능", "one_line": "한 줄", "context": "", "goal": "", "done": ["추가"], "results": [],
         "todo": [], "evidence": ["bbbbbbbbbbbb"], **topic}
    return {"headline": ["핵심"], "topics": [t], "next_week": [], "blocked": [], "missing_context": [], "last_week_plan": []}


def test_known_ids_cover_commits_docs_and_logs():
    assert {"aaaaaaaaaaaa", "bbbbbbbbbbbb", "/r/sugo/features/x/feat-a/prd.md", "log:t-a:0", "t-a"} <= known_ids(WEEK)


def test_made_up_evidence_is_dropped_and_the_topic_flagged():
    r = check(_report(evidence=["deadbeef0000", "없는 문서.md"]), WEEK)
    t = r["topics"][0]
    assert t["evidence"] == [] and t["unsupported"] is True and t["invalid_evidence"] == ["deadbeef0000", "없는 문서.md"]


def test_short_hash_is_resolved_and_uncited_commits_are_listed():
    r = check(_report(evidence=["bbbbbbb"]), WEEK)
    assert r["topics"][0]["evidence"] == ["bbbbbbbbbbbb"] and r["uncovered_commits"] == ["cccccccccccc"]


def test_model_text_is_masked_again():
    r = check(_report(one_line="계정 123456789012에 배포했다"), WEEK)
    assert r["topics"][0]["one_line"] == "계정 <ACCOUNT_ID>에 배포했다"


def test_render_hides_empty_rows_and_has_the_section_nav_and_the_list_link():
    html = render(check(_report(), WEEK), WEEK)
    assert "<dt>상황</dt>" not in html and "<dt>검증</dt>" not in html and "<dt>남은 일</dt>" not in html
    assert "설명이 부족한 작업" in html and "c 커밋" in html and "2026-10-12 (월) ~ 2026-10-16 (금)" in html
    assert 'href="index.html"' in html and '<h1>주간 작업</h1>' in html and 'href="#sec-topics"' in html and 'href="#sec-days"' in html
    assert 'href="#sec-blocked"' not in html  # empty sections are not in the nav


def test_decisions_are_highlighted_and_counted():
    html = render(check(_report(todo=[{"text": "안내 문구 확정", "kind": "결정 필요"}, {"text": "설정 등록", "kind": "작업"}]), WEEK), WEEK)
    assert 'class="todo"' in html and 'class="k k-결정"' in html and "결정 필요 1" in html and "[결정 필요] 안내 문구 확정" in html


def test_unknown_todo_kind_falls_back_to_work():
    r = check(_report(todo=[{"text": "x", "kind": "기타"}]), WEEK)
    assert r["topics"][0]["todo"] == [{"text": "x", "kind": "작업"}]


def test_tech_reasons_without_a_record_are_shown_as_unverified():
    from weekly_report.summarize import check_tech
    report = check(_report(), WEEK)
    tech = {"learning_summary": ["s"], "items": [dict(TECH_ITEM, rationale_recorded=[{"text": "기록 있음", "evidence": ["/r/sugo/features/x/feat-a/prd.md"]},
                                                                                   {"text": "지어낸 이유", "evidence": ["nope"]}],
                                                    topics=["주제", "없는 주제"], evidence=["bbbbbbb", "nope"])]}
    it = check_tech(tech, WEEK, report)["items"][0]
    assert [r["text"] for r in it["rationale_recorded"]] == ["기록 있음"] and it["rationale_unverified"] == ["지어낸 이유"]
    assert it["topics"] == ["주제"] and it["evidence"] == ["bbbbbbbbbbbb"] and it["id"] == "t0"


def test_edits_override_text_and_hide_topics_without_touching_the_saved_report():
    from weekly_report.build import apply_edits
    report = check(_report(), WEEK)
    report["topics"].append(dict(report["topics"][0], title="숨길 주제"))
    shown = apply_edits(report, {"headline": ["고친 핵심"], "hide": ["숨길 주제"], "topics": {"주제": {"one_line": "고친 한 줄"}}})
    assert shown["headline"] == ["고친 핵심"] and [t["title"] for t in shown["topics"]] == ["주제"] and shown["topics"][0]["one_line"] == "고친 한 줄"
    assert report["topics"][0]["one_line"] == "한 줄" and len(report["topics"]) == 2


def test_previous_plan_comes_from_the_latest_earlier_week_and_glossary_keeps_the_first_week(tmp_path):
    import json as _j
    from weekly_report.build import previous_plan, update_glossary
    (tmp_path / "2026-W40.report.json").write_text(_j.dumps({"next_week": [{"text": "옛 계획"}]}))
    (tmp_path / "2026-W41.report.json").write_text(_j.dumps({"next_week": [{"text": "지난주 계획"}]}))
    (tmp_path / "2026-W43.report.json").write_text(_j.dumps({"next_week": [{"text": "미래"}]}))
    assert previous_plan(tmp_path, "2026-W42") == ["지난주 계획"]
    g = update_glossary(tmp_path / "g.json", "2026-W41", {"items": [{"name": "Redis"}]})
    g = update_glossary(tmp_path / "g.json", "2026-W42", {"items": [{"name": "redis"}, {"name": "DynamoDB"}]})
    assert g["redis"]["first_week"] == "2026-W41" and g["redis"]["weeks"] == ["2026-W41", "2026-W42"] and g["dynamodb"]["first_week"] == "2026-W42"


def test_render_has_both_tabs_and_a_learning_card():
    report = check(_report(), WEEK)
    tech = {"learning_summary": ["배운 것"], "items": [dict(TECH_ITEM, id="t0", rationale_unverified=[])]}
    html = render(report, WEEK, tech, {"redis": {"name": "Redis", "first_week": "2026-W40", "weeks": ["2026-W40", "2026-W41", "2026-W42"]}})
    assert 'href="#report"' in html and 'href="#tech"' in html and 'id="v-tech"' in html and "이번 주 배운 것" in html
    assert 'href="#t0">Redis</a>' in html and 'href="#topic0">주제</a>' in html and "처음 정리 2026-W40 · 3번째 등장" in html
    assert "Q. 왜 TTL을 두나" in html and "<th>더 맞는 상황</th>" in html and "흔한 함정" in html and "일반론" in html


def test_routine_build_and_test_passes_are_not_reported_as_results():
    r = check(_report(results=["gradlew check 통과(단위 테스트 3건 추가, 계약 red→green)", "clean check 40/40 통과", "대시보드 리뷰 확인",
                               "검증 환경 주문 조회 실호출: 응답 정상 확인", "검증 환경 비교 테스트: 응답 형식 기존과 동일"]), WEEK)
    assert r["topics"][0]["results"] == ["검증 환경 주문 조회 실호출: 응답 정상 확인", "검증 환경 비교 테스트: 응답 형식 기존과 동일"]


def test_tech_tab_has_a_topic_filter_with_counts():
    report = check(_report(), WEEK)
    tech = {"learning_summary": [], "items": [dict(TECH_ITEM, id="t0", rationale_unverified=[])]}
    html = render(report, WEEK, tech, {})
    assert 'id="tsub"' in html and 'data-t="0">주제<span class="n">1</span>' in html and 'data-topics="0"' in html


def test_claude_call_is_retried_after_a_network_failure(monkeypatch):
    import json as _j
    import subprocess as sp
    from weekly_report import summarize as sm
    calls, waits = [], []

    class R:
        def __init__(self, code, out=""):
            self.returncode, self.stdout, self.stderr = code, out, "network unreachable"

    def fake_run(*a, **k):
        calls.append(1)
        return R(1) if len(calls) < 3 else R(0, _j.dumps({"structured_output": {"ok": True}, "total_cost_usd": 0.1}))

    monkeypatch.setattr(sp, "run", fake_run)
    monkeypatch.setattr(sm.time, "sleep", waits.append)
    assert sm._run("i", {}, {}, None)["ok"] is True and len(calls) == 3 and waits == [60, 180]
