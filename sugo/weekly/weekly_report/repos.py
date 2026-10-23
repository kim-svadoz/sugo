"""Which repositories the weekly report reads, and adding or removing the extra ones.

Commits are read from git. The repositories of all sugo workspace projects are read automatically; other repositories
are read only when they are listed in the config's "git_repos". This module shows both, suggests repositories that have the
user's recent commits but are not read yet, and edits the list.

    python -m weekly_report.repos list
    python -m weekly_report.repos suggest [--root ~/dev --root ~/personal] [--weeks 8]
    python -m weekly_report.repos add ~/dev/x [--name x] [--exclude '^auto: ']
    python -m weekly_report.repos remove ~/dev/x        # or the name
Add --json to any command for machine-readable output.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from . import collect as collect_mod

DEFAULT_ROOTS = ["~/dev", "~/personal", "~/workspace", "~/src", "~/projects"]


def _git(repo: Path, *args: str) -> str | None:
    try:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=30, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def _norm(path: str) -> Path:
    return Path(path).expanduser().resolve()


def _short(path: Path) -> str:
    home = Path.home()
    return "~/" + str(path.relative_to(home)) if path.is_relative_to(home) else str(path)


def _top(path: Path) -> Path:
    """The git repository root of a path (a sugo project may be a sub-folder of one repository)."""
    top = _git(path, "rev-parse", "--show-toplevel") if path.is_dir() else None
    return Path(top).resolve() if top else path


def sugo_projects(sugo_home: Path = collect_mod.SUGO_HOME) -> dict[Path, str]:
    """Project path -> sugo workspace name."""
    out = {}
    for f in sorted((sugo_home / "work").glob("*/workspace.json")):
        ws = json.loads(f.read_text(encoding="utf-8"))
        for p in ws.get("projects", []):
            out[_norm(p)] = ws.get("name", f.parent.name)
    return out


def load(config_path: Path = collect_mod.CONFIG) -> dict:
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save(cfg: dict, config_path: Path = collect_mod.CONFIG) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sources(cfg: dict, sugo_home: Path = collect_mod.SUGO_HOME, week: str | None = None) -> dict:
    """Every repository read for commits, with the user's commit count in one week (default: the latest finished week)."""
    label, start, end = collect_mod.week_range(week)
    rows = []
    for r in collect_mod.git_sources(cfg, sugo_home):
        repo = Path(r["path"])
        authors = r.get("authors") or sorted(_my_emails(repo))
        log = _git(repo, "log", "--all", "--no-merges", f"--since={start.isoformat()}", f"--until={end.isoformat()}", "--format=%H",
                   *[f"--author={a}" for a in authors]) or ""
        rows.append({"path": _short(repo), "name": r["name"], "from": r["from"], "commits": len(log.split()), "exclude_subject": r["exclude_subject"]})
    missing = [_short(_norm(r["path"])) for r in cfg.get("git_repos", []) if collect_mod._top(_norm(r["path"])) is None]
    return {"week": label, "repos": rows, "missing": missing, "exclude_subject": cfg.get("exclude_subject", [])}


def _my_emails(repo: Path) -> set[str]:
    emails = {e for e in (_git(repo, "config", "user.email"), _git(Path.home(), "config", "--global", "user.email")) if e}
    return emails


def suggest(cfg: dict, roots: list[str] | None = None, weeks: int = 8, sugo_home: Path = collect_mod.SUGO_HOME, max_depth: int = 3) -> list[dict]:
    """Git repositories under the roots with the user's commits in the last ``weeks`` weeks, not read yet. Most commits first."""
    read = {_top(p) for p in sugo_projects(sugo_home)} | {_top(_norm(r["path"])) for r in cfg.get("git_repos", [])}
    found, seen = [], set()
    for root in roots or DEFAULT_ROOTS:
        base = _norm(root)
        if not base.is_dir():
            continue
        for git_dir in _git_dirs(base, max_depth):
            repo = git_dir.parent.resolve()
            if repo in seen or repo in read:
                continue
            seen.add(repo)
            emails = _my_emails(repo)
            if not emails:
                continue
            log = _git(repo, "log", "--all", "--no-merges", f"--since={weeks}.weeks", "--format=%ae%x1f%as%x1f%s", *[f"--author={e}" for e in emails]) or ""
            rows = [l.split("\x1f") for l in log.splitlines() if l]
            if rows:
                found.append({"path": _short(repo), "name": repo.name, "commits": len(rows), "last": max(r[1] for r in rows), "sample": rows[0][2][:80]})
    return sorted(found, key=lambda r: (-r["commits"], r["path"]))


