# Python 3.9 하네스 (lang/python/3.9)

`lang/python` 공통 규칙에 더해, 3.9 이하에 묶인 코드의 제약이다. 3.9는 보안 수정도 끝난
계열이라 아래는 "이 버전에서 깨지지 않게 쓰는 법"이지 권장 스택이 아니다.

## 핵심 규칙

1. **`match` 문과 `X | Y` 유니온 표기를 쓰지 않는다.** 각각 3.10 문법이라 `SyntaxError`로 즉시 죽는다. 유니온은 `Optional[X]`/`Union[X, Y]`로 쓴다.
2. **`Self`, `ExceptionGroup`, `except*`, `tomllib`을 쓰지 않는다.** 전부 3.11 이후에 들어왔다.
3. **PEP 695 제네릭 문법(`def f[T](...)`)을 쓰지 않는다.** 3.12 문법이다 — `TypeVar`를 명시적으로 선언해 쓴다.
4. **내장 제네릭(`list[int]`, `dict[str, int]`)은 쓸 수 있다.** 3.9에서 들어왔으므로 `typing.List`를 새로 쓸 이유는 없다.
