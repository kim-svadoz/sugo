---
name: review-security
agent: review-agent
description: 'Read-only security review using OWASP 2021, CWE, and Lethal Trifecta (§4.5). Triggers: 보안/취약점/security/OWASP/injection/SSRF. Follow security-checklist.'
---

# review-security (review-agent, read-only)

Apply the security-checklist skill to the code and diff.

1. Load rules, harnesses, and the diff.
2. Check OWASP Top 10 (2021): access control, cryptography, injection, design, configuration, vulnerable components, authentication, integrity, logging, and SSRF. Map every finding to a CWE.
3. Call `sugo_check_lethal_trifecta(sessionId, tools)` and inspect private-data access, untrusted input, and external communication. `review-validate` already requires this call for every review under §P6-1; here, interpret it in the security-request context. For a warning, provide a factual mitigation in review_done `trifectaMitigation`, such as removing external communication through sub-agent isolation.
4. Apply external-tech-verification to external security claims. Mark unsupported claims as unverified assumptions.
5. Put each vulnerability in work-result with a concrete input and outcome. Do not list possibilities alone.

success: An evidence-based security report with CWE mappings and a trifecta verdict.
on_failure: Block review for a severe vulnerability and return it to code-agent.
