"""Collect one week (Mon-Fri, KST) of sugo work records into a single JSON file. No AI: the same input gives the same output.

    python -m weekly_report.collect                  # the latest finished week (Mon-Fri)
    python -m weekly_report.collect --week 2026-W42  # a given ISO week

Sources (read only): ~/.claude/sugo/work/<workspace>/{workspace,tasks}.json, history/*.json, checkpoints/*.md,
~/.claude/sugo/sessions/plan-*.json, the PRD folder of each task, and `git show` of recorded commits.
Every text is masked (weekly_report.mask) before it is written.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from . import paths
from .mask import mask

KST = timezone(timedelta(hours=9))
SUGO_HOME = Path(os.environ.get("SUGO_HOME", Path.home() / ".claude" / "sugo"))
OUT_DIR = paths.REPORTS
CONFIG = paths.CONFIG
DOC_LIMIT = 8000  # characters per document; PRDs and work results are long


def week_range(week: str | None, today: date | None = None) -> tuple[str, datetime, datetime]:
    """(ISO week label, Monday 00:00 KST, Saturday 00:00 KST). Without ``week``: the latest week that has reached its Friday
    (Friday to Sunday -> this week; Monday to Thursday -> last week), so a Friday-evening run reports its own week and a run
    that wakes up late on Monday still makes the missed week."""
    if week:
        y, w = week.upper().split("-W")
        monday = date.fromisocalendar(int(y), int(w), 1)
    else:
        ref = today or datetime.now(KST).date()
        monday = ref - timedelta(days=ref.weekday()) - (timedelta(days=0) if ref.weekday() >= 4 else timedelta(days=7))
    y, w, _ = monday.isocalendar()
    start = datetime.combine(monday, time(0), KST)
    return f"{y}-W{w:02d}", start, start + timedelta(days=5)


def _ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=KST)


def _kst(t: datetime) -> str:
    return t.astimezone(KST).isoformat(timespec="minutes")


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _git(repo: str, *args: str) -> str | None:
    try:
        return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, timeout=30, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        return None


def _commit(repos: list[str], sha: str) -> dict | None:
    """Subject, body and diffstat of a commit from whichever workspace repo has it."""
    for repo in repos:
        out = _git(repo, "show", "-s", "--format=%s%x00%b", sha)
        if out is None:
            continue
        subject, _, body = out.partition("\x00")
        stat = _git(repo, "show", "--shortstat", "--format=", sha) or ""
        return {"sha": sha[:12], "repo": Path(repo).name, "subject": subject.strip(), "body": body.strip(), "stat": stat.strip()}
    return None


class _Prefix(set):
    """A set of 12-char hash prefixes that also answers for full hashes."""

    def __init__(self, shas=()) -> None:
        super().__init__(s[:12] for s in shas)

    def __contains__(self, sha) -> bool:
        return super().__contains__(sha[:12])

    def add(self, sha) -> None:
        super().add(sha[:12])


def task_status(task: dict, runs: list[dict]) -> str:
    """The task's status, corrected when sugo left it in_progress after a patch run was cancelled:
    every run of the task is DONE or cancelled and at least one is DONE -> "done_patch_cancelled"."""
    st = task.get("status")
    if st != "in_progress" or not runs:
        return st
    if all(r.get("cancelledAt") or r.get("state") == "DONE" for r in runs) and any(r.get("state") == "DONE" and not r.get("cancelledAt") for r in runs):
        return "done_patch_cancelled"
    return st


def load_config(path: Path = CONFIG) -> dict:
    """{"git_repos": [{"path": "~/dev/x", "name": "x", "exclude_subject": ["^auto: "]}]}; missing file -> no extra repos."""
    return _load(path) or {}


def _top(path: Path) -> Path | None:
    top = (_git(str(path), "rev-parse", "--show-toplevel") or "").strip() if path.is_dir() else ""
    return Path(top).resolve() if top else None


def git_sources(cfg: dict, sugo_home: Path = SUGO_HOME) -> list[dict]:
    """Every repository whose commits are read: the git repositories of all sugo workspace projects (automatic), then the
    extra repositories in the config. A repository listed twice is read once; the config adds its excluded subjects.
    sugo's own history records only part of these commits, so git is the source of truth for commits."""
    out: dict[Path, dict] = {}
    for f in sorted((sugo_home / "work").glob("*/workspace.json")):
        ws = _load(f) or {}
        for p in ws.get("projects", []):
            top = _top(Path(p).expanduser())
            if top and top not in out:
                out[top] = {"path": str(top), "name": ws.get("name", f.parent.name), "from": "sugo", "exclude_subject": []}
    for r in cfg.get("git_repos", []):
        top = _top(Path(r["path"]).expanduser())
        if top is None:
            continue
        if top in out:
            out[top]["exclude_subject"] = out[top]["exclude_subject"] + r.get("exclude_subject", [])
        else:
            out[top] = {"path": str(top), "name": r.get("name", top.name), "from": "config", "exclude_subject": r.get("exclude_subject", []),
                        "authors": r.get("authors")}
    return list(out.values())


