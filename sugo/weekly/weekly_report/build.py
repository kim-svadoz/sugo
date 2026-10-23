"""Collect -> summarize (Claude) -> tech report (Claude) -> render, for one week.

    python -m weekly_report.build                 # Fri-Sun: this week, Mon-Thu: last week
    python -m weekly_report.build --week 2026-W42
    python -m weekly_report.build --render-only   # redraw HTML from saved files (no Claude call)

Files in ~/.weekly/reports/:
  <week>.week.json    records of the week (masked)
  <week>.report.json  Claude's report and tech report, checked against the records
  <week>.edits.json   your corrections; applied on every render, never overwritten
  <week>.html         the page;  index.html lists every week;  tech-glossary.json keeps the week each technology first appeared
Claude is called again only when the records changed, unless --force.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from . import collect as collect_mod
from .index import write_index
from .push import push_report
from .render import _norm, render
from .summarize import call_claude, call_tech, check, check_tech


def _digest(week: dict, last_plan: list[str]) -> str:
    body = {k: v for k, v in week.items() if k != "generated_at"} | {"last_plan": last_plan}
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _write(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def previous_plan(out: Path, label: str) -> list[str]:
    """The "next week" items of the latest earlier report."""
    earlier = sorted(p for p in out.glob("*.report.json") if p.name.split(".")[0] < label)
    return [x["text"] for x in (_read(earlier[-1]) or {}).get("next_week", [])] if earlier else []


def apply_edits(report: dict, edits: dict | None) -> dict:
    """{"headline": [...], "hide": ["주제 제목"], "topics": {"주제 제목": {"one_line": "...", "done": [...]}}}"""
    if not edits:
        return report
    r = json.loads(json.dumps(report))
    if edits.get("headline"):
        r["headline"] = edits["headline"]
    hide = set(edits.get("hide", []))
    r["topics"] = [t | edits.get("topics", {}).get(t["title"], {}) for t in r["topics"] if t["title"] not in hide]
    return r


def update_glossary(path: Path, label: str, tech: dict) -> dict:
    g = _read(path) or {}
    for it in tech.get("items", []):
        e = g.setdefault(_norm(it["name"]), {"name": it["name"], "first_week": label})
        e["weeks"] = sorted(set(e.get("weeks", [e["first_week"]])) | {label})
        e["first_week"] = e["weeks"][0]
    _write(path, g)
    return g


def freshness(label: str, out: Path, cfg: dict) -> dict:
    """Whether the saved report still matches the records (collects again, no Claude call)."""
    week = collect_mod.collect(label, config=cfg)
    report = _read(out / f"{label}.report.json")
    has_records = bool(week["features"] or week["other_commits"])
    if not report:
        return {"week": label, "report": False, "fresh": None, "has_records": has_records}
    return {"week": label, "report": True, "has_records": has_records,
            "fresh": report.get("_source_digest") == _digest(week, previous_plan(out, label))}


def build_week(label: str, out: Path, cfg: dict, force: bool = False, render_only: bool = False, log=print) -> dict:
    """Make (or redraw) one week's files; returns a short summary."""
    out.mkdir(parents=True, exist_ok=True)
    p = {x: out / f"{label}.{x}" for x in ("week.json", "report.json", "edits.json", "html")}
    glossary_path = out / "tech-glossary.json"
    if render_only:
        week, report = _read(p["week.json"]), _read(p["report.json"])
        glossary = _read(glossary_path) or {}
    else:
        week = collect_mod.collect(label, config=cfg)
        _write(p["week.json"], week)
        last_plan = previous_plan(out, label)
        digest, old = _digest(week, last_plan), _read(p["report.json"])
        glossary = _read(glossary_path) or {}
        if old and old.get("_source_digest") == digest and old.get("tech") and not force:
            report = old
            log("기록이 바뀌지 않아 Claude 호출을 건너뛰었다(--force로 다시 생성)")
        elif not week["features"] and not week["other_commits"]:
            report = {"headline": ["이번 주 기록 없음"], "topics": [], "next_week": [], "blocked": [], "missing_context": [],
                      "uncovered_commits": [], "last_week_plan": [], "tech": {"items": []}, "_source_digest": digest}
        else:
            log("주간 작업 정리 중(Claude)")
            report = check(call_claude(week, cfg.get("model"), last_plan), week)
            log("기술 학습 정리 중(Claude)")
            known = sorted({v["name"] for v in glossary.values()})
            report["tech"] = check_tech(call_tech(week, report, known, cfg.get("model")), week, report)
            report["_source_digest"] = digest
        report["_generated_at"] = collect_mod.datetime.now(collect_mod.KST).isoformat(timespec="seconds")
        _write(p["report.json"], report)
        glossary = update_glossary(glossary_path, label, report["tech"])
    shown = apply_edits(report, _read(p["edits.json"]))
    p["html"].write_text(render(shown, week, report.get("tech"), glossary), encoding="utf-8")
    write_index(out, cfg)
    push_report(label, week, shown, log)
    cost = sum(((x or {}).get("_llm") or {}).get("cost_usd") or 0 for x in (report, report.get("tech")))
    return {"html": str(p["html"]), "topics": len(report["topics"]), "tech": len(report.get("tech", {}).get("items", [])),
            "unsupported": sum(1 for t in report["topics"] if t.get("unsupported")), "uncovered": len(report.get("uncovered_commits", [])), "cost": cost}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--week")
    ap.add_argument("--out", type=Path, default=collect_mod.OUT_DIR)
    ap.add_argument("--force", action="store_true", help="call Claude even if the records did not change")
    ap.add_argument("--render-only", action="store_true")
    args = ap.parse_args(argv)
    label = collect_mod.week_range(args.week)[0]
    r = build_week(label, args.out, collect_mod.load_config(), args.force, args.render_only)
    print(f"{r['html']}  주제 {r['topics']} · 기술 {r['tech']} · 근거 없는 주제 {r['unsupported']} · 묶이지 않은 커밋 {r['uncovered']} · 비용 ${r['cost']:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
