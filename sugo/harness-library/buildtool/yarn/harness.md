# Yarn 하네스 (buildtool/yarn)

## 핵심 규칙

1. **`yarn.lock`을 커밋하고 `package-lock.json`과 동시에 존재하지 않게 한다.** 두 lockfile이 서로 다른 트리를 가리키면 설치마다 다른 버전이 깔린다.
2. **CI에서는 `--frozen-lockfile`(Yarn 1) 또는 `--immutable`(Yarn Berry)로 설치한다.** 그냥 install하면 lockfile이 조용히 갱신될 수 있다.
