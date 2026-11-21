import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface AuthMethod {
  id: string;
  name: string;
  description: string;
}

export type AgentStatus =
  | { status: "ready" }
  | { status: "auth_required"; methods: AuthMethod[] };

// Simulation pour un navigateur sans Tauri : rien n'est réellement stocké ni connecté.
const demoKeys = new Set<string>();
const demoStatus: AgentStatus = {
  status: "auth_required",
  methods: [
    {
      id: "demo",
      name: "Se connecter (démo)",
      description: "Mode navigateur : aucune vraie connexion.",
    },
  ],
};

export function checkAgent(agent: string): Promise<AgentStatus> {
  return inTauri ? invoke("check_agent", { agent }) : Promise.resolve(demoStatus);
}

export function loginAgent(agent: string, methodId: string): Promise<void> {
  return inTauri ? invoke("login_agent", { agent, methodId }) : Promise.resolve();
}

export function hasApiKey(agent: string): Promise<boolean> {
  return inTauri ? invoke("has_api_key", { agent }) : Promise.resolve(demoKeys.has(agent));
}

export function setApiKey(agent: string, key: string): Promise<void> {
  if (inTauri) return invoke("set_api_key", { agent, key });
  demoKeys.add(agent);
  return Promise.resolve();
}

export function deleteApiKey(agent: string): Promise<void> {
  if (inTauri) return invoke("delete_api_key", { agent });
  demoKeys.delete(agent);
  return Promise.resolve();
}

export function setKeepAwake(active: boolean): Promise<boolean> {
  return inTauri ? invoke<boolean>("set_keep_awake", { active }) : Promise.resolve(active);
}

export interface NotificationPrefs {
  enabled: boolean;
  sound: boolean;
}

export interface OsNotificationEntry {
  title: string;
  body: string;
  sound: boolean;
  at: number;
}

const NOTIFICATIONS_KEY = "kana-notifications";
const DEFAULT_NOTIFICATIONS: NotificationPrefs = { enabled: true, sound: true };

function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return DEFAULT_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return DEFAULT_NOTIFICATIONS;
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed?.enabled !== false,
      sound: parsed?.sound !== false,
    };
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

let notificationPrefs: NotificationPrefs = loadNotificationPrefs();
const notificationListeners = new Set<() => void>();
const notificationHistory: OsNotificationEntry[] = [];

export function getNotificationPrefs(): NotificationPrefs {
  return notificationPrefs;
}

export function setNotificationPrefs(next: NotificationPrefs): void {
  notificationPrefs = { enabled: !!next.enabled, sound: !!next.sound };
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notificationPrefs));
    } catch {
      // stockage indisponible : le choix ne sera pas conservé
    }
  }
  notificationListeners.forEach((notify) => notify());
}

export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(
    (notify) => {
      notificationListeners.add(notify);
      return () => notificationListeners.delete(notify);
    },
    () => notificationPrefs,
  );
}

export function getNotificationHistory(): readonly OsNotificationEntry[] {
  return notificationHistory;
}

export function clearNotificationHistory(): void {
  notificationHistory.length = 0;
}

/** Envoie une notification système macOS (ou navigateur hors Tauri si la permission est déjà accordée). */
export function notifyOs(title: string, body: string): void {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return;
  if (inTauri) {
    void invoke("notify_user", { title, body, sound: prefs.sound }).catch(() => {});
    return;
  }
  notificationHistory.push({ title, body, sound: prefs.sound, at: Date.now() });
  if (notificationHistory.length > 50) notificationHistory.shift();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, silent: !prefs.sound });
    } catch {
      // Notification navigateur indisponible dans cet environnement.
    }
  }
}

export interface AdapterCacheInfo {
  agent_id: string;
  package: string;
  binary: string;
  cached: boolean;
  local_path: string | null;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  channel: string;
  releaseNotes: string;
}

const demoAdapterCaches = new Map<string, AdapterCacheInfo>([
  [
    "claude",
    {
      agent_id: "claude",
      package: "@zed-industries/claude-agent-acp",
      binary: "claude-agent-acp",
      cached: false,
      local_path: null,
    },
  ],
  [
    "codex",
    {
      agent_id: "codex",
      package: "@zed-industries/codex-acp",
      binary: "codex-acp",
      cached: false,
      local_path: null,
    },
  ],
  [
    "gemini",
    {
      agent_id: "gemini",
      package: "@google/gemini-cli",
      binary: "gemini",
      cached: false,
      local_path: null,
    },
  ],
]);

export function listAdapterCaches(): Promise<AdapterCacheInfo[]> {
  if (inTauri) return invoke("list_adapter_caches");
  return Promise.resolve([...demoAdapterCaches.values()]);
}

export function installAdapterCache(agentId: string): Promise<AdapterCacheInfo> {
  if (inTauri) return invoke("install_adapter_cache", { agentId });
  const existing = demoAdapterCaches.get(agentId) ?? {
    agent_id: agentId,
    package: `@zed-industries/${agentId}-acp`,
    binary: `${agentId}-acp`,
    cached: true,
    local_path: `~/.kana/adapters/node_modules/.bin/${agentId}-acp`,
  };
  const updated: AdapterCacheInfo = {
    ...existing,
    cached: true,
    local_path: `~/.kana/adapters/node_modules/.bin/${existing.binary}`,
  };
  demoAdapterCaches.set(agentId, updated);
  return Promise.resolve(updated);
}

export function checkAppUpdate(): Promise<AppUpdateInfo> {
  if (inTauri) return invoke("check_app_update");
  return Promise.resolve({
    currentVersion: "0.1.0",
    latestVersion: "0.1.0",
    updateAvailable: false,
    channel: "stable",
    releaseNotes: "Kana 0.1.0 est à jour (auto-updater Tauri v2 + Homebrew Cask).",
  });
}
