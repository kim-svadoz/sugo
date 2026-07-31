/**
 * §8.2 "모든 sync payload에 계약 버전(`DASHBOARD_SYNC_SCHEMA_VERSION`)을 싣고 양방향 graceful degrade."
 *
 * 플러그인과 대시보드는 **별개로 배포되는 두 레포**라 어느 쪽이 먼저 올라갈지 보장이 없다
 * (`cross-repo-contract` 불변식). 버전 숫자 자체가 뭔가를 분기시키진 않는다 — 수신 측이
 * "이건 내가 아는 것보다 새 계약이다"를 **로그로 알아채게** 하는 게 목적이고, 그 어느 쪽도
 * 400/500을 내면 안 된다(sync는 fail-open).
 *
 * 올리는 시점: sync wire 포맷이 **호환 불가하게** 바뀔 때만(필드 삭제/의미 변경). 필드 추가는
 * 양쪽 다 모르는 키를 떨구므로 버전을 올리지 않는다.
 */
export const DASHBOARD_SYNC_SCHEMA_VERSION = 1;

/** 대시보드가 응답에 자기 계약 버전을 실어주는 헤더(역방향 degrade 신호). */
export const SYNC_SCHEMA_VERSION_HEADER = "x-sugo-sync-schema-version";
