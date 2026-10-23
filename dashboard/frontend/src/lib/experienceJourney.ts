export type DashboardSceneId = "home" | "workspaces" | "schedule" | "weekly" | "skills" | "harness" | "playbook" | "settings";

export interface DashboardScene {
  id: DashboardSceneId;
  stage: string;
  context: string;
  value: string;
  action: { label: string; path: string };
}

const SCENES: Record<DashboardSceneId, DashboardScene> = {
  home: { id: "home", stage: "오늘의 판단", context: "진행 중인 개발과 사람이 확인할 신호를 한곳에서 봅니다.", value: "AI가 멈춘 이유와 지금 결정할 일을 놓치지 않습니다.", action: { label: "일정에서 우선순위 보기", path: "/schedule" } },
  workspaces: { id: "workspaces", stage: "작업 운영", context: "도메인별 개발 흐름, 규칙, 저장소와 실행 이력을 연결합니다.", value: "프로젝트가 늘어나도 작업의 이유와 현재 상태를 잃지 않습니다.", action: { label: "완료 근거 다시 보기", path: "/weekly" } },
  schedule: { id: "schedule", stage: "다음 작업", context: "기능 명세와 목표일을 기준으로 FEAT와 PATCH의 순서를 정합니다.", value: "해야 할 일과 완료한 결과가 같은 개발 계보에 남습니다.", action: { label: "AI 작업 흐름 보기", path: "/sessions" } },
  weekly: { id: "weekly", stage: "근거 회고", context: "완료 목록이 아니라 변경, 검증, 학습과 남은 위험을 다시 봅니다.", value: "지난 판단을 다음 개발에서 재사용할 팀 지식으로 바꿉니다.", action: { label: "작업 규칙 확인하기", path: "/harness" } },
  skills: { id: "skills", stage: "역할과 능력", context: "각 에이전트가 어느 단계에서 어떤 규칙을 적용하는지 확인합니다.", value: "복잡한 자동화를 역할과 책임이 분명한 협업 구조로 이해합니다.", action: { label: "전체 사용 흐름 보기", path: "/playbook" } },
  harness: { id: "harness", stage: "검증 기준", context: "언어와 프레임워크 버전에 맞는 팀의 개발 기준을 선택합니다.", value: "세션과 프로젝트가 달라도 같은 품질 기준으로 검증합니다.", action: { label: "적용할 스킬 보기", path: "/skills" } },
  playbook: { id: "playbook", stage: "제품 사용법", context: "기획에서 검증, 후속 변경과 운영 확인까지 실제 사용 흐름을 따라갑니다.", value: "Sugo가 언제 질문하고 무엇을 증명하며 왜 멈추는지 이해합니다.", action: { label: "첫 개발 일정 만들기", path: "/schedule" } },
  settings: { id: "settings", stage: "연결과 설정", context: "Sugo가 읽는 시스템과 사용자 환경을 안전하게 연결합니다.", value: "개인 환경 값은 분리하고 필요한 데이터만 작업 흐름에 사용합니다.", action: { label: "작업 공간으로 돌아가기", path: "/sessions" } },
};

export function dashboardScene(pathname: string): DashboardScene {
  if (pathname === "/home" || pathname === "/") return SCENES.home;
  if (pathname === "/schedule") return SCENES.schedule;
  if (pathname === "/weekly") return SCENES.weekly;
  if (pathname === "/skills") return SCENES.skills;
  if (pathname === "/harness") return SCENES.harness;
  if (pathname === "/playbook") return SCENES.playbook;
  if (pathname === "/sessions" || pathname.startsWith("/roadmap/")) return SCENES.workspaces;
  return SCENES.settings;
}
