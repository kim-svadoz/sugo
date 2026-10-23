"""Collector: only Mon-Fri KST of the chosen week, grouped by task, masked."""

from __future__ import annotations

import json
from datetime import date

from weekly_report.collect import collect, week_range
from weekly_report.mask import mask


def _w(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def _home(tmp_path):
    home = tmp_path / "sugo"
    ws = home / "work" / "ws1"
    _w(ws / "workspace.json", {"name": "ws1", "projects": [str(tmp_path / "no-repo")]})
    prd = tmp_path / "repo" / "sugo" / "features" / "20261013" / "feat-a" / "prd.md"
    prd.parent.mkdir(parents=True)
    prd.write_text("# 배경\n키 api_key=abcdefgh123 와 계정 123456789012", encoding="utf-8")
    _w(ws / "tasks.json", {"tasks": [
        {"id": "t-a", "title": "feat-a", "status": "done", "project": "/x/repo", "prd_ref": str(prd), "started_at": "2026-10-13T01:00:00Z",
         "completed_at": "2026-10-14T01:00:00Z", "summary": "요약 a"},
        {"id": "t-old", "title": "old", "status": "done", "started_at": "2026-09-01T00:00:00Z", "completed_at": "2026-09-02T00:00:00Z"},
        {"id": "t-run", "title": "running", "status": "in_progress", "started_at": "2026-09-30T00:00:00Z"}]})
    _w(ws / "history" / "wl-1.json", {"id": "wl-1", "task_id": "t-a", "task_title": "feat-a", "completed_at": "2026-10-14T10:00:00+09:00", "summary": "한 일"})
    _w(ws / "history" / "git-1.json", {"id": "git-1", "task_id": "git:abc", "task_title": "fix: 무언가", "completed_at": "2026-10-16T23:30:00+09:00", "commits": ["abc"]})
    _w(ws / "history" / "git-2.json", {"id": "git-2", "task_id": "git:def", "task_title": "토요일 커밋", "completed_at": "2026-10-17T00:30:00+09:00", "commits": ["def"]})
    _w(ws / "history" / "git-3.json", {"id": "git-3", "task_id": "git:ghi", "task_title": "일요일 밤(UTC로는 월요일 전)", "completed_at": "2026-10-11T14:59:00Z", "commits": ["ghi"]})
    return home


def test_week_range_defaults_to_the_latest_finished_week():
    assert week_range(None, date(2026, 10, 17))[0] == "2026-W42"  # Saturday 08:00 run
    assert week_range(None, date(2026, 10, 18))[0] == "2026-W42"  # Sunday: woke up from sleep
    assert week_range(None, date(2026, 10, 20))[0] == "2026-W42"  # Tuesday: woke up late, still the missed week
    assert week_range(None, date(2026, 10, 22))[0] == "2026-W42"  # Thursday: this week is not done yet
    assert week_range(None, date(2026, 10, 23))[0] == "2026-W43"  # Friday evening run reports its own week
    label, start, end = week_range("2026-W42")
    assert (start.date().isoformat(), end.date().isoformat()) == ("2026-10-12", "2026-10-17")


def test_only_monday_to_friday_kst_is_collected(tmp_path):
    d = collect("2026-W42", _home(tmp_path), config={})
    subjects = [o["subject"] for o in d["other_commits"]]
    assert subjects == ["fix: 무언가"]  # Friday 23:30 KST in, Saturday 00:30 KST out, Sunday 23:59 KST out


def test_tasks_are_grouped_with_their_logs_and_docs_and_masked(tmp_path):
    d = collect("2026-W42", _home(tmp_path), config={})
    [f] = d["features"]
    assert f["title"] == "feat-a" and f["work_logs"][0]["summary"] == "한 일"
    doc = f["docs"][0]["text"]
    assert "abcdefgh123" not in doc and "123456789012" not in doc and "<SECRET>" in doc and "<ACCOUNT_ID>" in doc
    assert d["masked"] == {"secret_assign": 1, "account_id": 1}
    assert [x["title"] for x in d["in_progress"]] == ["running"]


def test_mask_keeps_ordinary_numbers_and_hashes():
    assert mask("커밋 0f2e287 · 1789712393247 · 2026-10-14 · 47/47") == "커밋 0f2e287 · 1789712393247 · 2026-10-14 · 47/47"
    assert mask("postgres://u:pw1@h/db sugo_pat_abcdefgh12 AKIAABCDEFGHIJKLMNOP x@y.com 010-1234-5678") == \
        "postgres://u:<SECRET>@h/db <TOKEN> <AWS_KEY> <EMAIL> <PHONE>"


def _repo(path, commits):
    import subprocess
    env = {"GIT_AUTHOR_NAME": "me", "GIT_AUTHOR_EMAIL": "me@x.com", "GIT_COMMITTER_NAME": "me", "GIT_COMMITTER_EMAIL": "me@x.com", "PATH": "/usr/bin:/bin:/opt/homebrew/bin"}
    subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True, env=env)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "me@x.com"], check=True)
    for i, (subject, when, author) in enumerate(commits):
        (path / f"f{i}.txt").write_text(str(i))
        subprocess.run(["git", "-C", str(path), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(path), "commit", "-q", "-m", subject],
                       check=True, env={**env, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when, "GIT_AUTHOR_EMAIL": author})


