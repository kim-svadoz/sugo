---
name: security-checklist
agent: review-agent
description: 'Security checklist for OWASP Top 10 (2021), CWE mapping, and Lethal Trifecta. Apply during review-agent security checks and 보안/취약점/security/OWASP/injection requests.'
---

# Security checklist (OWASP 2021 + CWE + Lethal Trifecta)

## OWASP Top 10 (2021)

A01 Broken Access Control · A02 Cryptographic Failures · A03 Injection (SQL/OS/LDAP) · A04 Insecure Design · A05 Security Misconfiguration · A06 Vulnerable and Outdated Components · A07 Identification and Authentication Failures · A08 Software and Data Integrity Failures · A09 Security Logging and Monitoring Failures · A10 SSRF. Map each finding to its CWE.

## Lethal Trifecta

Warn when a registered tool or code path has all three capabilities:

1. Access to private data, secrets, personal data, or internal resources.
2. Processing of untrusted external input or prompts.
3. External network communication.

Together they create a data-exfiltration path. Call `sugo_check_lethal_trifecta(sessionId, tools[])`. The tool must not infer capabilities from names or descriptions. Read the code and provide `{toolName, accessesPrivateData, processesUntrustedInput, communicatesExternally}` for every inspected tool.

This call is not opt-in. `review-validate` calls it for every review, and review_done hard-gates missing calls with `LETHAL_TRIFECTA_NOT_CALLED`. The security skill re-evaluates those capabilities in the full OWASP context; the session retains the latest result.

## Rules

- Describe a vulnerability with a concrete input and outcome, not possibility alone.
- Mark external security claims without external evidence as unverified assumptions.
