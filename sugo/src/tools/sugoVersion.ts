import { currentSugoVersion } from "../version.js";

export const sugoVersionInputSchema = {};

/**
 * `sugo_version`: 플러그인 버전 조회(readOnly). 업데이트 확인은 원격 마켓플레이스가
 * 구성돼야 의미가 있어, 그게 없는 동안은 "확인 불가"를 정직하게 밝힌다(가짜 업데이트 확인 금지).
 */
export async function handleSugoVersion() {
  const payload = {
    ok: true,
    version: currentSugoVersion(),
    updateCheckAvailable: false,
    note: "원격 마켓플레이스/저장소가 구성되지 않아 업데이트 확인은 지원하지 않습니다.",
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
