# Console tour

[한국어](console.md) | [Back to README](../README.en.md)

The Console is the local screen where you check and decide on the work Sugo runs. It starts at `http://localhost:3001` with each new Claude Code session.

## Contents

- [Home](#home)
- [Workspaces](#workspaces)
- [AI work status (Agent Canvas)](#ai-work-status-agent-canvas)
- [Schedule](#schedule)
- [Approval](#approval)
- [Work history](#work-history)
- [Weekly](#weekly)
- [Harness](#harness)
- [Integrations](#integrations)
- [Preferences](#preferences)
- [Screens at a glance](#screens-at-a-glance)

## Home

Home collects the work to continue and the decisions waiting for you.

![Home: work flow, approval requests, recent work reviews, engineering-blog feed](images/console-home.png)

- **Work flow:** shows the steps from spec to commit in one row. Human steps and AI steps have different colors. Select a step to see what it does and what it hands on.
- **Recent work reviews:** groups the FEAT and PATCH rounds of the same task and shows recent work by the latest finished result. Each result has a review note with design decisions and lessons.
- **Engineering Feed:** collects new posts from public engineering blogs. You can save posts you want to keep.

## Workspaces

### Domains and domain rules

Group the projects of one business area into a domain. Each domain card shows progress, blocked tasks, and the number of domain rules.

![Domain management: progress and domain rule count per domain](images/console-domains.png)

Domain rules keep a mistake from happening twice. A rule applies to the whole domain or to one project, and records why it exists and what to check.

![Domain rules: rules for the whole domain and rules for one project](images/console-checkpoints.png)

`/sugo:checkpoint-sync` writes the rules to `.claude/rules/<category>/` in each project. Claude Code and Codex read these rules before they work.

### Work floor

Select a domain to see the current step of the selected task as a picture.

![Workspaces work floor: task step, recent work summary, Inspector](images/console-workspaces.png)

- **Work floor:** the worker moves through order, implementation, test, review, user confirmation, docs, and commit. When there is no record for more than 4 days, the stations go dark and the worker rests in the lounge.
- **Recent work summary:** shows the task title and its finished result. When a domain has more than one task, switch with the arrows on the card.
- **Inspector:** shows the domain projects (Repositories), finished history (History), and the step records of the selected task (Activity). Each project also shows its remote repository and service status integration.

## AI work status (Agent Canvas)

Select **AI 작업 현황** on a domain card to see specs, runs, tasks, and requirements as a graph. Select a task to see its current step, why it is blocked, and the next step. Below are three scenes where Sugo did not let work move on.

**A failing test stops the work.** A task with 2 of 26 tests failing is not reported as done. It goes back to implementation.

![A task sent back to implementation after 2 of 26 tests failed](images/console-caught-test.png)

**Review catches a domain rule violation.** Even with every test passing, code that computes money as `double` goes back to implementation for breaking a domain rule.

![A task sent back from review for two domain rule violations](images/console-caught-rule.png)

**A missing requirement shows before approval.** A task that leaves one of three requirements undone shows 2/3, and a person can request changes.

![An approval request with one requirement missing](images/console-caught-requirement.png)

## Schedule

Place development schedules on their due dates. Copy the spec command (`/sugo:spec-writer`) and the feature command (`/sugo:feat --spec`) from the schedule card to start. The Agenda view groups work into overdue, next 7 days, later, and no date.

![Schedule Calendar: development schedule by due date](images/console-calendar.png)

## Approval

Read the verification result and the changed-file diff, then approve or request changes. When you request changes, Sugo saves the decision and copies a prompt that resumes the same session.

<p>
  <img src="images/console-approval.png" alt="Work result review and approval" width="49%">
  <img src="images/console-diff.png" alt="Changed-file diff" width="49%">
</p>

## Work history

A task's first implementation (FEAT) and its later patches stay in one development history. Each round records what changed and when, and the next patch starts from the latest result.

![Work history: development history from the first implementation to patch 4](images/console-lineage.png)

## Weekly

Weekly collects the finished results and commit bodies of one week into a weekly report and technical learning notes. The report has last week's plan, the situation and goal of each topic, blockers, and next week's plan.

![Weekly: weekly work report](images/console-weekly.png)

## Harness

See the coding rules (the harness) for your projects by technology and version. Rules are grouped into common, frameworks, build tools, and languages. Use **내 규칙으로 수정** to override a rule. Saved rules become the project's verification standard from the next sync.

![Harness: coding rules by technology and version](images/console-harness.png)

## Integrations

Connect the external services Sugo uses and set their scope per project. Every integration is optional.

**Cloud service integration:** connect AWS accounts, PR integration (Git providers), service status, and monitoring. AWS uses the local AWS CLI profile and only reads. Environment names and order are also used for deployment state in Schedule.

![Integrations: AWS environments](images/console-integrations.png)

**Connection status per project:** see the remote repository, PR integration, service status, and APM connection of each project, grouped by domain.

![Integrations: connection status per project](images/console-integration-status.png)

## Preferences

Set your display name, weather region, and Weekly schedule. For Weekly, choose the day and time, the Claude model, extra repositories to include, and the Claude token for scheduled runs.

![Preferences: Weekly report schedule](images/console-preferences.png)

## Screens at a glance

| Screen | Content |
| --- | --- |
| Home | Work flow, work to continue and approval requests, recent finished work and learning notes, engineering-blog feed |
| Workspaces | Projects and domain rules per domain, work floor, Inspector (Repositories, History, Activity) |
| AI work status | Graph of specs, runs, tasks, and requirements; per-task status, blockers, approval evidence, diff |
| Schedule | Spec schedule, planning links and memos, deployment state |
| Weekly | Weekly reports and learning notes |
| Skills, Playbook | Agents, commands, and skills; usage scenarios |
| Harness | Coding rules for your projects |
| Integrations | Project registration, cloud service integration, connection status per project |
| Preferences | Display name, weather region, Weekly schedule |

Console data is in `~/.claude/sugo/dashboard/` and stays after updates. If the Console is off, the pipeline continues and sends sync data later.
