# Poetry 2.x 하네스 (buildtool/poetry/2.x)

현행 계열(2.4.x). `buildtool/poetry` 공통 규칙에 더해.

## 핵심 규칙

1. **프로젝트 메타데이터는 표준 `[project]` 테이블에 쓴다.** 2는 PEP 621을 지원한다 — `[tool.poetry]`에만 남겨두면 다른 표준 도구(빌드 프런트엔드, 스캐너)가 이름·버전·의존성을 못 읽는다.
2. **`poetry export`가 필요하면 export 플러그인을 명시적으로 설치한다.** 코어에서 빠졌다 — CI가 이 명령을 쓰면서 플러그인 설치를 안 하면 그 단계에서 멈춘다.
3. **환경 정리는 `poetry sync`다.** `install --sync`는 폐기됐다.
4. **`requires-poetry`로 최소 Poetry 버전을 선언한다.** 1.x로 설치하면 2 전용 설정이 조용히 무시되거나 다르게 해석된다.
