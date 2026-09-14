# Python 3.12 하네스 (lang/python/3.12)

`lang/python` + `3.10` 규칙 위에, 3.12~3.13에서 달라지는 부분이다.

## 핵심 규칙

1. **제네릭은 PEP 695 문법(`def f[T](x: T) -> T`, `class Box[T]`)으로 선언한다.** 모듈 전역에 `TypeVar`를 따로 선언하면 그 타입 변수가 어느 함수 소속인지 코드에서 사라지고, 서로 다른 함수가 같은 `TypeVar`를 공유하는 사고가 난다.
2. **`datetime.utcnow()`를 쓰지 않는다.** 3.12에서 폐기됐다. 타임존 정보가 없는(naive) 값을 UTC처럼 다루다가 로컬 시간과 섞이는 게 이 API의 실제 사고 유형이다 — `datetime.now(timezone.utc)`를 쓴다.
3. **`asyncio.get_event_loop()`로 루프를 얻지 않는다.** 실행 중인 루프가 없을 때의 동작이 바뀌었다. `asyncio.run()`을 진입점으로 쓰고, 실행 중 루프가 필요하면 `get_running_loop()`를 쓴다.
4. **여러 비동기 작업은 `asyncio.TaskGroup`으로 묶는다.** `gather`와 달리 하나가 실패하면 나머지를 취소하고 예외를 모아서 올린다 — 실패한 작업 하나 때문에 나머지가 정리되지 않고 남는 상황이 사라진다.
