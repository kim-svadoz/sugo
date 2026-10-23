"""Repository sources: sugo workspaces are read automatically; extra repos are suggested by the user's recent commits and edited."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from weekly_report import repos

ENV = {"GIT_AUTHOR_NAME": "me", "GIT_AUTHOR_EMAIL": "me@x.com", "GIT_COMMITTER_NAME": "me", "GIT_COMMITTER_EMAIL": "me@x.com",
       "PATH": "/usr/bin:/bin:/opt/homebrew/bin", "HOME": "/nonexistent"}


def _repo(path: Path, email: str | None = "me@x.com", commits: int = 1) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True, env=ENV)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "me@x.com"], check=True)
    for i in range(commits):
        (path / f"f{i}").write_text(str(i))
        subprocess.run(["git", "-C", str(path), "add", "-A"], check=True, env=ENV)
        subprocess.run(["git", "-C", str(path), "commit", "-q", "-m", f"작업 {i}"], check=True, env={**ENV, "GIT_AUTHOR_EMAIL": email or "other@x.com"})
    return path


@pytest.fixture
def world(tmp_path):
    sugo = tmp_path / "sugo"
    mono = _repo(tmp_path / "code" / "mono", commits=2)
    (mono / "plugin").mkdir()
    (sugo / "work" / "ws").mkdir(parents=True)
    (sugo / "work" / "ws" / "workspace.json").write_text(json.dumps({"name": "ws", "projects": [str(mono / "plugin")]}))
    return {"tmp": tmp_path, "sugo": sugo, "mono": mono,
            "mine": _repo(tmp_path / "code" / "mine", commits=3), "others": _repo(tmp_path / "code" / "others", email="other@x.com"),
            "listed": _repo(tmp_path / "code" / "listed")}


def test_suggest_finds_my_repos_that_are_not_read_yet(world):
    cfg = {"git_repos": [{"path": str(world["listed"]), "name": "listed"}]}
    out = repos.suggest(cfg, [str(world["tmp"] / "code")], sugo_home=world["sugo"])
    assert [r["name"] for r in out] == ["mine"] and out[0]["commits"] == 3  # not the sugo repo (sub-folder), not listed, not others'


def test_add_and_remove_edit_only_the_extra_list(world):
    cfg = {"exclude_subject": ["^auto: "]}
    entry = repos.add(cfg, str(world["mine"]), exclude=["^chore: "])
    assert entry["name"] == "mine" and entry["exclude_subject"] == ["^chore: "]
    with pytest.raises(ValueError):
        repos.add(cfg, str(world["mine"]))
    with pytest.raises(ValueError):
        repos.add(cfg, str(world["tmp"]))  # not a git repository
    assert repos.remove(cfg, "mine")["name"] == "mine" and cfg["git_repos"] == [] and cfg["exclude_subject"] == ["^auto: "]
    with pytest.raises(ValueError):
        repos.remove(cfg, "mine")


def test_sources_read_sugo_repos_automatically_and_merge_a_duplicate_extra(world):
    plugin = world["mono"] / "plugin"
    cfg = {"git_repos": [{"path": str(plugin), "name": "p", "exclude_subject": ["^x"]}, {"path": str(world["mine"]), "name": "mine"},
                         {"path": str(world["tmp"] / "gone"), "name": "gone"}]}
    s = repos.sources(cfg, world["sugo"], "2026-W42")
    by = {r["name"]: r for r in s["repos"]}
    assert set(by) == {"ws", "mine"}  # the sugo project's repository root, read once
    assert by["ws"]["from"] == "sugo" and by["ws"]["exclude_subject"] == ["^x"] and by["mine"]["from"] == "config"
    assert s["missing"] == [str(world["tmp"] / "gone")]


def test_global_exclusion_applies_to_every_source(tmp_path):
    from weekly_report.collect import collect
    repo = _repo(tmp_path / "r", commits=0)
    for subject, when in (("auto: 일일 갱신", "2026-10-14T08:00:00+09:00"), ("기능 추가", "2026-10-14T10:00:00+09:00")):
        (repo / subject[:3]).write_text(subject)
        subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, env=ENV)
        subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", subject], check=True, env={**ENV, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when})
    (tmp_path / "sugo" / "work").mkdir(parents=True)
    d = collect("2026-W42", tmp_path / "sugo", config={"git_repos": [{"path": str(repo)}], "exclude_subject": ["^auto: "]})
    assert [o["subject"] for o in d["other_commits"]] == ["기능 추가"]
