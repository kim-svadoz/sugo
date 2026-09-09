import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { CommandPalette } from "./CommandPalette.js";
import { Header } from "./Header.js";
import { Sidebar } from "./Sidebar.js";

/**
 * 설계안 Layout. **⌘K/Ctrl+K 토글은 여기에만 둔다** — 팔레트 안에도 넣으면 열려 있을 때
 * 두 핸들러가 같은 키를 잡아 토글이 서로를 상쇄한다.
 *
 * 주의(설계안 말미): 이 레이아웃 계열 6파일 어디에도 `setInterval`이 없다. 갱신은 수동
 * 새로고침(사이드바 버튼 / ⌘R)이다 — 자동 폴링은 Activity 스트림에만 있다.
 */
export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      switch (e.key.toLowerCase()) {
        case "k":
          e.preventDefault();
          setPaletteOpen((v) => !v);
          return;
        // 팔레트가 표시하던 ⌘S/⌘P를 실제 동작으로 만든다 — 라벨만 있고 핸들러가 없으면
        // "있다고 말하는 게 없는 것보다 나쁘다"에 걸린다.
        // ⌘W(탭 닫기)·⌘H(macOS 앱 숨기기)는 브라우저/OS가 페이지보다 먼저 가져가 가로챌 수
        // 없으므로 구현 대신 팔레트에서 힌트를 뗐다.
        // ⌘R은 가로채지 않는다 — 브라우저 기본 새로고침이 곧 "데이터 새로고침"이라 이미 맞다.
        case "s":
          e.preventDefault();
          setPaletteOpen(false);
          navigate("/skills");
          return;
        case "p":
          e.preventDefault();
          setPaletteOpen(false);
          navigate("/playbook");
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
