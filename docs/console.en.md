# Console tour

[한국어](console.md) | [Back to README](../README.en.md)

The Console is the local screen where you check and decide on the work Sugo runs. It starts at `http://sugo.localhost:3001` with each new Claude Code session, or on the next free port when 3001 is taken. `/sugo:console open` opens the current address.

## Contents

- [Home](#home)
- [Workspaces](#workspaces)
- [Schedule](#schedule)
- [Spec card](#spec-card)
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

One screen shows what each domain is doing and how far it has gone.

![Workspaces: domain cards, work floor, recent work summary, Inspector](images/console-workspaces.png)

- **Domain cards:** a domain groups the projects of one business area. Each card shows progress, blocked tasks, and the number of domain rules.
- **Work floor:** shows whether the selected task is at order, implementation, test, review, user confirmation, docs, or commit. When a person needs to confirm something, the worker raises a question mark and waits. When there is no record for more than 4 days, the stations go dark and the worker rests in the lounge.
- **Recent work summary:** the task title and its finished result. When a domain has more than one task, switch with the arrows on the card.
- **Inspector:** the domain projects (Repositories), finished history (History), and the step records of the selected task (Activity). Each project also shows its remote repository and service status integration.

### Domain rules

Domain rules keep a mistake from happening twice. A rule applies to the whole domain or to one project, and records why it exists and what to check.

![Domain rules: rules for the whole domain and rules for one project](images/console-checkpoints.png)

`/sugo:checkpoint-sync` writes the rules to `.claude/rules/<category>/` in each project. Claude Code and Codex read these rules before they work.

## Schedule

Place development schedules on their due dates. Copy the spec command (`/sugo:spec-writer`) and the feature command (`/sugo:feat --spec`) from the schedule card to start.

**Agenda** groups work into overdue, today, next 7 days, later, and no date, with memos below. Finished specs are closed into the archive.

![Schedule Agenda: today, next 7 days, later, memos](images/console-agenda.png)

**Calendar** places the same work on a calendar, and you drag a card to change its date.

![Schedule Calendar: development schedule by due date](images/console-calendar.png)

## Spec card

Open a schedule card to see the spec's current state, development history, work context, and follow-up on one screen.

### Development history and follow-up

The first implementation (FEAT) and later patches stay in one development history. Each round records what changed and when. From the latest result, copy the **new patch** or **attach work record** command.

![Spec card: development history from FEAT to PATCH 4, work context, follow-up](images/console-spec.png)

### Why work stopped

When work cannot move on, the top of the card states the current step, why it stopped, and what to do next.

**A failing test sends the work back to implementation.**

![A task sent back to implementation after 2 of 26 tests failed](images/console-stop-test.png)

**Review catches a domain rule violation.**

![A task sent back from review for two domain rule violations](images/console-stop-rule.png)

### Approval

Work that passes review waits for a person. Open the review report and the changed-file diff, then approve or request changes. When you request changes, Sugo saves the decision and copies a prompt that resumes the same session.

![Work result review: report, diff, approve, and request changes](images/console-stop-approval.png)

![Changed-file diff](images/console-diff.png)

## Weekly

Weekly collects the finished results and commit bodies of one week into a weekly report and technical learning notes. The report has last week's plan, the situation and goal of each topic, blockers, and next week's plan.

![Weekly: weekly work report](images/console-weekly.png)

## Harness

See the coding rules (the harness) for your projects by technology and version. Rules are grouped into common, frameworks, build tools, and languages. Use **내 규칙으로 수정** to override a rule. Saved rules become the project's verification standard from the next sync.

![Harness: Spring Boot coding rules](images/console-harness.png)

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
| Workspaces | Domain cards, work floor, recent work summary, Inspector (Repositories, History, Activity), domain rules |
| Schedule | Agenda and Calendar, planning links and memos, deployment state, spec card (development history, why work stopped, approval, follow-up) |
| Weekly | Weekly reports and learning notes |
| Skills, Playbook | Agents, commands, and skills; usage scenarios |
| Harness | Coding rules for your projects |
| Integrations | Project registration, cloud service integration, connection status per project |
| Preferences | Display name, weather region, Weekly schedule |

Console data is in `~/.claude/sugo/dashboard/` and stays after updates. If the Console is off, the pipeline continues and sends sync data later.
