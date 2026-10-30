# Proportional Verification

Apply verification in proportion to the change risk. Verification must provide useful evidence, not repeat expensive checks by habit.

## Default policy

- Run the smallest test that directly exercises the changed behavior.
- Build only the product that changed.
- Use a focused screenshot when visual layout or interaction changed.
- Do not run the full regression suite, cold-install verification, release verification, or cross-platform verification for a small isolated UI or copy change unless the affected contract requires it.
- Do not repeat a successful check after a change that cannot affect that check.
- Reuse valid evidence produced during the current task.

## Escalate verification when risk justifies it

Use broader verification for changes to gates, persistence schemas, migrations, authentication, lifecycle behavior, packaging, installation, cross-platform paths, shared contracts, or multiple coupled subsystems.

Run release verification when preparing a release that changes the plugin bundle or when the release contract explicitly requires it. Do not treat release verification as the default feedback loop during implementation.

## Time and communication

- Prefer a fast red-to-green regression test for defects.
- Stop once the requested behavior and its direct regression boundary are proven.
- If a check is unusually slow or broad, state why it is necessary before running it.
- Optimize for reliable delivery, not the number of commands executed.
