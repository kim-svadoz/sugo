/**
 * §9 "WORK 서브시스템 — 내장·항상 켜짐". `isWorkEnabled(): boolean { return true; }` — **상수다.**
 *
 * 구 `isHulkEnabled` 토글은 소멸했다. 작업 관리(태스크·체크포인트·스펙·이력·로드맵)는 sugo의
 * 부가기능이 아니라 기본 기능이라, 끌 수 있게 두면 "꺼진 상태에서 파이프라인이 반쯤 도는" 경로가
 * 생기고 그 경로는 아무도 테스트하지 않는다.
 *
 * **함수로 두는 이유:** 호출부가 `config.hulkEnabled` 같은 걸 직접 읽으면 판정 지점이 흩어지고
 * 언젠가 갈라진다. 단일 함수로 좁혀두면 `ontology/invariants.test.ts`의 정적 스캔이
 * "WORK 활성 판정은 여기서만"을 기계적으로 강제할 수 있다(§2.6 single-source).
 */
export function isWorkEnabled(): boolean {
  return true;
}
