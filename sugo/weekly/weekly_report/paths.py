"""The one place weekly keeps its files: ~/.weekly (or $WEEKLY_HOME).

    ~/.weekly/config.json    settings: schedule, extra repositories, excluded subjects, model
    ~/.weekly/reports/       <week>.week.json, <week>.report.json, <week>.edits.json, <week>.html, index.html, tech-glossary.json
    ~/.weekly/claude.token   long-lived Claude login (`claude setup-token`) for the scheduled run, which has no login of its own (0600)

The engine ships inside the Sugo plugin (sugo/weekly). Sugo Console runs it on the saved schedule; /sugo:weekly runs it on demand.

Read only: ~/.claude/sugo/settings.json, where sugo keeps the dashboard connection (apiUrl, apiToken).
"""

from __future__ import annotations

import os
from pathlib import Path

HOME = Path(os.environ.get("WEEKLY_HOME", Path.home() / ".weekly"))
CONFIG = Path(os.environ.get("WEEKLY_REPORT_CONFIG", HOME / "config.json"))
REPORTS = Path(os.environ.get("WEEKLY_REPORT_OUT", HOME / "reports"))
CLAUDE_TOKEN = Path(os.environ.get("WEEKLY_CLAUDE_TOKEN", HOME / "claude.token"))
SUGO_SETTINGS = Path(os.environ.get("SUGO_SETTINGS_FILE") or Path(os.environ.get("SUGO_HOME_OVERRIDE", Path.home())) / ".claude" / "sugo" / "settings.json")