def _git_commits(sources: list[dict], start: datetime, end: datetime, seen: set[str], m) -> list[dict]:
    """The user's own commits in each source repository. Merge commits and excluded subjects are skipped."""
    out = []
    for r in sources:
        repo = r["path"]
        authors = r.get("authors") or [a for a in [(_git(repo, "config", "user.email") or "").strip()] if a]
        skip = [re.compile(x) for x in r.get("exclude_subject", [])]
        args = ["log", "--all", "--no-merges", f"--since={start.isoformat()}", f"--until={end.isoformat()}", "--format=%H%x1f%aI%x1f%s%x1f%b%x1e"]
        args += [f"--author={a}" for a in authors]
        log = _git(repo, *args)
        if log is None:
            continue
        for rec in log.split("\x1e"):
            parts = rec.strip("\n").split("\x1f")
            if len(parts) < 4:
                continue
            sha, at, subject, body = parts
            t = _ts(at)
            if sha in seen or not (t and start <= t < end) or any(x.search(subject) for x in skip):
                continue
            seen.add(sha)
            files = [f for f in (_git(repo, "show", "--name-only", "--format=", sha) or "").splitlines() if f]
            out.append({"source": "git", "workspace": r["name"], "day": _kst(t)[:10], "at": _kst(t),
                        "subject": m(subject.strip()), "body": m(body.strip()), "stat": (_git(repo, "show", "--shortstat", "--format=", sha) or "").strip(),
                        "repo": Path(repo).name, "sha": sha[:12], "files": files})
    return out


def _docs(prd_ref: str | None, counts: dict) -> list[dict]:
    """The Markdown files of a task's feature folder (PRD, patch PRDs, work results), masked and truncated."""
    if not prd_ref:
        return []
    folder = Path(prd_ref).parent
    if not folder.is_dir():
        return []
    out = []
    for f in sorted(folder.glob("*.md")):
        text = f.read_text(encoding="utf-8", errors="replace")
        out.append({"name": f.name, "path": str(f), "chars": len(text), "truncated": len(text) > DOC_LIMIT,
                    "text": mask(text[:DOC_LIMIT], counts)})
    return out


