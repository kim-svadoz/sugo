# Express 5 하네스 (framework/express/5.x)

`framework/express` 공통 규칙에 더해. 5는 async 에러를 자동 전파하고 라우팅 엔진이 바뀌었다
(Node 18+ 필요).

## 핵심 규칙

1. **async 에러 래퍼(`express-async-handler` 류)나 관용적 try/catch-next를 새로 추가하지 않는다.** 5는 async 핸들러에서 던진 예외와 rejected promise를 에러 핸들러로 자동 전달한다. 래퍼를 덧대면 아무 것도 더 안전해지지 않고 스택만 한 겹 늘어난다.
2. **4에서 옮겨온 라우트 패턴은 반드시 테스트로 확인한다.** 5는 path-to-regexp v8을 쓴다 — 와일드카드(`*`)와 선택 그룹(`?`)의 의미가 달라져서, **컴파일 에러 없이 매칭 결과만 조용히 바뀐다.** 이 계열에서 가장 위험한 항목이다(4xx가 200이 되거나 그 반대).
3. **제거된 API를 쓰지 않는다.** `res.sendfile`, `app.del`, 인자 2개짜리 `res.redirect(status, url)`는 5에 없다.
4. **자동 전파를 이유로 에러 핸들러를 생략하지 않는다.** 전파되는 곳이 있어야 전파가 의미가 있다 — 4-인자 에러 핸들러는 여전히 필수다.
