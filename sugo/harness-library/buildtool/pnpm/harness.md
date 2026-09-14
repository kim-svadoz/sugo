# pnpm 하네스 (buildtool/pnpm)

## 핵심 규칙

1. **`pnpm-lock.yaml`만 존재하고 다른 lockfile(`package-lock.json`/`yarn.lock`)과 혼용하지 않는다.** 두 lockfile이 서로 다른 의존성 트리를 가리키면 어느 쪽이 실제로 설치되는지 알 수 없다.
2. **CI에서는 `pnpm install --frozen-lockfile`을 쓴다.** 그냥 install하면 lockfile이 조용히 갱신되어 로컬과 CI가 다른 버전을 설치할 수 있다.