def _git_dirs(base: Path, max_depth: int):
    """`.git` directories under base, not descending into dependency or build folders."""
    skip = {"node_modules", ".venv", "venv", "build", "dist", ".gradle", "target", "Library", ".cache"}
    stack = [(base, 0)]
    while stack:
        d, depth = stack.pop()
        if (d / ".git").exists():
            yield d / ".git"
            continue
        if depth >= max_depth:
            continue
        try:
            children = [c for c in d.iterdir() if c.is_dir() and not c.name.startswith(".") and c.name not in skip]
        except OSError:
            continue
        stack.extend((c, depth + 1) for c in children)


def add(cfg: dict, path: str, name: str | None = None, exclude: list[str] | None = None) -> dict:
    p = _norm(path)
    if not (p / ".git").exists():
        raise ValueError(f"git 저장소가 아니다: {path}")
    repos = cfg.setdefault("git_repos", [])
    if any(_norm(r["path"]) == p for r in repos):
        raise ValueError(f"이미 추가된 저장소다: {_short(p)}")
    entry = {"path": _short(p), "name": name or p.name}
    if exclude:
        entry["exclude_subject"] = exclude
    repos.append(entry)
    return entry


def remove(cfg: dict, key: str) -> dict:
    repos = cfg.get("git_repos", [])
    for r in repos:
        if r.get("name") == key or _norm(r["path"]) == _norm(key):
            repos.remove(r)
            return r
    raise ValueError(f"추가 저장소 목록에 없다: {key}")


def _print_sources(s: dict) -> None:
    print(f"커밋을 읽는 저장소 ({s['week']} 내 커밋 수)")
    for r in s["repos"]:
        how = "sugo 워크스페이스, 자동" if r["from"] == "sugo" else "추가 저장소"
        print(f"  - {r['name']}: {r['path']} · {how} · {r['commits']}개" + (f" · 제외 {', '.join(r['exclude_subject'])}" if r["exclude_subject"] else ""))
    for m in s["missing"]:
        print(f"  - 경로 없음: {m}")
    if s["exclude_subject"]:
        print(f"모든 저장소에서 제외하는 커밋 제목: {', '.join(s['exclude_subject'])}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    lp = sub.add_parser("list")
    lp.add_argument("--week")
    sg = sub.add_parser("suggest")
    sg.add_argument("--root", action="append")
    sg.add_argument("--weeks", type=int, default=8)
    ad = sub.add_parser("add")
    ad.add_argument("path")
    ad.add_argument("--name")
    ad.add_argument("--exclude", action="append", help="regex for commit subjects to skip; repeatable")
    rm = sub.add_parser("remove")
    rm.add_argument("key", help="path or name")
    for p in sub.choices.values():
        p.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    cfg = load()
    try:
        if args.cmd == "list":
            out = sources(cfg, week=args.week)
        elif args.cmd == "suggest":
            out = suggest(cfg, args.root, args.weeks)
        elif args.cmd == "add":
            out = add(cfg, args.path, args.name, args.exclude)
            save(cfg)
        else:
            out = remove(cfg, args.key)
            save(cfg)
    except ValueError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False) if args.json else f"실패: {exc}")
        return 1
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    elif args.cmd == "list":
        _print_sources(out)
    elif args.cmd == "suggest":
        print("\n".join(f"- {r['name']}: {r['path']} · 최근 {args.weeks}주 커밋 {r['commits']}개 · 마지막 {r['last']} · 예: {r['sample']}" for r in out) or "후보 없음")
    else:
        print(("추가: " if args.cmd == "add" else "제거: ") + f"{out['name']} ({out['path']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
