"""The scheduled run has no Claude login: it uses the saved long-lived token, says why a call failed, and `check` warns before Saturday."""

from __future__ import annotations

import json
import subprocess

import pytest

from weekly_report import paths, summarize


def done(code: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(["claude"], code, stdout, stderr)


@pytest.fixture
def token_file(monkeypatch, tmp_path):
    path = tmp_path / "claude.token"
    monkeypatch.setattr(paths, "CLAUDE_TOKEN", path)
    return path


def test_saved_token_is_added_to_the_environment(token_file):
    token_file.write_text("sk-test-token\n")
    assert summarize.claude_env({"HOME": "/h"}) == {"HOME": "/h", "CLAUDE_CODE_OAUTH_TOKEN": "sk-test-token"}


def test_a_token_already_in_the_environment_wins(token_file):
    token_file.write_text("from-file")
    assert summarize.claude_env({"CLAUDE_CODE_OAUTH_TOKEN": "from-env"})["CLAUDE_CODE_OAUTH_TOKEN"] == "from-env"


@pytest.mark.parametrize("content", [None, "", "  \n"])
def test_missing_or_empty_token_file_changes_nothing(token_file, content):
    if content is not None:
        token_file.write_text(content)
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in summarize.claude_env({"HOME": "/h"})


def test_the_call_runs_with_the_token(monkeypatch, token_file):
    token_file.write_text("sk-test-token")
    seen = {}

    def run(cmd, **kw):
        seen["env"] = kw["env"]
        return done(0, json.dumps({"structured_output": {"a": 1}, "modelUsage": {}}))

    monkeypatch.setattr(summarize.subprocess, "run", run)
    summarize._once(["claude"], {}, None, 5)
    assert seen["env"]["CLAUDE_CODE_OAUTH_TOKEN"] == "sk-test-token"


def test_failure_reason_comes_from_stdout_json_not_the_empty_stderr(monkeypatch, token_file):
    out = done(1, json.dumps({"is_error": True, "result": "Not logged in · Please run /login"}), "")
    monkeypatch.setattr(summarize.subprocess, "run", lambda *a, **k: out)
    with pytest.raises(RuntimeError, match="Not logged in"):
        summarize._once(["claude"], {}, None, 5)


def test_failure_falls_back_to_stderr_when_stdout_is_not_json(monkeypatch, token_file):
    monkeypatch.setattr(summarize.subprocess, "run", lambda *a, **k: done(2, "", "boom"))
    with pytest.raises(RuntimeError, match="boom"):
        summarize._once(["claude"], {}, None, 5)
