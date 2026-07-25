---
name: review-security
description: review-agent 보안 스킬 — OWASP 2021 + CWE + Lethal Trifecta 점검(§4.5). "보안/취약점/security/OWASP/injection/SSRF" 요청. security-checklist를 따른다. 읽기 전용.
---

# review-security (review-agent, 읽기 전용)

security-checklist 스킬의 체크리스트를 코드/변경에 적용한다.

1. **컨텍스트 로드** — 규칙·하네스·변경 diff.
2. **OWASP Top 10(2021) 점검** — 접근통제/암호화/인젝션/설계/설정/구식컴포넌트/인증/무결성/로깅/SSRF.
   각 지적을 **CWE 번호**로 매핑.
3. **Lethal Trifecta 점검** — `sugo_check_lethal_trifecta`로 (private 데이터 + untrusted 유입 + 외부
   통신) 3축 동시 여부 확인. 겹치면 유출 경로로 경고.
4. **외부 기술 보안 주장** — external-tech-verification 규율: 증거 없는 주장은 "미검증 가정" 표기.
5. **리포트** — 각 취약점을 **구체적 입력→결과**로 기술(가능성 나열 금지)해 work-result에 담는다.

**success:** 실증적 보안 리포트(CWE 매핑 + trifecta 판정). **on_failure:** 심각 취약점이면 review에서
막고 code-agent로 수정 역행.
