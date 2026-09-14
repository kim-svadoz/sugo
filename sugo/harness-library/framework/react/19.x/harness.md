# React 19 하네스 (framework/react/19.x)

`framework/react` + `18.x` 규칙 위에, React 19(현행 19.2.x)에서 바뀐 기본값이다.

## 핵심 규칙

1. **폼 제출·비동기 변경은 Actions로 처리한다.** `useActionState`/`useFormStatus`/`useOptimistic`이 대기 상태·에러·낙관적 업데이트를 한 묶음으로 관리한다. `isLoading` 상태를 손으로 만들고 `try/catch`로 에러를 따로 담는 코드는 대기 상태와 에러 처리 중 하나를 빠뜨리는 형태로 깨진다.
2. **새 컴포넌트에 `forwardRef`를 쓰지 않는다.** 19부터 `ref`는 평범한 prop이다. `forwardRef`는 아직 동작하지만 폐기 예정이라, 새로 쓰면 곧 다시 고쳐야 한다.
3. **React Compiler를 쓰는 프로젝트에서는 `useMemo`/`useCallback`/`memo`를 손으로 덧붙이지 않는다.** 컴파일러(1.0 stable)가 메모이제이션을 담당한다. 수동 메모이제이션을 섞으면 컴파일러 최적화를 방해하고, 의존성 배열이 또 하나의 버그 표면이 된다.
4. **컴파일러를 쓴다면 훅 규칙 위반을 그냥 두지 않는다.** 컴파일러는 규칙을 지킨 컴포넌트만 최적화하고 나머지는 조용히 건너뛴다 — 최적화가 안 되고 있다는 사실 자체가 드러나지 않는다.
5. **Promise를 렌더에서 읽을 땐 `use()`를 쓰되, 렌더 중에 Promise를 새로 만들지 않는다.** 렌더마다 새 Promise가 생기면 매번 새로 suspend되어 무한 로딩이 된다.
