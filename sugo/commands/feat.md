---
description: 'Core Sugo pipeline. Move one feature from PRD to commit through enforced code, test, review, docs, and commit states. Gates require execution evidence.'
argument-hint: [--project <path>] [--spec <spec.md>] [--spec-draft <id>] [--branch <name>] <기능 설명>
---

Run the Sugo feat pipeline. Drive the `sugo_plan` state machine in the defined order. Never weaken a gate. Pass with execution evidence; bypass only with an explicit unverified label.

Request: $ARGUMENTS

For a Dashboard command, parse `--project`, `--spec`, `--spec-draft`, and `--branch` exactly. Pass them to the first `sugo_plan(action:"start")` call as `projectPath`, `specPath`, `specDraftId`, and `workBranch`. The user already selected the Schedule draft; do not ask about other unlinked drafts.

## Procedure

Call `sugo_plan` actions in order and follow each result's nextActionHints.

1. Call `sugo_plan(action:"start", projectPath, featureName, specPath?, specDraftId?, workBranch?)` to verify registration and create a session.
   - With workBranch, Sugo fetches the remote and prepares that branch. If the worktree is dirty or histories diverge, report the error; never auto-merge.
   - A workResultPath selects patch mode; see `/sugo:patch`.
   - TODO-SPEC is a hard gate for every matching branch, not opt-in. Inspect response `todoSpec`. `status:"missing"` requires final-goal confirmation in step 2. For `status:"loaded"`, read full `content`, identify "완료됨" and "남은 것", and confirm which remaining item this request addresses. An absent todoSpec means the branch is not `feature/*`; skip this contract.
   - `otherResumableSessions` means another blocked session exists for this project. Do not merge automatically. Ask whether to resume it or start new work.
   - `unlinkedSpecDrafts` are top-level Schedule drafts. Show each title and due date, then ask whether to link one or create a new SPEC. Before selection, clarify returns `SPEC_DRAFT_SELECTION_REQUIRED`. Record an existing choice with `clarify(specDraftDecision:"link", specDraftId)` or a new one with `clarify(specDraftDecision:"new")`. Never choose by title similarity.
2. Use clarify to confirm scope, acceptance criteria, constraints, and priority with the user.
   - If TODO-SPEC was missing, first confirm the final complete product implied by the request; do not reduce it to this session. Pass only the confirmed list to `clarify(todoSpecGoal, todoSpecItems, todoSpecUserConfirmed:true)`. Without `todoSpecUserConfirmed`, the server returns `TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED`. Never let the model freeze an unconfirmed list that later sessions would treat as truth.
3. Save the PRD with prd. The gate requires at least 100 characters and one `REQ-N` token anywhere. It also evaluates baseline signals and creates the Task/Run.
   - Roadmap REQ creation has a stricter contract: only Markdown headings `### REQ-N: title` create nodes. A PRD without those headings still passes but creates no Roadmap REQ. Use headings when Roadmap tracking is required.
   - On a TODO-SPEC branch, add a reference such as "TODO-SPEC 항목: b" beside each REQ. This is guidance for later human comparison, not a gate.
   - If the source SPEC has planning images such as `![...](images/...)`, add a `기획 화면` section and convert every link to an absolute path resolved from spec.md. PRD is stored elsewhere, so unchanged relative links break.
4. For a large PRD, call decompose, then subtask_start and subtask_done, then integrate. Otherwise call ready.
5. baseline_capture: signals such as runtime/JDK upgrades or dependency removal require a green pre-code baseline.
6. contract_start then contract_done: The main agent, not code-agent, owns this pre-code_start stage. Write the contract test first and record its implementation-before failure with `sugo_record_contract_evidence(sessionId, contractId, phase:"red", command, exitCode)`. If testing is impossible, apply the required label. Later, test-agent records green for the same contractId to complete red→green.
7. Use code_start to launch code-agent with the harness tool menu.
8. code_done requires code-agent to call `sugo_analyze` and satisfy the analyze, baseline, wiring, glue, and boot gates.
9. At test_start, hand off to test-agent with `sugo_chain`. Handoff is convention because test_start and review_start gates are empty, but preserve it. test_done cross-checks full-verification command evidence.
10. At review_start, hand off to read-only review-agent. review_done enforces `sugo_validate`, server evidence priority, user confirmation, summary quality, runtime verification, and contract evidence. PRD coverage is an opt-in test_done gate, not review_done. Successful review_done completes REQ and REQ-CONFIRM.
    - Do not print a long review and ask through Claude's own prompt. Publish it with `sugo_roadmap(action:"request_review_confirmation", workspace, id, sessionId, reviewPacket)` for Schedule detail and Agent Canvas Task Inspector.
    - Verify the Dashboard decision with `resume_with_decision`. On `확인, 진행`, call review_done. On `수정 필요`, do not call review_done; return the feedback to code-agent.
11. docs_done: Have docs-agent update README and related documentation.
12. commit: Commit only from DONE, as two separate commits, without push. Check checkpoints first. Never add a `Co-Authored-By` trailer or list Claude, Codex, another AI tool, or a model as co-author.
    - TODO-SPEC sync is a hard gate. On a TODO-SPEC branch, no file change since session start returns `TODO_SPEC_SYNC_REQUIRED`; a missing file returns `TODO_SPEC_MISSING_AT_COMMIT`. Do not run git commit while blocked. Mark this session's items under "완료됨" or add discovered remainder under "남은 것", then retry. Only for work truly unrelated to TODO-SPEC, such as a hotfix, provide `todoSpecSyncReason`; completion becomes unverified.

## Rules

- Never skip a state; the server returns `GATE_KEEPER_BLOCKED`.
- Report a gate error code unchanged and satisfy the gate. Do not escape through a label.
- Use an explicit unavailable-environment label only when true. Misuse lowers the completion grade.
- Dashboard progress mirroring is non-blocking. Dashboard downtime must not stop the pipeline.

### Human-decision blocking contract

- Do not create a human blocker for an agent-solvable gate such as failed tests, failed review, or missing execution evidence. Fix the cause and retry the same action.
- analyze `partial` or `fail` is a non-blocking lexical overlap diagnostic. Do not alter comments or names, or call it repeatedly, to force pass.
- After PRD, if implementation or verification reveals a policy, scope, or permission decision only a human can make, do not guess. Call `sugo_roadmap(action:"block_for_human", workspace, id, sessionId, stage, resumeAction, blockerSummary, question, context, options, blockedNextStep)` with current linkedWorkspace and linkedTaskId. Include stopped work, evidence, and option impact, then stop.
- When the user returns with a Dashboard resume prompt, first call `sugo_roadmap(action:"resume_with_decision", workspace, id, sessionId)`. Verify the returned decision and resumeAction, then continue that action in the same `sugo_plan` sessionId. Do not resume without a Dashboard answer or with a different sessionId.
- Before Task creation, from start through clarify, ask immediately answerable questions in conversation. Do not create a fake Task to imitate Dashboard blocking.
