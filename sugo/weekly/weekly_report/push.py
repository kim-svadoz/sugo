"""Send a finished week to the Sugo dashboard (one way: weekly -> dashboard).

Uses the connection sugo keeps in ~/.claude/sugo/settings.json. Without it, or when the dashboard is down,
nothing is sent and the build is not affected.

    python -m weekly_report.push --week 2026-W41
    python -m weekly_report.push --all           # every saved week (the dashboard keeps one copy per week)
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from . import collect as collect_mod
from . import paths

TIMEOUT_SECONDS = 5
TOPIC_KEYS = ("title", "workspace", "category", "one_line", "context", "goal", "done", "results")


def connection() -> tuple[str, str] | None:
    """(api url, token) when sugo has the dashboard switched on, else None."""
    try:
        d = json.loads(paths.SUGO_SETTINGS.read_text(encoding="utf-8")).get("dashboard") or {}
    except (OSError, ValueError):
        return None
    if d.get("enabled") is True and d.get("apiUrl") and d.get("apiToken"):
        return str(d["apiUrl"]).rstrip("/"), str(d["apiToken"])
    return None


def _items(rows: list[dict], *keys: str) -> list[dict]:
    return [{k: r[k] for k in keys if k in r} for r in rows]


def _public(value):
    """Keep display content while removing local evidence and model bookkeeping."""
    if isinstance(value, list):
        return [_public(item) for item in value]
    if isinstance(value, dict):
        return {key: _public(item) for key, item in value.items()
                if key not in {"evidence", "invalid_evidence", "uncovered_commits", "missing_context"}
                and not key.startswith("_")}
    return value


def payload(week: dict, report: dict) -> dict:
    """Only what the dashboard draws. Evidence (commit ids, local doc paths), the tech notes and model bookkeeping stay here."""
    topics = [{**{k: t[k] for k in TOPIC_KEYS if k in t}, "todo": _items(t.get("todo", []), "text", "kind")} for t in report.get("topics", [])]
    shown = {"headline": report.get("headline", []), "topics": topics,
             "next_week": _items(report.get("next_week", []), "text"), "blocked": _items(report.get("blocked", []), "text"),
             "last_week_plan": _items(report.get("last_week_plan", []), "text", "status"),
             "tech": _public(report.get("tech", {}))}
    return {"start": week["start"], "end": week["end"], "generatedAt": report.get("_generated_at") or week["generated_at"], "report": shown}


def push_report(label: str, week: dict, report: dict, log=print) -> bool:
    """PUT one week. A dashboard that is off or failing never fails the caller."""
    conn = connection()
    if conn is None:
        return False
    url, token = conn
    req = urllib.request.Request(f"{url}/api/weekly/reports/{label}", method="PUT",
                                 data=json.dumps(payload(week, report), ensure_ascii=False).encode("utf-8"),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS):
            return True
    except (urllib.error.URLError, OSError) as e:
        log(f"대시보드에 올리지 못했다(보고서는 그대로다): {e}")
        return False


def _load(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def push_saved(label: str, out: Path, log=print) -> bool:
    from .build import apply_edits  # build imports this module, so import it when called

    week, report = _load(out / f"{label}.week.json"), _load(out / f"{label}.report.json")
    if not week or not report:
        log(f"{label}: 저장된 보고서가 없다")
        return False
    return push_report(label, week, apply_edits(report, _load(out / f"{label}.edits.json")), log)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--week")
    ap.add_argument("--all", action="store_true", help="every saved week")
    ap.add_argument("--out", type=Path, default=collect_mod.OUT_DIR)
    args = ap.parse_args(argv)
    if connection() is None:
        print("대시보드 연결이 꺼져 있다(~/.claude/sugo/settings.json의 dashboard). 보낼 곳이 없다.")
        return 1
    labels = sorted(p.name.split(".")[0] for p in args.out.glob("*.report.json")) if args.all else [collect_mod.week_range(args.week)[0]]
    sent = [label for label in labels if push_saved(label, args.out)]
    print(f"대시보드에 올린 주: {len(sent)}/{len(labels)}")
    return 0 if len(sent) == len(labels) else 1


if __name__ == "__main__":
    sys.exit(main())
