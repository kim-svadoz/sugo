"""PreToolUse hook: a commit made by Claude must say why in its body.

The weekly report reads the purpose of work outside a sugo pipeline from commit bodies. A subject-only commit becomes an
"unexplained" item in the report. This hook stops such a commit and asks Claude to add the body, then commit again.

Runs on the system python3 (may be 3.9): standard library only, no 3.10+ syntax.
It only applies in repositories the weekly report reads: Sugo projects (a sugo/config.json above cwd) and the
"git_repos" listed in ~/.weekly/config.json.
Turn off with WEEKLY_COMMIT_BODY=off or {"commit_body": false} in ~/.weekly/config.json.
Commands it cannot read (editor, unusual quoting) are allowed: the hook only blocks when it is sure the body is missing.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys

GIT_COMMIT = re.compile(r"(?:^|[\s;&|(])git\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*commit\b")
HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n(.*?)\n\s*\1\s*(?:\n|$)", re.S)
TRAILER = re.compile(r"^[A-Za-z][A-Za-z-]*:\s+\S")
MIN_BODY = 10

REASON = ("커밋 본문이 없다. 제목 아래에 빈 줄을 두고, 이 변경의 목적(왜 바꿨는지)과 영향 범위를 1~3줄로 쓴 뒤 다시 커밋한다. "
          "Sugo Weekly 주간 보고서는 sugo 파이프라인 밖 작업의 목적을 커밋 본문에서 읽는다. "
          "끄려면 WEEKLY_COMMIT_BODY=off 또는 ~/.weekly/config.json의 \"commit_body\": false.")


def _config() -> dict:
    try:
        with open(os.path.expanduser("~/.weekly/config.json"), encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def disabled() -> bool:
    if os.environ.get("WEEKLY_COMMIT_BODY", "").lower() in ("off", "0", "false"):
        return True
    return _config().get("commit_body") is False


def in_scope(cwd: str | None) -> bool:
    """True when cwd is inside a repository the weekly report reads."""
    here = os.path.realpath(cwd or os.getcwd())
    d = here
    while True:
        if os.path.isfile(os.path.join(d, "sugo", "config.json")):
            return True
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    for repo in _config().get("git_repos", []):
        path = repo.get("path") if isinstance(repo, dict) else None
        if not isinstance(path, str):
            continue
        root = os.path.realpath(os.path.expanduser(path))
        if here == root or here.startswith(root + os.sep):
            return True
    return False


def _segment(cmd: str) -> str:
    """The part of the command from `git ... commit` to the end of that line."""
    m = GIT_COMMIT.search(cmd)
    return cmd[m.start():].split("\n", 1)[0] if m else ""


def message(cmd: str, cwd: str | None = None) -> str | None:
    """The commit message, or None when it cannot be read from the command."""
    seg = _segment(cmd)
    heredoc = HEREDOC.search(cmd)
    if heredoc and (re.search(r"(?:-F|--file)(?:\s+|=)-(?:\s|$)", seg) or "$(cat <<" in seg):
        return heredoc.group(2)
    try:
        words = shlex.split(seg.split("&&")[0].split(";")[0].split("|")[0])
    except ValueError:
        return None
    parts, i = [], 0
    while i < len(words):
        w = words[i]
        if (w in ("-m", "--message") or re.fullmatch(r"-[a-zA-Z]+m", w)) and i + 1 < len(words):  # -m, or combined like -am
            parts.append(words[i + 1]); i += 2; continue
        if w.startswith("--message="):
            parts.append(w.split("=", 1)[1])
        elif w.startswith("-m") and len(w) > 2 and not w.startswith("--"):
            parts.append(w[2:])
        elif w in ("-F", "--file") and i + 1 < len(words) and words[i + 1] != "-":
            path = os.path.join(cwd or "", words[i + 1])
            try:
                with open(path, encoding="utf-8") as f:
                    return f.read()
            except OSError:
                return None
        i += 1
    return "\n\n".join(parts) if parts else None


def has_body(msg: str) -> bool:
    lines = msg.strip().splitlines()
    body = [l for l in lines[1:] if l.strip() and not TRAILER.match(l.strip()) and not l.lstrip().startswith("#")]
    return len(" ".join(body).strip()) >= MIN_BODY


def decide(cmd: str, cwd: str | None = None) -> str | None:
    """A reason to deny, or None to allow."""
    if not GIT_COMMIT.search(cmd):
        return None
    seg = _segment(cmd)
    if "--allow-empty-message" in seg or "--no-edit" in seg or ("--amend" in seg and not re.search(r"\s(-m|--message|-F|--file)", seg)):
        return None
    msg = message(cmd, cwd)
    if msg is None or has_body(msg):
        return None
    return REASON


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    if disabled() or not in_scope(data.get("cwd")):
        return 0
    reason = decide((data.get("tool_input") or {}).get("command") or "", data.get("cwd"))
    if reason:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                                 "permissionDecisionReason": reason}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
