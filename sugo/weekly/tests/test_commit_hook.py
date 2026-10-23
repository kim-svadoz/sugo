"""The commit hook blocks a subject-only commit by Claude and lets every unclear form through."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parents[2] / "hooks" / "commit-body.py"
spec = importlib.util.spec_from_file_location("commit_body", HOOK)
cb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cb)


def test_subject_only_commits_are_denied():
    for cmd in ['git commit -m "docs: 회원가입 이메일 검증"', "git add -A && git commit -q -m '수정'", "cd x && git -C repo commit -m 'a'",
                "git commit -m '제목' -m 'Co-Authored-By: X <x@y.z>'", "git commit -am '제목만'"]:
        assert cb.decide(cmd) == cb.REASON, cmd


def test_commits_with_a_purpose_are_allowed():
    for cmd in ['git commit -m "제목" -m "가입 시 잘못된 이메일을 늦게 알려 줬다. 입력 즉시 검증한다."',
                'git commit -q -am "제목" -m "가입 시 잘못된 이메일을 늦게 알려 줬다. 입력 즉시 검증한다."',
                "git commit -q -F - <<'E'\n제목\n\n주간 보고가 목적을 읽을 수 있게 본문을 쓴다.\nE",
                'git commit -m "$(cat <<\'EOF\'\n제목\n\n왜 바꿨는지 설명하는 본문 줄이다.\nEOF\n)"']:
        assert cb.decide(cmd) is None, cmd


def test_heredoc_without_body_is_denied():
    assert cb.decide("git commit -q -F - <<'E'\n제목만 있다\nE") == cb.REASON


def test_unclear_or_other_commands_are_allowed(tmp_path):
    for cmd in ["git status", "git log --oneline", "git commit", "git commit --amend --no-edit", "git commit --amend",
                "echo 'git commit -m x'", "git commit -m 'unterminated"]:
        assert cb.decide(cmd) is None, cmd
    (tmp_path / "msg.txt").write_text("제목\n\n목적을 설명하는 충분한 본문이다.\n")
    assert cb.decide("git commit -F msg.txt", str(tmp_path)) is None
    (tmp_path / "short.txt").write_text("제목\n")
    assert cb.decide("git commit -F short.txt", str(tmp_path)) == cb.REASON


def test_hook_prints_a_deny_decision_and_can_be_turned_off(tmp_path):
    payload = json.dumps({"tool_input": {"command": "git commit -m 'x'"}, "cwd": str(tmp_path)})
    out = subprocess.run([sys.executable, str(HOOK)], input=payload, capture_output=True, text=True, env={"HOME": str(tmp_path), "PATH": "/usr/bin:/bin"})
    assert json.loads(out.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"
    off = subprocess.run([sys.executable, str(HOOK)], input=payload, capture_output=True, text=True,
                         env={"HOME": str(tmp_path), "PATH": "/usr/bin:/bin", "WEEKLY_COMMIT_BODY": "off"})
    assert off.stdout == ""


def test_hook_runs_on_the_system_python():
    out = subprocess.run(["/usr/bin/python3", str(HOOK)], input=json.dumps({"tool_input": {"command": "git commit -m 'x'"}}),
                         capture_output=True, text=True)
    assert out.returncode == 0 and "deny" in out.stdout, out.stderr
