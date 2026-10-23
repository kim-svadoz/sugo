"""Remove secrets and identifiers from text before it leaves the collector (no keys, tokens or personal data in AI input)."""

from __future__ import annotations

import re

RULES = [
    ("aws_key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), "<AWS_KEY>"),
    ("token", re.compile(r"\b(?:sugo_pat|ghp|gho|github_pat|xox[abp])_[A-Za-z0-9_-]{8,}"), "<TOKEN>"),
    ("secret_assign", re.compile(r"(?i)\b((?:api[_-]?key|access[_-]?key|secret|token|password|passwd)\s*[:=]\s*)['\"]?[^\s'\",;]{6,}"), r"\1<SECRET>"),
    ("dsn_password", re.compile(r"(\b[a-z][a-z0-9+.-]*://[^:/\s@]+:)[^@\s]+@"), r"\1<SECRET>@"),
    ("account_id", re.compile(r"(?<![\d.])\d{12}(?![\d.])"), "<ACCOUNT_ID>"),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "<EMAIL>"),
    ("phone", re.compile(r"\b01[016789]-?\d{3,4}-?\d{4}\b"), "<PHONE>"),
]


def mask(text: str | None, counts: dict[str, int] | None = None) -> str | None:
    """Masked text; ``counts`` (if given) accumulates how many replacements each rule made."""
    if not text:
        return text
    for name, rx, repl in RULES:
        text, n = rx.subn(repl, text)
        if counts is not None and n:
            counts[name] = counts.get(name, 0) + n
    return text
