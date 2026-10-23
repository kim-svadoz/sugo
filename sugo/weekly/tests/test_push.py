"""One-way push to the dashboard: only the drawn fields, edits applied, and a dashboard that is off or failing never breaks the caller."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from weekly_report import build, paths, push

WEEK = {"week": "2026-W41", "start": "2026-10-05", "end": "2026-10-11", "generated_at": "2026-10-16T10:14:00",
        "features": [], "other_commits": []}
REPORT = {"headline": ["핵심"],
          "topics": [{"title": "주제", "workspace": "ws", "category": "기능", "one_line": "한 줄", "context": "배경", "goal": "목표",
                      "done": ["추가"], "results": ["확인"], "todo": [{"text": "남은 일", "kind": "작업"}],
                      "evidence": ["bbbbbbbbbbbb", "/Users/me/secret/prd.md"], "invalid_evidence": [], "unsupported": False}],
          "next_week": [{"text": "다음", "evidence": ["bbbbbbbbbbbb"]}], "blocked": [{"text": "막힘", "evidence": []}],
          "missing_context": [{"ref": "x", "reason": "y"}], "last_week_plan": [{"text": "계획", "status": "done", "evidence": []}],
          "uncovered_commits": ["cccccccccccc"], "tech": {"items": [{"name": "Redis"}]}, "_llm": {"cost_usd": 1.0},
          "_source_digest": "abc", "_generated_at": "2026-10-16T10:24:00"}


class Dashboard:
    """A stand-in dashboard that records what it receives."""

    def __init__(self, status: int = 200):
        self.requests: list[dict] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_PUT(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"path": self.path, "auth": self.headers["Authorization"], "body": body})
                self.send_response(status)
                self.end_headers()

            def log_message(self, *args):
                pass

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def dashboard():
    d = Dashboard()
    yield d
    d.close()


def connect(monkeypatch, tmp_path, url: str, **dash):
    settings = tmp_path / "settings.json"
    settings.write_text(json.dumps({"dashboard": {"enabled": True, "apiUrl": url, "apiToken": "sugo_pat_x", **dash}}))
    monkeypatch.setattr(paths, "SUGO_SETTINGS", settings)


def test_sends_one_put_with_the_plugin_token_and_only_the_drawn_fields(monkeypatch, tmp_path, dashboard):
    connect(monkeypatch, tmp_path, dashboard.url + "/")

    assert push.push_report("2026-W41", WEEK, REPORT) is True

    (req,) = dashboard.requests
    assert req["path"] == "/api/weekly/reports/2026-W41" and req["auth"] == "Bearer sugo_pat_x"
    assert req["body"]["start"] == "2026-10-05" and req["body"]["end"] == "2026-10-11" and req["body"]["generatedAt"] == "2026-10-16T10:24:00"
    sent = req["body"]["report"]
    assert sent["headline"] == ["핵심"] and sent["next_week"] == [{"text": "다음"}] and sent["blocked"] == [{"text": "막힘"}]
    assert sent["last_week_plan"] == [{"text": "계획", "status": "done"}]
    assert sent["topics"][0]["todo"] == [{"text": "남은 일", "kind": "작업"}]
    flat = json.dumps(req["body"], ensure_ascii=False)
    assert "evidence" not in flat and "/Users/me/secret" not in flat and "Redis" in flat and "_llm" not in flat and "cccccccccccc" not in flat
    assert req["body"]["report"]["tech"]["items"][0]["name"] == "Redis"


@pytest.mark.parametrize("dash", [{"enabled": False}, {"apiToken": ""}, {"apiUrl": ""}])
def test_nothing_is_sent_when_the_connection_is_off(monkeypatch, tmp_path, dashboard, dash):
    connect(monkeypatch, tmp_path, dashboard.url, **dash)
    assert push.push_report("2026-W41", WEEK, REPORT) is False and dashboard.requests == []


def test_nothing_is_sent_without_sugo_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "SUGO_SETTINGS", tmp_path / "missing.json")
    assert push.connection() is None and push.push_report("2026-W41", WEEK, REPORT) is False


def test_a_dashboard_that_is_down_or_failing_does_not_raise(monkeypatch, tmp_path):
    logs: list[str] = []
    connect(monkeypatch, tmp_path, "http://127.0.0.1:1")
    assert push.push_report("2026-W41", WEEK, REPORT, logs.append) is False and "대시보드에 올리지 못했다" in logs[0]

    failing = Dashboard(status=500)
    try:
        connect(monkeypatch, tmp_path, failing.url)
        assert push.push_report("2026-W41", WEEK, REPORT, logs.append) is False and len(logs) == 2
    finally:
        failing.close()


def save(out, label, report=REPORT, edits=None):
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{label}.week.json").write_text(json.dumps(WEEK | {"week": label}))
    (out / f"{label}.report.json").write_text(json.dumps(report))
    if edits:
        (out / f"{label}.edits.json").write_text(json.dumps(edits))


def test_saved_weeks_are_sent_with_the_edits_applied(monkeypatch, tmp_path, dashboard):
    connect(monkeypatch, tmp_path, dashboard.url)
    out = tmp_path / "reports"
    save(out, "2026-W40")
    save(out, "2026-W41", edits={"headline": ["고친 요약"], "hide": ["주제"]})

    assert push.main(["--all", "--out", str(out)]) == 0

    by_week = {r["path"].rsplit("/", 1)[1]: r["body"]["report"] for r in dashboard.requests}
    assert set(by_week) == {"2026-W40", "2026-W41"}
    assert by_week["2026-W41"]["headline"] == ["고친 요약"] and by_week["2026-W41"]["topics"] == []
    assert by_week["2026-W40"]["headline"] == ["핵심"]


def test_main_reports_when_there_is_nowhere_to_send(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(paths, "SUGO_SETTINGS", tmp_path / "missing.json")
    assert push.main(["--all", "--out", str(tmp_path)]) == 1 and "꺼져 있다" in capsys.readouterr().out


def test_build_pushes_the_week_it_just_made_with_the_edits(monkeypatch, tmp_path, dashboard):
    connect(monkeypatch, tmp_path, dashboard.url)
    out = tmp_path / "reports"
    save(out, "2026-W41", report={k: v for k, v in REPORT.items() if k != "tech"}, edits={"headline": ["고친 요약"]})

    build.build_week("2026-W41", out, {}, render_only=True, log=lambda *_: None)

    (req,) = dashboard.requests
    assert req["path"].endswith("/2026-W41") and req["body"]["report"]["headline"] == ["고친 요약"]
