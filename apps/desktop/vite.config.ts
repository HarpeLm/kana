import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;


export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  // Les tests unitaires sont à côté du code (*.test.ts) ; ceux de l'écran sont dans e2e/.
  test: { include: ["src/**/*.test.{ts,tsx}"], environment: "node" },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
