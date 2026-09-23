---
name: review-security
agent: review-agent
description: 'review-agent 보안 스킬. OWASP 2021과 CWE, Lethal Trifecta를 점검한다(§4.5). "보안/취약점/security/OWASP/injection/SSRF" 요청에 쓴다. security-checklist를 따르며 읽기 전용이다.'
---

# review-security (review-agent, 읽기 전용)

security-checklist 스킬의 체크리스트를 코드와 변경에 적용한다.

1. 컨텍스트 로드: 규칙, 하네스, 변경 diff를 읽는다.
2. OWASP Top 10(2021) 점검: 접근통제, 암호화, 인젝션, 설계, 설정, 구식 컴포넌트, 인증, 무결성,
   로깅, SSRF를 확인한다. 각 지적을 CWE 번호로 매핑한다.
3. Lethal Trifecta 점검: `sugo_check_lethal_trifecta`로 private 데이터, untrusted 유입, 외부 통신
   3축이 동시에 성립하는지 확인한다. 겹치면 유출 경로로 경고한다.
4. 외부 기술 보안 주장: external-tech-verification 규율을 따른다. 증거 없는 주장은 미검증 가정으로
   표기한다.
5. 리포트: 각 취약점을 구체적인 입력과 결과로 기술해 work-result에 담는다. 가능성만 나열하지 않는다.

success: CWE 매핑과 trifecta 판정을 갖춘 실증적 보안 리포트.
on_failure: 심각한 취약점이면 review에서 막고 code-agent로 수정을 역행시킨다.
