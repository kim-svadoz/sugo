# Express 4 하네스 (framework/express/4.x)

`framework/express` 공통 규칙에 더해. 4는 **비동기 에러를 자동으로 전파하지 않는다** — 이 하나가
이 버전에서 가장 많은 사고를 만든다.

## 핵심 규칙

1. **async 라우트 핸들러의 예외는 반드시 `next(err)`로 넘긴다.** 4는 rejected promise를 잡지 않는다. try/catch 없이 던지면 에러 핸들러가 호출되지 않고 **요청이 응답 없이 매달린 채로 남는다**(타임아웃까지). 래퍼 유틸로 감싸든 직접 try/catch를 쓰든, 모든 async 핸들러에 경로가 있어야 한다.
2. **5에서 제거된 API를 새로 쓰지 않는다.** `res.sendfile`(소문자), `app.del`, 인자 2개짜리 `res.redirect(status, url)`는 5에 없다 — 각각 `res.sendFile`, `app.delete`, `res.redirect(url)` 형태로 쓴다.
3. **라우트 패턴을 정규식 문자열로 정교하게 쓰지 않는다.** 5는 path-to-regexp v8로 바뀌어 같은 패턴이 다른 경로에 매칭될 수 있다. 단순한 경로일수록 이관 비용이 작다.
