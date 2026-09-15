---
name: security-checklist
description: '보안 리뷰 체크리스트. OWASP Top 10(2021)과 CWE 매핑, Lethal Trifecta를 다룬다. review-agent의 security 스킬이 코드와 변경을 점검할 때 따른다. "보안/취약점/security/OWASP/injection" 요청에도 적용한다.'
---

# 보안 체크리스트 (OWASP 2021 + CWE + Lethal Trifecta)

## OWASP Top 10 (2021)

A01 접근통제 실패 · A02 암호화 실패 · A03 인젝션(SQL/OS/LDAP) · A04 안전하지 않은 설계 ·
A05 보안 설정 오류 · A06 취약하거나 구식인 컴포넌트 · A07 인증과 식별 실패 ·
A08 소프트웨어와 데이터 무결성 실패 · A09 로깅과 모니터링 실패 · A10 SSRF.
각 지적은 해당 CWE 번호로 매핑한다.

## Lethal Trifecta

등록된 도구나 코드가 다음 3축을 동시에 가지면 경고한다.

1. private 데이터 접근(비밀, 개인정보, 내부 리소스)
2. untrusted 콘텐츠 유입(외부 입력, 프롬프트)
3. 외부 통신(네트워크 전송)

셋이 겹치면 데이터 유출 경로가 된다. `sugo_check_lethal_trifecta(tools[])`로 점검하되, **이 도구는
이름/설명에서 3축을 자동으로 추측하지 않는다** — 점검 대상 도구마다
`{toolName, accessesPrivateData, processesUntrustedInput, communicatesExternally}`를 네가 직접 코드를
읽고 판단해 채워 넣어야 한다. 신뢰 못할 휴리스틱을 피하려고 의도적으로 이렇게 설계됐다.

## 규율

- 취약점은 가능성이 아니라 구체적인 입력과 결과로 기술한다. 어디서 어떻게 뚫리는지를 쓴다.
- 외부 기술의 보안 특성에 대한 주장은 외부 증거가 없으면 미검증 가정으로 표시한다.
