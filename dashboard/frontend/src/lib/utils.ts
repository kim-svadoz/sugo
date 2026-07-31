/**
 * 설계안이 전 컴포넌트에서 쓰는 className 결합 헬퍼. 원본은 clsx+tailwind-merge 조합이지만
 * 여기서는 **충돌 병합이 필요한 지점이 없어**(설계안의 조건부 className은 전부 배타적 분기다)
 * 의존성을 늘리지 않고 falsy 제거만 한다. 나중에 충돌 병합이 실제로 필요해지면 그때 교체할 것.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
