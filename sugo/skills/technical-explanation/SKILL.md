---
name: technical-explanation
description: 'Explain technical facts in ASD-STE100 English or STE-inspired Korean. Triggers include ASD-STE100으로 설명해줘, STE로 설명, and concise technical English. Preserve facts, gates, and evidence.'
---

# Sugo Technical Explanation

This skill changes presentation only. Never change or add states, evidence, identifiers, values, or gate results.

## Sources

1. Identify the subject.
2. For Sugo session or Task state, first call the required `sugo_ontology` query: `explain_state`, `explain_block`, or `next_actions`.
3. Use `presentation:"ste-inspired-ko"` for Korean and `presentation:"asd-ste100-en"` for English.
4. Treat only `result` as fact. `presentation.rules` controls writing and adds no facts.
5. For other code or documents, use the actual source. Do not invent an unverified cause or effect.

## Output mode

Use `ASD-STE100 English` when the user requests English. For a Korean request without a language choice, use `STE-inspired Korean`.

### STE-inspired Korean

- Put one topic or action in each sentence.
- Use short active sentences and one term per concept.
- Order content as current state → cause or evidence → required action → next state.
- Preserve technical terms and code identifiers.
- Do not claim `ASD-STE100 준수`. Label it `ASD-STE100 원칙 기반 한국어`.

### ASD-STE100 English

- Follow every `presentation.rules` item.
- Put one instruction or topic in each sentence. Use short active sentences and one term per object.
- Put a condition before its instruction.
- Preserve technical names, commands, states, and file paths.
- Without official dictionary checks, full rule validation, and expert review, do not claim `ASD-STE100 compliant`. Use `ASD-STE100 style; compliance not verified` when needed.

## Prohibited

- Do not omit blockers or failures to simplify the explanation.
- Do not collapse multiple options into one recommendation.
- Do not add a next step, success claim, or causal link absent from `result`.
- Do not claim English controlled-dictionary compliance for Korean output.
