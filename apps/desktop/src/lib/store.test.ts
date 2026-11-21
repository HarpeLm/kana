import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHARED_SETTING_KEYS } from "./store";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

describe("store shared settings", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.doUnmock("./env");
    vi.doUnmock("@tauri-apps/api/core");
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("expose toutes les clés de configuration partagées entre Desktop et CLI", () => {
    expect(SHARED_SETTING_KEYS).toEqual([
      "kana-mcp-servers",
      "kana-skills",
      "kana-hooks",
      "kana-rules-fallback",
      "kana-permission-mode",
      "kana-permission-rules",
      "kana-permission-audit",
      "kana-project-memory",
      "kana-scheduled-tasks",
      "kana-scheduled-runs",
      "kana-usage",
      "kana-locale",
    ]);
  });

  it("persiste dans localStorage sans appel Tauri hors mode Desktop", async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("./env", () => ({ inTauri: false }));
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

    const { persistSharedSetting, hydrateSharedSettings } = await import("./store");
    persistSharedSetting("kana-locale", "en");
    expect(localStorage.getItem("kana-locale")).toBe("en");
    await hydrateSharedSettings();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("synchronise persistSharedSetting et hydrateSharedSettings avec SQLite en mode Tauri", async () => {
    const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "db_sync_settings") {
        const entries = (args?.entries as Record<string, string>) ?? {};
        return {
          ...entries,
          "kana-permission-mode": "auto",
          "kana-project-memory": JSON.stringify({ "/repo": ["Note partagée"] }),
        };
      }
      return undefined;
    });
    vi.doMock("./env", () => ({ inTauri: true }));
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

    localStorage.setItem("kana-locale", "en");

    const { persistSharedSetting, hydrateSharedSettings } = await import("./store");
    await hydrateSharedSettings();

    expect(invokeMock).toHaveBeenCalledWith("db_sync_settings", {
      entries: { "kana-locale": "en" },
    });
    expect(localStorage.getItem("kana-locale")).toBe("en");
    expect(localStorage.getItem("kana-permission-mode")).toBe("auto");
    expect(localStorage.getItem("kana-project-memory")).toBe(JSON.stringify({ "/repo": ["Note partagée"] }));

    persistSharedSetting("kana-permission-mode", "full");
    expect(localStorage.getItem("kana-permission-mode")).toBe("full");
    expect(invokeMock).toHaveBeenCalledWith("db_set_setting", {
      key: "kana-permission-mode",
      value: "full",
    });
  });
});
