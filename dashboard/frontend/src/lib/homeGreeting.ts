interface GreetingWindow {
  start: number;
  messages: readonly string[];
}

const WINDOWS: readonly GreetingWindow[] = [
  { start: 0, messages: ["늦은 밤입니다. 떠오른 생각은 메모에 적어 두고 내일 이어가세요.", "자정이 넘었습니다. 진행 중인 작업은 저장됐는지만 확인하세요."] },
  { start: 180, messages: ["새벽입니다. 하던 작업은 다음 할 일만 적어 두고 멈춰도 됩니다.", "새벽까지 작업했네요. 남은 일은 내일 이어서 해도 됩니다."] },
  { start: 360, messages: ["이른 아침입니다. 어제 끝낸 작업부터 가볍게 확인해 보세요.", "일찍 시작했네요. 어제 남긴 일을 먼저 확인해 보세요."] },
  { start: 480, messages: ["좋은 아침입니다. 어제 멈춘 작업부터 이어가 볼까요?", "좋은 아침입니다. 오늘 확인할 리뷰를 먼저 모았습니다."] },
  { start: 570, messages: ["오전입니다. 확인을 기다리는 작업부터 처리해 보세요.", "오전입니다. 막혀 있는 작업 하나를 먼저 풀어 보세요."] },
  { start: 660, messages: ["점심 전입니다. 오전에 바뀐 내용을 한 번 확인해 보세요.", "점심 전에 끝낼 수 있는 작업이 있는지 확인해 보세요."] },
  { start: 780, messages: ["오후입니다. 오전에 하던 작업을 이어가 볼까요?", "오후입니다. 확인이 필요한 작업부터 보세요."] },
  { start: 900, messages: ["늦은 오후입니다. 멈춰 있는 작업이 없는지 확인해 보세요.", "리뷰 하나를 끝까지 마치기 좋은 시간입니다."] },
  { start: 1020, messages: ["퇴근 전입니다. 오늘 끝낼 일과 내일로 넘길 일을 나눠 보세요.", "오늘 작업의 테스트 결과와 남은 위험을 확인해 보세요."] },
  { start: 1110, messages: ["오늘 작업을 정리할 시간입니다. 내일 할 일을 적어 두세요.", "마무리하기 전에 진행 중인 작업의 상태를 남겨 두세요."] },
  { start: 1140, messages: ["저녁입니다. 새 작업보다 진행 중인 작업을 마무리해 보세요.", "저녁입니다. 내일 처음 할 일 하나만 정해 두세요."] },
  { start: 1320, messages: ["늦은 시간입니다. 꼭 필요한 확인만 하고 쉬세요.", "오늘 작업은 기록되어 있습니다. 내일 이어가세요."] },
] as const;

export function dailyGreeting(now = new Date()): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const window = [...WINDOWS].reverse().find((candidate) => minutes >= candidate.start) ?? WINDOWS[0];
  return window.messages[now.getDate() % window.messages.length];
}

export const greetingWindowCount = WINDOWS.length;
