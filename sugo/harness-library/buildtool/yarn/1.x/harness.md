# Yarn Classic 하네스 (buildtool/yarn/1.x)

`buildtool/yarn` 공통 규칙에 더해. Yarn 1은 유지보수만 되는 계열이라, 아래는 "버티는 법"이지 권장
스택이 아니다.

## 핵심 규칙

1. **CI 설치는 `yarn install --frozen-lockfile`이다.** Berry의 `--immutable`은 1에서 인식되지 않는다 — 플래그를 잘못 쓰면 **아무 검증 없이 그냥 설치되고 lockfile이 조용히 갱신된다.**
2. **`resolutions`로 하위 의존성 버전을 고정할 때 근거를 남긴다.** 취약점 대응인지 호환성 문제인지 적어두지 않으면, 원인이 사라진 뒤에도 고정이 남아 업그레이드를 막는다.
3. **Berry 전용 설정 파일(`.yarnrc.yml`)을 만들지 않는다.** 1은 `.yarnrc`를 읽는다 — 잘못 두면 설정이 **에러 없이 무시된다.**