def collect(week: str | None = None, sugo_home: Path = SUGO_HOME, today: date | None = None, config: dict | None = None) -> dict:
    label, start, end = week_range(week, today)
    inside = lambda t: t is not None and start <= t < end  # noqa: E731
    counts: dict[str, int] = {}
    m = lambda t: mask(t, counts)  # noqa: E731
    features, other, in_progress, checkpoints, sessions = [], [], [], [], []
    workspaces = []
    session_files = [s for s in (_load(f) for f in sorted((sugo_home / "sessions").glob("plan-*.json"))) if s]
    runs_of: dict[str, list[dict]] = {}
    for s in session_files:
        runs_of.setdefault((s.get("data") or {}).get("linkedTaskId"), []).append(s)

    for ws_dir in sorted(p for p in (sugo_home / "work").glob("*") if p.is_dir()):
        ws = _load(ws_dir / "workspace.json") or {}
        name, repos = ws.get("name", ws_dir.name), ws.get("projects", [])
        workspaces.append({"name": name, "projects": [Path(r).name for r in repos]})
        history = [h for h in (_load(f) for f in sorted((ws_dir / "history").glob("*.json"))) if h]
        history = [h for h in history if inside(_ts(h.get("completed_at")))]
        tasks = (_load(ws_dir / "tasks.json") or {}).get("tasks", [])

        by_task: dict[str, list[dict]] = {}
        for h in history:
            if h.get("task_id", "").startswith("git:"):
                for sha in h.get("commits", []) or []:
                    c = _commit(repos, sha) or {"sha": sha[:12], "subject": h.get("task_title", "")}
                    other.append({"source": "sugo", "workspace": name, "day": _kst(_ts(h["completed_at"]))[:10], "at": _kst(_ts(h["completed_at"])),
                                  "subject": m(c.get("subject")), "body": m(c.get("body")), "stat": c.get("stat", ""),
                                  "repo": c.get("repo"), "sha": c["sha"], "files": h.get("files_changed", [])})
            else:
                by_task.setdefault(h["task_id"], []).append(h)

        for t in tasks:
            logs = by_task.pop(t["id"], [])
            touched = logs or inside(_ts(t.get("completed_at"))) or inside(_ts(t.get("started_at")))
            t = {**t, "status": task_status(t, runs_of.get(t["id"], []))}
            if t["status"] == "in_progress":
                in_progress.append({"workspace": name, "title": t.get("title"), "started_at": t.get("started_at"), "summary": m(t.get("summary"))})
            if not touched:
                continue
            features.append({
                "workspace": name, "task_id": t["id"], "title": t.get("title"), "status": t.get("status"),
                "project": Path(t.get("project") or "").name, "started_at": t.get("started_at"), "completed_at": t.get("completed_at"),
                "summary": m(t.get("summary")),
                "work_logs": [{"at": _kst(_ts(h["completed_at"])), "summary": m(h.get("summary")), "files": h.get("files_changed", []),
                               "commits": [c for c in (_commit(repos, s) for s in h.get("commits", []) or []) if c]} for h in logs],
                "docs": _docs(t.get("prd_ref"), counts),
            })
        for task_id, logs in by_task.items():  # work logs whose task is no longer in tasks.json
            features.append({"workspace": name, "task_id": task_id, "title": logs[0].get("task_title"), "status": "unknown",
                             "work_logs": [{"at": _kst(_ts(h["completed_at"])), "summary": m(h.get("summary")), "files": h.get("files_changed", [])} for h in logs],
                             "docs": []})

        for f in sorted((ws_dir / "checkpoints").glob("*.md")):
            if inside(datetime.fromtimestamp(f.stat().st_mtime, KST)):
                checkpoints.append({"workspace": name, "file": f.name, "text": m(f.read_text(encoding="utf-8", errors="replace")[:2000])})

    for s in session_files:
        if not inside(_ts(s.get("updatedAt"))):
            continue
        chain = (s.get("data") or {}).get("chainInfo") or {}
        sessions.append({"feature": s.get("featureName"), "state": "CANCELLED" if s.get("cancelledAt") else s.get("state"), "project": Path(s.get("projectPath") or "").name,
                         "updated_at": _kst(_ts(s["updatedAt"])), "test": chain.get("testPassedState"), "review_passed": chain.get("reviewPassed"),
                         "changed_files": len(chain.get("changedFiles") or []), "review_summary": m(chain.get("reviewSummary"))})

    # a commit already recorded by sugo is not listed twice; hashes are compared on their 12-char prefix
    seen = _Prefix([o["sha"] for o in other] + [c["sha"] for f in features for l in f["work_logs"] for c in l.get("commits", [])])
    cfg = load_config() if config is None else config
    extra = _git_commits(git_sources(cfg, sugo_home), start, end, seen, m)
    other += extra
    # subjects excluded for every source (sugo or extra repo), e.g. a scheduled job's automatic commits
    skip = [re.compile(x) for x in cfg.get("exclude_subject", [])]
    other = [o for o in other if not any(x.search(o.get("subject") or "") for x in skip)]
    other.sort(key=lambda x: x["at"])
    return {
        "week": label, "start": start.date().isoformat(), "end": (end - timedelta(days=1)).date().isoformat(), "timezone": "Asia/Seoul",
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "workspaces": workspaces,
        "features": features, "other_commits": other, "sessions": sessions, "in_progress": in_progress, "checkpoints": checkpoints,
        "stats": {"features": len(features), "other_commits": len(other), "extra_repo_commits": len(extra), "sessions": len(sessions),
                  "days_active": len({x["day"] for x in other} | {l["at"][:10] for f in features for l in f["work_logs"]})},
        "masked": counts,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--week", help="ISO week, e.g. 2026-W42 (default: the latest finished week)")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args(argv)
    data = collect(args.week)
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / f"{data['week']}.week.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    s = data["stats"]
    print(f"{path}  {data['start']}~{data['end']}  기능 {s['features']} · 커밋 {s['other_commits']}(git 직접 {s['extra_repo_commits']}) · 세션 {s['sessions']} · 활동일 {s['days_active']} · 마스킹 {sum(data['masked'].values())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
