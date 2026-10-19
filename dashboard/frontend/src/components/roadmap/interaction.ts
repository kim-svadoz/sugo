/** Inspector가 열린 뒤에는 선택이 시각적 초점이다. hover 초점을 함께 적용하면 두 상태가 경쟁한다. */
export function shouldApplyHoverFocus(hoveredId: string | null, selectedId: string | null): boolean {
  void hoveredId;
  void selectedId;
  // 마우스를 올렸다는 이유만으로 다른 워크스페이스/SPEC을 사실상 끄는 동작은 정보 비교를 방해한다.
  return false;
}
