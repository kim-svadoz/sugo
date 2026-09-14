# Next.js 15 하네스 (framework/nextjs/15.x)

`framework/nextjs` 공통 규칙에 더해, 15에서 바뀐 두 가지 기본값이 핵심이다.

## 핵심 규칙

1. **`cookies()`/`headers()`/`draftMode()`와 `params`/`searchParams`를 `await` 없이 쓰지 않는다.** 15에서 비동기로 바뀌었다. 동기 접근은 아직 경고만 내고 동작하지만 16에서 완전히 제거되므로, 지금 쓰는 코드가 다음 메이저에서 그대로 깨진다.
2. **`fetch`가 더 이상 기본 캐시되지 않는다는 걸 전제로 쓴다.** 14까지는 기본이 캐시였고 15부터 `no-store`가 기본이다. 캐시를 의도한다면 `cache: 'force-cache'`나 `revalidate`를 명시한다 — 안 그러면 "왜 매번 새로 불러오나"를 성능 문제로만 보게 된다.
3. **GET Route Handler도 기본 캐시되지 않는다.** 동일하게 명시적으로 캐시를 켜야 한다.
