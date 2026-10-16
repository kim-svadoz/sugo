---
name: external-tech-verification
description: 'Verify claims about external technology against external documentation. Mark unsupported negative claims as unverified assumptions. Applies to every agent.'
---

# External technology verification

## Rules

- Check external documentation before asserting library, framework, or API behavior.
- A negative claim such as “X is unsupported” is high risk. Without external evidence, label it an unverified assumption.
- Positive claims are also version-sensitive. Verify the version used by the project.

## Agent duties

- code-agent: Verify the actual signature and behavior before using an API. Do not invent APIs.
- review-agent: Support security and compatibility claims with external evidence, or mark them unverified.
- If no external lookup MCP is configured, state that fact and proceed as unverified. Never imply that verification occurred.
