# Product UI Design Rules

Apply these rules when designing, implementing, or reviewing Sugo Console and other frequently used engineering dashboards.

## Core principles

- Every visual element must support a clear purpose: comprehension, action, state, or feedback.
- Optimize information density instead of maximizing either content or whitespace. Keep primary comparisons visible and reveal secondary detail on demand.

## Rules

1. Do not explain every element with text. A label, heading, badge, placement, icon, and supporting sentence must not repeat the same meaning.
2. Remove information that does not change a decision or action. Avoid decorative eyebrow text, redundant subtitles, and permanent helper copy.
3. Do not wrap every section in a tinted, bordered card. Prefer alignment, spacing, typography, and dividers. Avoid nested cards; when a card is necessary, consider placing its heading outside.
4. Do not ship inconsistent browser-native selects, alerts, or inputs as finished product UI. Use the product interaction system with accessible focus, keyboard, and error states. Treat icons, favicon, and sharing metadata as product assets.
5. Every asset and animation must improve comprehension, feedback, continuity, or attention pacing. Do not add floating, bouncing, or scrolling effects only for decoration.
6. Design operational dashboards for frequent users. Keep rows compact, comparison easy, and scan paths clear. Put onboarding explanations behind contextual help instead of repeating them in the primary workspace.
7. Make the web interface feel responsive through deliberate hover, focus, pressed, loading, empty, error, and transition states. Keep motion subtle and respect reduced-motion preferences.

## Review gate

Before declaring a UI change complete:

- State the purpose of each new visual element.
- Remove copy that duplicates a nearby label, heading, badge, or state.
- Justify every new card or bordered container.
- Check that controls follow one visual and interaction system.
- Capture the real viewport and inspect hierarchy, density, alignment, overflow, and state consistency.
- Verify keyboard focus and reduced-motion behavior for changed interactions.

These are decision rules, not a mandate to make every screen visually identical. Preserve the product's established patterns unless a change has a specific user or operational benefit.
