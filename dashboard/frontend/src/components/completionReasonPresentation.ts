export interface CompletionReasonCopy { title: string; meaning: string; review: string; }
const copy: Record<string, CompletionReasonCopy> = {
  evidenceResnapshot: { title: "테스트 재검증 기록 검토", meaning: "테스트 증거를 다시 기록한 이력이 있어 자동 검증완료로 처리하지 않았습니다.", review: "다시 실행한 테스트의 범위와 제외 항목을 확인하고, 현재 코드에서도 검증이 충분한지 판단하세요." },
  environmentAbsent: { title: "검증 환경을 준비하지 못함", meaning: "필요한 환경 없이 진행한 검증 항목이 있습니다.", review: "어떤 환경과 검증이 빠졌는지 확인하세요. 환경을 준비해 재검증하거나, 제외해도 되는 근거를 기록하세요." },
  runtimeUnverified: { title: "실제 실행 결과 확인 필요", meaning: "코드의 실제 실행을 검증한 증거가 없습니다.", review: "대상 환경에서 실행 결과를 확인하세요. 직접 확인한 결과나 실행 검증을 제외할 근거를 남기세요." },
  wiringUnverified: { title: "구성 요소 연결 확인 필요", meaning: "변경한 기능이 실제 호출 경로에 연결됐는지 검증한 증거가 없습니다.", review: "진입점부터 변경 코드까지 호출되는지 확인하고, 연결을 확인한 방법과 결과를 기록하세요." },
  bootUnverified: { title: "애플리케이션 기동 확인 필요", meaning: "변경 후 애플리케이션이 기동되는지 검증한 증거가 없습니다.", review: "기동 결과를 확인하고 확인한 환경과 결과를 남기세요." },
  contractEvidenceMissing: { title: "계약 테스트 증거 확인 필요", meaning: "연동 계약을 확인할 실행 증거가 부족합니다.", review: "요청·응답과 실패 조건이 계약에 맞는지 확인하고, 증거나 검증 제외 근거를 남기세요." },
  abandonedChain: { title: "이전 작업 취소 기록 검토", meaning: "작업 흐름을 취소한 이력이 남아 있습니다.", review: "취소된 작업의 변경이나 검증 누락이 현재 결과에 영향을 주는지 확인하세요." },
  todoSpecSyncSkipped: { title: "설계 문서 반영 확인 필요", meaning: "설계 문서와 작업 항목을 맞추는 단계를 생략한 기록이 있습니다.", review: "현재 구현과 설계 문서가 일치하는지 확인하고, 생략해도 되는 근거를 남기세요." },
};
export function completionReasonPresentation(kind: string): CompletionReasonCopy {
  return copy[kind] ?? { title: "검증 예외 기록 검토", meaning: "자동 검증완료로 처리하지 못한 예외가 기록되어 있습니다.", review: "원래 사유와 현재 작업 결과를 대조하고, 이 예외를 승인할 수 있는 근거를 남기세요." };
}
/** Quoted preview only: never infer that excluded tests are unrelated or safe. */
export function reasonPreview(reason: string): string {
  const text = reason.replace(/\s+/g, " ").trim();
  return text.length > 140 ? text.slice(0, 140) + "…" : text;
}
