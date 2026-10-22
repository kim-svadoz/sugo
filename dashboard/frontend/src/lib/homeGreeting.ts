interface GreetingWindow {
  start: number;
  messages: readonly string[];
}

const WINDOWS: readonly GreetingWindow[] = [
  { start: 0, messages: ["아직 깊은 밤이에요. 지금 떠오른 생각만 짧게 남겨두세요.", "집중이 잘되는 밤이라면, 다음 판단 하나만 선명하게 정리해두세요."] },
  { start: 180, messages: ["새벽까지 이어졌네요. 마무리 지점을 정하고 잠깐 멈춰도 좋습니다.", "긴 작업 뒤에는 기록이 남습니다. 결정과 남은 일만 묶어둘까요?"] },
  { start: 360, messages: ["조금 이른 시작이네요. 급한 일보다 어제의 맥락부터 천천히 되찾아보세요.", "하루가 열리기 전, 어제 남은 쟁점부터 가볍게 훑어볼까요?"] },
  { start: 480, messages: ["좋은 아침입니다. 어제 멈춘 지점부터 다시 연결해볼까요?", "오늘 첫 흐름은 리뷰부터. 어제의 판단과 남은 일을 준비했어요."] },
  { start: 570, messages: ["집중하기 좋은 오전이에요. 가장 중요한 기술 판단부터 꺼내보세요.", "오전의 선명한 시간입니다. 막힌 결정 하나를 먼저 끝내볼까요?"] },
  { start: 660, messages: ["오전 흐름이 무르익었네요. 구현보다 먼저 빠진 전제를 확인해볼 시간입니다.", "점심 전 한 번 정리할까요? 지금까지 바뀐 것과 다음 행동을 모았습니다."] },
  { start: 780, messages: ["다시 속도를 올릴 오후예요. 이어갈 맥락을 짧게 정리해뒀습니다.", "오후의 첫 선택이 남은 하루를 만듭니다. 판단이 필요한 일부터 볼까요?"] },
  { start: 900, messages: ["오후의 중심입니다. 진행 중인 일보다 멈춰 있는 판단을 먼저 살펴보세요.", "집중력이 필요한 시간이에요. 리뷰 하나를 깊게 끝내볼까요?"] },
  { start: 1020, messages: ["마감 전에 흐름을 정돈할 시간입니다. 끝낼 일과 넘길 일을 나눠볼까요?", "오늘의 개발이 형태를 갖췄네요. 검증과 남은 위험을 확인해보세요."] },
  { start: 1110, messages: ["업무를 닫기 전, 내일 다시 잡을 수 있도록 맥락을 남겨둘까요?", "오늘의 마지막 정리입니다. 완료보다 이어갈 단서를 분명히 남겨보세요."] },
  { start: 1140, messages: ["긴 하루였어요. 지금은 새 일을 벌이기보다 열린 흐름을 닫을 시간입니다.", "저녁이 되었습니다. 오늘의 결정과 내일의 첫 행동만 남겨둘까요?"] },
  { start: 1320, messages: ["늦은 시간이네요. 꼭 필요한 확인만 마치고 오늘의 개발을 놓아주세요.", "오늘도 충분히 쌓았습니다. 잊기 쉬운 생각 하나만 기록하고 쉬어도 좋습니다."] },
] as const;

export function dailyGreeting(now = new Date()): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const window = [...WINDOWS].reverse().find((candidate) => minutes >= candidate.start) ?? WINDOWS[0];
  return window.messages[now.getDate() % window.messages.length];
}

export const greetingWindowCount = WINDOWS.length;
