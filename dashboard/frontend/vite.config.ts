import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 버전 표시(Console vs Plugin 2축): 대시보드(Console) 버전은 **빌드 타임에 박는다.**
// 런타임 API로 받아오면 백엔드가 죽었을 때 "지금 내가 무슨 버전을 보고 있는지"조차 알 수 없는데,
// 그건 장애 상황에서 가장 먼저 필요한 정보다. 플러그인 버전은 반대로 sync된 값이라 런타임 조회.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// frontend talks to the backend over plain REST; VITE_API_BASE lets
// dev point at a locally running backend (see ../backend) without a proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __DASHBOARD_VERSION__: JSON.stringify(pkg.version),
  },
});
