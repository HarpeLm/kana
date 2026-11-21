import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";
import { persistSharedSetting } from "./store";

export interface CloudConfig {
  url: string;
  token: string;
  enabled: boolean;
}

export interface CloudHealth {
  ok: boolean;
  version: string;
  authRequired: boolean;
  activeJobs: number;
  uptimeSecs: number;
}

export interface CloudJob {
  id: string;
  prompt: string;
  agent: string;
  mode: string;
  cwd?: string | null;
  status: "queued" | "running" | "done" | "error" | string;
  createdAt: number;
  finishedAt?: number | null;
  output: string;
  error?: string | null;
}

export const CLOUD_CONFIG_KEY = "kana-cloud-config";
const CLOUD_FALLBACK_JOBS_KEY = "kana-cloud-fallback-jobs";

const DEFAULT_CONFIG: CloudConfig = {
  url: "",
  token: "",
  enabled: false,
};

const memoryStore = new Map<string, string>();

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string | null {
  if (hasBrowserStorage()) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore.get(key) ?? null;
}

function writeRaw(key: string, value: string, shared: boolean): void {
  if (hasBrowserStorage()) {
    if (shared) {
      persistSharedSetting(key, value);
    } else {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore storage errors
      }
    }
    return;
  }
  memoryStore.set(key, value);
}

export function loadCloudConfig(): CloudConfig {
  try {
    const parsed = JSON.parse(readRaw(CLOUD_CONFIG_KEY) ?? "null") as Partial<CloudConfig> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG };
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      token: typeof parsed.token === "string" ? parsed.token : "",
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  writeRaw(
    CLOUD_CONFIG_KEY,
    JSON.stringify({
      url: config.url.trim(),
      token: config.token.trim(),
      enabled: !!config.enabled,
    }),
    true,
  );
}

function validateCloudUrl(url: string): string {
  const clean = url.trim().replace(/\/+$/, "");
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    throw new Error("L'URL Kana Cloud doit commencer par http:// ou https://");
  }
  return clean;
}

function loadFallbackJobs(): CloudJob[] {
  try {
    const parsed = JSON.parse(readRaw(CLOUD_FALLBACK_JOBS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CloudJob[]) : [];
  } catch {
    return [];
  }
}

function saveFallbackJobs(jobs: CloudJob[]): void {
  writeRaw(CLOUD_FALLBACK_JOBS_KEY, JSON.stringify(jobs.slice(0, 30)), false);
}

export async function checkCloudHealth(url: string, token?: string): Promise<CloudHealth> {
  const cleanUrl = validateCloudUrl(url);
  const cleanToken = token?.trim() || undefined;
  if (inTauri) {
    return invoke<CloudHealth>("cloud_health_check", { url: cleanUrl, token: cleanToken });
  }
  const jobs = loadFallbackJobs();
  return {
    ok: true,
    version: "0.1.0",
    authRequired: Boolean(cleanToken),
    activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
    uptimeSecs: 42,
  };
}

export async function submitCloudJob(
  url: string,
  token: string | undefined,
  agent: string,
  prompt: string,
  cwd?: string,
): Promise<CloudJob> {
  const cleanUrl = validateCloudUrl(url);
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error("Le prompt de la tâche Cloud est vide.");
  }
  const cleanToken = token?.trim() || undefined;
  if (inTauri) {
    return invoke<CloudJob>("cloud_submit_job", {
      url: cleanUrl,
      token: cleanToken,
      agent,
      prompt: cleanPrompt,
      cwd: cwd?.trim() || undefined,
    });
  }
  const now = Date.now();
  const job: CloudJob = {
    id: `cloud-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: cleanPrompt,
    agent,
    mode: "auto",
    cwd: cwd ?? null,
    status: "done",
    createdAt: now,
    finishedAt: now + 120,
    output: `Tâche Cloud exécutée par ${agent} sur ${cleanUrl} : « ${cleanPrompt} »`,
    error: null,
  };
  saveFallbackJobs([job, ...loadFallbackJobs()]);
  return job;
}

export async function listCloudJobs(url: string, token?: string): Promise<CloudJob[]> {
  const cleanUrl = validateCloudUrl(url);
  const cleanToken = token?.trim() || undefined;
  if (inTauri) {
    return invoke<CloudJob[]>("cloud_list_jobs", { url: cleanUrl, token: cleanToken });
  }
  return loadFallbackJobs();
}