def test_extra_repos_add_the_users_own_commits_of_the_week(tmp_path):
    repo = tmp_path / "notes"
    _repo(repo, [("docs: 검색 개선", "2026-10-14T10:00:00+09:00", "me@x.com"),
                 ("auto: 일일 갱신 2026-10-14", "2026-10-14T08:00:00+09:00", "me@x.com"),
                 ("남의 커밋", "2026-10-14T11:00:00+09:00", "other@x.com"),
                 ("다음 주 커밋", "2026-10-19T10:00:00+09:00", "me@x.com")])
    cfg = {"git_repos": [{"path": str(repo), "name": "notes", "exclude_subject": ["^auto: "]}]}
    d = collect("2026-W42", _home(tmp_path), config=cfg)
    extra = [o for o in d["other_commits"] if o["source"] == "git"]
    assert [o["subject"] for o in extra] == ["docs: 검색 개선"] and extra[0]["workspace"] == "notes" and extra[0]["files"] == ["f0.txt"]
    assert d["stats"]["extra_repo_commits"] == 1


def test_a_commit_already_recorded_by_sugo_is_not_listed_twice(tmp_path):
    import subprocess
    repo = tmp_path / "notes"
    _repo(repo, [("같은 커밋", "2026-10-14T10:00:00+09:00", "me@x.com")])
    sha = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    home = _home(tmp_path)
    _w(home / "work" / "ws1" / "history" / "git-x.json", {"id": "git-x", "task_id": "git:" + sha[:12], "task_title": "같은 커밋",
                                                         "completed_at": "2026-10-14T10:00:00+09:00", "commits": [sha]})
    d = collect("2026-W42", home, config={"git_repos": [{"path": str(repo)}]})
    assert [o["subject"] for o in d["other_commits"]].count("같은 커밋") == 1


def test_a_task_left_in_progress_by_a_cancelled_patch_counts_as_done(tmp_path):
    from weekly_report.collect import task_status
    done = {"state": "DONE", "data": {"linkedTaskId": "t"}}
    cancelled = {"state": "REVIEW_RUNNING", "cancelledAt": "2026-10-12T00:34:27Z", "data": {"linkedTaskId": "t"}}
    running = {"state": "CODE_RUNNING", "data": {"linkedTaskId": "t"}}
    t = {"id": "t", "status": "in_progress"}
    assert task_status(t, [done, cancelled]) == "done_patch_cancelled"
    assert task_status(t, [done, running]) == "in_progress"
    assert task_status(t, [cancelled]) == "in_progress"  # nothing ever finished
    assert task_status({"id": "t", "status": "done"}, [cancelled]) == "done"


def test_in_progress_list_uses_the_corrected_status(tmp_path):
    home = _home(tmp_path)
    _w(home / "sessions" / "plan-1.json", {"state": "DONE", "updatedAt": "2026-09-30T00:00:00Z", "data": {"linkedTaskId": "t-run"}})
    _w(home / "sessions" / "plan-2.json", {"state": "REVIEW_RUNNING", "cancelledAt": "2026-10-13T00:00:00Z", "updatedAt": "2026-10-13T00:00:00Z",
                                         "featureName": "running", "data": {"linkedTaskId": "t-run"}})
    d = collect("2026-W42", home, config={})
    assert d["in_progress"] == [] and d["sessions"][0]["state"] == "CANCELLED"
