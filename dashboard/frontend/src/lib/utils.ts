/**
 * 전 컴포넌트가 쓰는 className 결합 헬퍼. **falsy 제거만 하고 클래스 충돌 병합은 안 한다** —
 * 현재 화면의 조건부 className이 전부 배타적 분기라 병합이 필요한 지점이 없기 때문이다.
 * 충돌하는 유틸리티를 같이 넘겨야 할 일이 생기면 clsx+tailwind-merge로 교체해야 한다.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
