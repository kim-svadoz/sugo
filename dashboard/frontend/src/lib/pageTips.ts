// 상단 TIP: 페이지마다 "무슨 화면인지 + 쓰면 무엇을 얻는지"를 한 문장으로 말한다. Home은 인사말을 쓰므로 TIP이 없다.
const PAGE_TIPS: Array<[RegExp, readonly string[]]> = [
  [/^\/schedule/, ["일정 관리는 개발 항목의 목표일과 진행 기록을 함께 묶어, 다음에 할 일을 놓치지 않게 합니다.", "캘린더에 작업을 배치하면 여러 프로젝트의 마감과 진행 흐름을 한눈에 비교할 수 있습니다."]],
  [/^\/weekly/, ["주간 작업 리포트는 완료 결과와 새로 배운 내용을 주별로 모아, 지난 결정을 다음 작업에 다시 쓰게 합니다."]],
  [/^\/skills/, ["스킬 카탈로그는 에이전트별 전문 규칙과 직접 실행할 명령을 보여줘, Sugo가 일하는 방식을 이해하게 합니다."]],
  [/^\/harness/, ["하네스 규칙은 기술과 버전에 맞는 검증 기준을 적용해, 프로젝트가 달라도 같은 품질을 유지하게 합니다."]],
  [/^\/playbook/, ["실행 플레이북은 일정 작성부터 검토와 후속 수정까지 연결해, 처음 써도 다음 행동을 바로 찾게 합니다."]],
  [/^\/(settings|integrations)/, ["연동 관리는 외부 시스템의 조회 범위와 비용을 제한해, 필요한 운영 근거를 안전하게 가져옵니다."]],
  [/^\/preferences/, ["환경 설정은 표시 방식과 생활권을 내 작업 환경에 맞춰, 매일 확인할 정보를 더 정확하게 만듭니다."]],
  [/^\/(sessions|workspaces)/, ["워크스페이스는 프로젝트별 진행 상태와 작업 근거를 묶어, 어디를 먼저 살펴볼지 빠르게 알려줍니다."]],
];

export const DEFAULT_PAGE_TIP = "Sugo는 기획부터 검증까지의 근거를 연결해, 다음 행동을 안전하게 선택하도록 돕습니다.";

export function tipsForPath(pathname: string): readonly string[] {
  return PAGE_TIPS.find(([pattern]) => pattern.test(pathname))?.[1] ?? [DEFAULT_PAGE_TIP];
}
