# pnpm 하네스 (buildtool/pnpm)

## 핵심 규칙

1. **`pnpm-lock.yaml`을 커밋한다.** 다른 lockfile(package-lock.json/yarn.lock)과 혼용하지 않는다.
2. **CI에서는 `pnpm install --frozen-lockfile`.**
3. **pnpm의 엄격한 node_modules 구조를 우회하는 hoist 설정을 함부로 추가하지 않는다** —
   phantom dependency(선언 안 한 패키지에 우연히 접근)를 막는 게 pnpm을 쓰는 이유다.

## 체크리스트

- [ ] `pnpm-lock.yaml`이 함께 커밋되었는지 확인
- [ ] 다른 lockfile과 혼용되지 않았는지 확인
