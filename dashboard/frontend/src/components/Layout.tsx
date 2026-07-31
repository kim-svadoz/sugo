import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
