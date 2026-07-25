---
name: security-checklist
description: 보안 리뷰 체크리스트 — OWASP Top 10(2021) + CWE 매핑 + Lethal Trifecta. review-agent의 security 스킬이 코드/변경을 점검할 때 따른다. "보안/취약점/security/OWASP/injection" 요청에도 적용.
---

# 보안 체크리스트 (OWASP 2021 + CWE + Lethal Trifecta)

## OWASP Top 10 (2021)
A01 접근통제 실패 · A02 암호화 실패 · A03 인젝션(SQL/OS/LDAP) · A04 안전하지 않은 설계 ·
A05 보안 설정 오류 · A06 취약·구식 컴포넌트 · A07 인증/식별 실패 · A08 소프트웨어·데이터 무결성 실패 ·
A09 로깅·모니터링 실패 · A10 SSRF. 각 지적은 해당 **CWE 번호**로 매핑한다.

## Lethal Trifecta (치명적 3축)
등록된 도구/코드가 다음 **3축을 동시에** 가지면 경고한다:
1. **private 데이터 접근**(비밀·개인정보·내부 리소스),
2. **untrusted 콘텐츠 유입**(외부 입력·프롬프트),
3. **외부 통신**(네트워크 전송).
셋이 겹치면 데이터 유출 경로가 된다. `sugo_check_lethal_trifecta`로 점검한다.

## 규율
- 취약점은 "가능성"이 아니라 **구체적 입력→결과**로 기술한다(어디서 어떻게 뚫리는지).
- 외부 기술의 보안 특성 주장은 외부 증거(context7 등) 없으면 "미검증 가정"으로 표시한다.
