# Yarn Berry 하네스 (buildtool/yarn/berry)

Yarn 2 이상(Berry) 계열. 1과는 설치 모델·설정 파일·명령이 전부 다르므로 숫자 버킷이 아니라 별도
계열로 둔다. `buildtool/yarn` 공통 규칙에 더해.

## 핵심 규칙

1. **CI 설치는 `yarn install --immutable`이다.** 1의 `--frozen-lockfile`은 Berry에서 다른 이름이다 — 잘못 쓰면 lockfile 검증 없이 설치된다.
2. **PnP 모드라면 `node_modules` 경로를 가정하는 코드를 두지 않는다.** Plug'n'Play는 `node_modules`를 만들지 않는다. 파일 시스템 경로로 패키지를 찾는 스크립트는 **설치는 성공했는데 실행만 실패**한다.
3. **선언하지 않은 패키지를 임포트하지 않는다.** Berry는 유령 의존성(phantom dependency)을 차단한다 — npm에서 우연히 동작하던 임포트가 여기서는 에러다. 쓰는 패키지는 전부 `package.json`에 선언한다.
4. **`.yarn/releases`의 Yarn 바이너리와 `packageManager` 필드를 커밋한다.** 팀과 CI가 같은 Yarn으로 설치해야 결과가 같다.
5. **`.yarn/cache`를 커밋할지(zero-install) 팀 차원에서 정하고 일관되게 간다.** 일부만 커밋하면 저장소는 무거워지는데 zero-install 이점은 못 얻는다.
