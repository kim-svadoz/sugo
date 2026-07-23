/**
 * §D.1 "버전은 빌드타임 상수 __SUGO_VERSION__" — build.mjs가 esbuild의 define으로 package.json의
 * version을 문자열 리터럴로 바꿔치기한다. `typeof` 가드는 안전하다(선언 안 된 식별자에도 던지지
 * 않음) — 그래서 esbuild로 번들되지 않은 컨텍스트(vitest 등, vite가 이 상수를 정의하지 않음)에서도
 * 깨지지 않고 개발용 폴백으로 떨어진다.
 */
declare const __SUGO_VERSION__: string;

export function currentSugoVersion(): string {
  return typeof __SUGO_VERSION__ !== "undefined" ? __SUGO_VERSION__ : "0.0.0-dev";
}
