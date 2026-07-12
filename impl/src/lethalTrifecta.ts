export interface ToolCapabilityProfile {
  toolName: string;
  /** 사설/민감 데이터(로컬 파일, 자격증명, 내부 API 등)에 접근 가능한지. */
  accessesPrivateData: boolean;
  /** 신뢰할 수 없는 외부 입력(웹 콘텐츠, 이메일, 제3자 API 응답 등)을 처리하는지. */
  processesUntrustedInput: boolean;
  /** 외부로 네트워크 통신(HTTP 요청, 웹훅 전송 등)이 가능한지. */
  communicatesExternally: boolean;
}

export interface LethalTrifectaWarning {
  toolName: string;
  reason: string;
}

/**
 * §10 Lethal Trifecta 점검: (사설데이터 접근 + 신뢰불가 입력 처리 + 외부통신)이 한 도구에
 * 동시에 있으면 경고한다 — 프롬프트 인젝션이 사설 데이터를 읽어 외부로 유출시킬 수 있는 조합.
 * 순수 함수. **capability는 호출자가 명시적으로 제공**해야 한다 — 도구 설명/이름에서 자동으로
 * 추측하지 않는다(휴리스틱 추측은 "보안 점검"이라는 이름을 달고도 신뢰 못할 결과를 낼 수 있어
 * 차라리 없는 게 낫다는 판단 — roadmap-progress.md 참고).
 */
export function checkLethalTrifecta(tools: ToolCapabilityProfile[]): LethalTrifectaWarning[] {
  return tools
    .filter((t) => t.accessesPrivateData && t.processesUntrustedInput && t.communicatesExternally)
    .map((t) => ({
      toolName: t.toolName,
      reason:
        "사설 데이터 접근 + 신뢰할 수 없는 입력 처리 + 외부 통신이 동시에 가능합니다 — " +
        "프롬프트 인젝션으로 사설 데이터가 외부로 유출될 위험이 있습니다.",
    }));
}
