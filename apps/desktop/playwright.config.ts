import { defineConfig } from "@playwright/test";

// Les tests de l'écran tournent contre l'interface dans le navigateur (agent simulé, sans Tauri).
export default defineConfig({
  testDir: "e2e",
  timeout: 20_000,
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:1420", viewport: { width: 1280, height: 800 } },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
