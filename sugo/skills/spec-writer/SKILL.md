---
name: spec-writer
description: Convert a Schedule SPEC draft into implementable spec.md, or revise it before feat. Start from the Dashboard command for Claude or Codex.
---

# Sugo SPEC Writer

Claude and Codex share this SPEC-writing contract. Do not implement product code or start a feat session.

## Input and lock

1. Parse `--workspace`, `--project`, and `--spec-draft`.
2. First call `sugo_spec_writer(action:"context", workspace, projectPath, specDraftId)`.
3. Stop on `SPEC_NOT_EDITABLE`. A SPEC linked to feat is immutable; use patch for later changes.
4. Call `sugo_get_project_context(projectPath)` for harnesses, rules, checkpoints, and TODO-SPEC.
5. Open every local planning image path in context `attachments`. Review every planning document in context `references`. If a reference cannot be opened or its contents cannot be read, ask the user to provide the document in the current conversation. Never silently omit a returned reference.
   If `attachmentsUnavailable` or `referencesUnavailable`, tell the user that this Dashboard version cannot provide that source type.
6. Stop on `SPEC_REFERENCED_SOURCE_MISSING`. Tell the user that the draft refers to planning material but no file or link is connected. Ask the user to attach it to the Schedule SPEC card or the current conversation. Do not complete the SPEC before receiving it.

## Writing

- The user's direct request to run this skill authorizes writing.
- The file rules below define location. Never write inside the project repository, including `sugo/`. Before writing, inspect one existing root specification directory for naming convention.
- Write at product-planning level. Code-agent treats the SPEC as instruction; an implementation detail or assumption can become incorrect product behavior.
- Cover one feature. Required sections are 배경/목적, 범위 with In/Out, 요구사항 from user and screen behavior, observable 완료조건, user-defined 제약, Open Questions, and Sources.
- Omit "영향 지점" and "테스트" by default. Code-agent and test-agent determine implementation and test design from code.
- User-authored TODO-SPEC and checkpoints are valid source material. Rewrite implementation names such as classes, methods, files, and configuration keys as product-level language.

### Exclude from the SPEC

- File paths, line numbers, commit hashes, and class- or method-level implementation.
- Descriptions of current code behavior.
- Assumptions derived by the agent from code, data, or documents.

Use research on code, documents, or external tools only in conversation to form questions and scope decisions.

### Sources of fact

- Use only user-provided requirements, screens, documents, and decisions as SPEC facts.
- Do not put an unconfirmed item in requirements, completion criteria, or constraints. Put it in Open Questions only if the answer changes behavior or completion.
- Use only business identifiers already used by the user, such as a feature name or screen name. Exclude identifiers found only through research.
- Do not invent APIs, identifiers, values, schedules, owners, or behavior.
- Never overwrite an existing version.

### Open Questions

Open Questions do not block feat. They tell code-agent that a point is unresolved and must not be invented.

Use one criterion: does the answer change required behavior or completion? If not, omit it.

- Include unconfirmed behavior intended for a requirement, completion criterion, or constraint, and conflicts between a screen and user description.
- Exclude ownership, schedule, coordination, execution order, other-team or external-environment status, resolved or repeated items, and questions answered by reading code during implementation.
- Do not fabricate entries. Write "없음" when none apply. Fewer is better.
- Use one line per item: the unresolved point and the behavior affected by its answer.

### Planning screens

- Copy every attachment, with the same file name, into `images/` beside spec.md. Add every relative link under `기획 화면`, for example `![기획 화면 01](images/01.png)`. The source viewer and agents use these paths.
- Text and layout visible in a user-provided screen are facts. Do not infer hidden behavior or data sources. Put screen/user-description conflicts in Open Questions.
- List every returned planning document link under `Sources`. Use only content that was actually opened and read as a SPEC fact.

## File rules and completion

- Use `specTarget.path` from context exactly. Do not construct or guess a path.
- Treat `draftContent` as the user's primary draft. Preserve its intent and facts while converting it to the required SPEC structure.
- `specTarget` selects `specs/YYYYMMDD/<feature-slug>/vN/spec.md` under the current user's active Sugo data root. YYYYMMDD uses the user's local calendar. vN is the next unused version.
- Build `<feature-slug>` from the Schedule SPEC title: normalize to NFC, remove path-invalid characters, and replace spaces with `-`. Preserve Korean and Latin text.
- Write UTF-8 Markdown.
- Use this exact level-two section order: `배경/목적` → `범위` → `요구사항` → `완료조건` → `제약` → `Open Questions` → `Sources`. Complete validates names and order.
- In Sources, use the SPEC title, not its ID. A `spec-manual-xxxxxxxx` suffix can trigger the commit-hash lint.
- Re-read the file. Check required sections, observable completion criteria, excluded content, and that every attachment was copied to and linked from `images/`.
- Call `sugo_spec_writer(action:"complete", workspace, projectPath, specDraftId, specPath)`.
- `SPEC_LINT_WARNINGS` means no link was created. Fix the warned lines in a new vN+1 and call complete again. To retain warnings, show them to the user and obtain explicit approval before retrying with `acceptLintWarnings:true`.
- Lint detects implementation paths such as `src/main/` and `src/test/`, file-and-line patterns, line references, and commit-like hashes. It cannot detect ordinary prose about current code or research assumptions; no warning does not prove product-level quality.
- On success, report only the absolute path and the next action: “Schedule에서 feat 명령 복사”.
