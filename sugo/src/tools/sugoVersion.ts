import { currentSugoVersion } from "../version.js";

export const sugoVersionInputSchema = {};

/**
 * §1/§D.1 `version` 도구: 플러그인 버전 + 업데이트 확인(readOnly). 업데이트 확인은 원격
 * 마켓플레이스/저장소가 있어야 의미가 있는데 이 로컬 빌드엔 그게 정리돼 있으므로, 정직하게
 * "확인 불가"만 밝힌다(가짜 업데이트 확인 기능을 만들지 않음).
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
