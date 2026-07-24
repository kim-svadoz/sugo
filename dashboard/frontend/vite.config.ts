import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// §1/§5: frontend talks to the backend over plain REST; VITE_API_BASE lets
// dev point at a locally running backend (see ../backend) without a proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
