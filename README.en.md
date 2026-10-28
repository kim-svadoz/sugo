# Sugo

**A Claude Code plugin that won't move on when an AI agent says "done" until execution records prove it**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757) ![Codex](https://img.shields.io/badge/Codex-supported-0f172a)

[한국어](README.md)

AI agents write code fast, but they also report work as done without running the tests, or edit files nobody asked them to touch. Sugo turns each feature into a **spec** (a document with its requirements and acceptance criteria), then runs it through implementation, tests, review, human approval, and commit. Each step moves on only after Sugo checks the real test run records and the changed files, and a person gives the final approval after reading the diff.

![Work floor: the worker moves through test, review, and docs to commit](docs/images/console-workfloor.gif)

> [!NOTE]
> Sugo makes the commit. You push.

## Contents

- [Why Sugo](#why-sugo)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Console tour](#console-tour)
- [Commands](#commands)
- [What installing Sugo changes](#what-installing-sugo-changes)
- [Reference](#reference)
- [Design philosophy](#design-philosophy)

## Why Sugo

| Common problem | What Sugo does |
| --- | --- |
| The agent reports done without tests | No recorded test run, no next step |
| The agent edits files outside the request | Each step has a limited scope. The test agent edits only tests. The docs agent edits only docs |
| Approval from a summary only | You approve after you see requirement status, test results, open risks, and the diff on one screen |
| The reasoning disappears when the session ends | Specs, design decisions, work results, and later patches stay in one history |
| Claude and Codex follow different rules | Both agents read the same rule files |
| The same mistake comes back | A mistake you record as a rule is followed by every agent from the next session |

> [!TIP]
> It is not meant for one-line fixes or throwaway experiments. Use a normal chat, and connect only the changes you keep to an existing task with `/sugo:patch-attach`.

## How it works

![The steps one feature takes from spec to commit, and where it goes back to implementation](docs/images/sugo-flow.en.png)

A person sets the spec. AI agents implement, test, and review. A person approves the result, and Sugo commits. If a test fails, review finds a rule violation, or the person requests changes, the work goes back to implementation.

The reason stays as a sentence at the top of the **spec card** in the Console (the local screen Sugo runs). A spec card collects the status and history of one spec.

**A failing test sends the work back to implementation.** A task with 2 of 26 tests failing is not reported as done.

![A task sent back to implementation after 2 of 26 tests failed](docs/images/console-stop-test.png)

**Review catches a rule violation.** Even with every test passing, code that uses `double` against the rule "compute money only as a whole number (long)" goes back to implementation.

![A task sent back from review for two rule violations](docs/images/console-stop-rule.png)

**A person approves at the end.** Open the review report and the changed-file diff, then approve or write what to change and request changes.

![Work result review: report, diff, approve, and request changes](docs/images/console-stop-approval.png)

<details>
<summary>Step by step</summary>

1. **Spec:** Sugo writes the request as a spec and sets acceptance criteria for each requirement. Out-of-scope work is removed here. When needed, it writes the criteria as contract tests first and confirms that they fail.
2. **Implement:** `code-agent` implements within the spec.
3. **Test:** `test-agent` runs the tests and records the results. It edits only test files.
4. **Review:** `review-agent` checks rule violations and security in read-only mode and prepares the verification material.
5. **Approve:** a person reads the verification material and the diff in the Console and approves each requirement. Answer policy or scope questions here too, and the same session continues.
6. **Docs and report:** `docs-agent` updates the project docs, and Sugo saves the change summary, design decisions, open risks, and test evidence to `work-result.md`.
7. **Commit:** when all steps pass, Sugo makes the commit. The commit message has no AI co-author line.

Put one behavior change in each `/sugo:feat`. If a spec is large, Sugo splits it into subtasks and integrates them.

</details>

## Quick start

### 1. Requirements

- Claude Code or the Codex app
- Git
- Node.js 22.5 or later: the Console uses `node:sqlite`. With an older Node, only the Console does not start.
- Python 3.12 or later: only Weekly report generation needs it.

### 2. Install

```bash
claude plugin marketplace add kim-svadoz/sugo
claude plugin install sugo@sugo-marketplace
```

In Claude Code, run `/reload-plugins`, then `/sugo:version`. No build or `npm install` is necessary.

- **Update:** `claude plugin update sugo@sugo-marketplace`, then `/reload-plugins`
- **Codex app:** add `https://github.com/kim-svadoz/sugo.git` as a plugin marketplace and turn on `sugo`. Codex provides the `/sugo:...` commands as skills.

### 3. First feature

```text
/sugo:ws-add payments
/sugo:add /path/to/payment-api payments
/sugo:feat --project /path/to/payment-api Lock the account for 10 minutes after 5 failed logins
```

| Command | Action |
| --- | --- |
| `/sugo:ws-add` | Creates a domain. A domain is a group of projects in one business area. Example: the `payments` domain holds a payment API, a settlement batch, and an admin UI |
| `/sugo:add` | Registers a project in a domain. It detects the language, framework, and build tool and installs the coding rules for that stack (the harness) |
| `/sugo:feat` | Runs one feature from spec to commit |

Use absolute paths. Follow progress in the Console (`http://localhost:3001`). The Console starts with each new Claude Code session.

## Console tour

Start with commands. Check and decide in the Console.

### Workspaces

One screen shows what each domain is doing and how far it has gone.

![Workspaces: domain cards, work floor, recent work summary, Inspector](docs/images/console-workspaces.png)

- **Domain cards:** progress, blocked tasks, and the number of rules per domain.
- **Work floor:** shows which step the worker is on now. When a person needs to confirm something, the worker raises a question mark and waits.
- **Recent work summary:** the title and finished result of the selected task.
- **Inspector:** the domain's repositories and integrations, finished history (History), and the step records of the task (Activity).

### Schedule and spec card

The Schedule Agenda shows today, the next 7 days, and later work. Open a spec card to see its development history from the first implementation (FEAT) through every patch, and start a **new patch** from the latest result.

| Agenda | Spec card |
| --- | --- |
| ![Schedule Agenda: today, next 7 days, later, memos](docs/images/console-agenda.png) | ![Spec card: development history from FEAT to PATCH 4, follow-up](docs/images/console-spec.png) |

### Domain rules

A mistake you hit once becomes a domain rule. Each rule records why it exists and what to check, and `/sugo:checkpoint-sync` writes it to `.claude/rules/` in each project. Claude Code and Codex read these rules before they work.

![Domain rules: rules for the whole domain and rules for one project](docs/images/console-checkpoints.png)

### Settings

| Harness | Integrations | Preferences |
| --- | --- | --- |
| ![Harness: Spring Boot coding rules](docs/images/console-harness.png) | ![Integrations: connection status per project](docs/images/console-integration-status.png) | ![Preferences: Weekly report schedule](docs/images/console-preferences.png) |
| Coding rules by stack and version. Override them with your own when needed | Cloud services and per-project remote repository, PR, service status, and APM connections | Display name, weather region, Weekly schedule |

> [!TIP]
> Descriptions of every screen, including Home, Weekly, Calendar, and diff, are in the [Console tour](docs/console.en.md).

## Commands

| Command | Purpose |
| --- | --- |
| `/sugo:feat` | Run one feature from spec to commit |
| `/sugo:patch` | Start a later fix from a finished task's `work-result.md` |
| `/sugo:patch-attach` | Verify changes from a normal chat and connect them to an existing task as a patch |
| `/sugo:add`, `/sugo:ws-add` | Register a project, create a domain |
| `/sugo:status`, `/sugo:ws-list`, `/sugo:ws-status` | Show status and where to resume |
| `/sugo:spec-writer` | Write a spec (`spec.md`) from a Schedule draft |
| `/sugo:checkpoint-sync` | Copy Console domain rules to `.claude/rules/` |
| `/sugo:validate` | Check the project against its rules |
| `/sugo:overview` | Analyze project structure (AST) |
| `/sugo:weekly` | Build the weekly report and learning notes now |
| `/sugo:console` | Local Console `status`, `start`, `restart`, `stop` |
| `/sugo:version` | Show the installed version |
| `/sugo:uninstall`, `/sugo:restore`, `/sugo:purge`, `/sugo:fresh-start` | Remove, restore, delete |

Arguments are defined in [`sugo/commands/`](sugo/commands/).

## What installing Sugo changes

> [!IMPORTANT]
> Hooks run in every Claude Code project, including projects that you did not register with Sugo. Sugo sends no telemetry.

<details>
<summary>Hooks, Console, project files, network</summary>

| When | Hook | Action |
| --- | --- | --- |
| Session start | `dashboard-start` | Starts the local Console in the background |
| Session start | `agent-tools` | Applies `agents.extraTools` to Sugo agents |
| Before Bash | `aws-readonly-guard` | Blocks AWS CLI calls that write, read secrets, or exceed the budget |
| Before Bash | `commit-body` | Makes Claude add a body when it commits without one. Weekly reads the purpose of work from commit bodies. Turn off with `WEEKLY_COMMIT_BODY=off` |
| Before Write/Edit | `scope-guard` | Limits the scope of test-agent and docs-agent |
| After Edit | `lint-hint` | Sends lint failures in registered projects to Claude. Does not block edits |
| After MCP calls | `mcp-presentation` | Applies only to servers in `presentation.mcpServers`. Off by default |

- **Console:** starts at `http://localhost:3001` and accepts connections from `127.0.0.1` only. To turn it off, set `"dashboard": {"enabled": false}` in `~/.claude/sugo/settings.json`.
- **Project files:** Sugo writes `sugo/`, `.claude/rules/`, and a Sugo-managed block in `AGENTS.md` and `CLAUDE.md` to registered projects. Your own text stays.
- **Network:** the Console fetches public engineering-blog RSS feeds for Home and a web font from a CDN, and calls Open-Meteo only if you set a weather region.
- **Weekly:** the Console builds the weekly report on the schedule in Preferences. One build calls `claude -p` twice. Data is in `~/.weekly/`.

</details>

## Reference

<details>
<summary>Configuration and integrations</summary>

Set personal settings as optional keys in `~/.claude/sugo/settings.json`. A missing key turns the feature off.

| Key | Action |
| --- | --- |
| `dashboard` | Console connection (`enabled`, `apiUrl`, `userId`, `apiToken`). Set automatically for the local Console |
| `agents.extraTools` | Extra MCP tools for Sugo agents. Example: `["mcp__team-knowledge__search"]` |
| `aws.environments` | Maps environment names (example: `dev`) to AWS account names registered in the Console |
| `presentation.mcpServers` | MCP servers whose results Claude explains in plain Korean |

Integrations are optional.

- **Git providers** (GitHub, GitLab, Bitbucket Server, CodeCommit): used for PR context.
- **AWS:** uses the local AWS CLI profile and stores resource metadata only. The default direct-read budget is 30 per session, 200 per day, and 10 per minute. If you turn off direct reads in Integrations, all AWS CLI calls from agents are blocked.

</details>

<details>
<summary>Uninstall and data</summary>

Data stays until you ask to delete it.

| Command | Project | Sugo data |
| --- | --- | --- |
| `/sugo:uninstall` | Removes Sugo blocks, rules, hooks. Keeps your text | Archived in `~/.sugo/data`. Not restored on reinstall |
| `/sugo:restore` | Restores archived links | Used again |
| `/sugo:fresh-start` | — | Deletes the archive and registers again |
| `/sugo:purge` | Removes Sugo blocks, rules, hooks | Deletes everything |

If you deleted the plugin cache first, run `node ~/.sugo/bin/sugo-uninstall.mjs uninstall` (or `purge`).

| Location | Content |
| --- | --- |
| `<project>/sugo/` | Applied rules, config, per-feature specs and work result reports |
| `<project>/.claude/rules/` | Harness coding rules, Console domain rules |
| `~/.claude/sugo/` | Registry, sessions, domains, specs, settings, Console data |
| `~/.sugo/` | Archived data, standalone uninstaller |
| `~/.weekly/` | Weekly settings, weekly reports, scheduled-run token. The uninstall commands do not delete it |

</details>

<details>
<summary>Supported stacks</summary>

| Type | Supported |
| --- | --- |
| Languages | Java, JavaScript, TypeScript, Python |
| Frameworks | Spring, Node, Express, React, Next.js |
| Build tools | Gradle, Maven, npm, pnpm, Yarn, pip, Poetry |

Other stacks use the default rules. Rule sources: [`sugo/harness-library/`](sugo/harness-library/).

</details>

<details>
<summary>Troubleshooting</summary>

| Symptom | Fix |
| --- | --- |
| `localhost:3001` does not respond | `/sugo:console status`, then `/sugo:console start` |
| Behavior is old after an update | `/reload-plugins`, then check `/sugo:version` |
| Finished work is not in the Console | Ask the agent to call `sugo_status` with `health: true` and check connection and sync errors |
| Old work is missing after a reinstall | Expected. Run `/sugo:restore`, or `/sugo:fresh-start` to start over |

</details>

## Design philosophy

> An AI agent is a fast colleague. What it doesn't know on its own is what to build, how this team works, and how far it may reach. Leave that unsaid and the output keeps piling up, but little of it can be trusted as is, and the checking falls back on people. Sugo fills that gap in three ways.
>
> - **The spec comes first (Spec-Driven Development).** Agents work from the spec, and verification uses the same spec.
> - **The working environment is designed (harness engineering).** Rather than asking agents to do well every time, Sugo has them read the coding rules for their stack and the domain rules, and does not let work move on without execution records.
> - **Roles are split.** The orchestrator and the code, test, review, and docs agents each handle only their own scope, and their reports are matched against execution records.
>
> People's time then goes to judgment. Sugo has already checked whether the tests really ran, so people look at whether the requirements were met and what risk remains, then approve. A mistake you hit once becomes a rule for the next task, so the more you use Sugo, the sturdier the environment gets.

## Links

- [Console tour](docs/console.en.md)
- [Changelog](CHANGELOG.md) (Korean)
- [Contributing](CONTRIBUTING.md) (Korean)
- [MIT License](LICENSE)
