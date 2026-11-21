import { useSyncExternalStore } from "react";

/** Fenêtre de contexte connue par famille de modèle ; la première règle qui correspond l'emporte. */
const RULES: Array<[RegExp, number]> = [
  [/\[1m\]|-1m\b|1m-context/i, 1_000_000],
  [/gemini/i, 1_000_000],
  [/gpt-4\.1|gpt-5\.1-codex-max/i, 1_000_000],
  [/gpt-5|codex|o3|o4/i, 400_000],
  [/gpt-4o|gpt-4-turbo/i, 128_000],
  [/deepseek|qwen|kimi|glm|llama|mistral|grok/i, 128_000],
  [/claude|sonnet|opus|haiku/i, 200_000],
];

export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Tailles réelles, lues dans le catalogue public models.dev (celui d'OpenCode) : « fournisseur/modèle » et « modèle » → jetons. */
const CATALOG_URL = "https://models.dev/api.json";
const CACHE_KEY = "kana-model-windows";
const CACHE_MS = 3 * 24 * 60 * 60 * 1000;

let catalog: Record<string, number> = readCache()?.sizes ?? {};
let version = 0;
const listeners = new Set<() => void>();
let started = false;

function readCache(): { at: number; sizes: Record<string, number> } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

const normalize = (id: string) => id.toLowerCase().replace(/\[.*?\]|:.*$/g, "").trim();

/** Télécharge le catalogue (une fois tous les quelques jours) ; sans réseau, on garde l'ancien ou les règles ci-dessous. */
export function loadModelWindows(): void {
  if (started) return;
  started = true;
  const cached = readCache();
  if (cached && Date.now() - cached.at < CACHE_MS) return;
  fetch(CATALOG_URL)
    .then((r) => r.json())
    .then((all: Record<string, { models?: Record<string, { limit?: { context?: number } }> }>) => {
      const sizes: Record<string, number> = {};
      for (const [provider, info] of Object.entries(all)) {
        for (const [id, model] of Object.entries(info.models ?? {})) {
          const size = model.limit?.context;
          if (!size) continue;
          sizes[`${provider}/${id}`.toLowerCase()] = size;
          sizes[id.toLowerCase()] ??= size;
        }
      }
      catalog = sizes;
      version++;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), sizes }));
      } catch {
        // trop gros pour le stockage : on le retélécharge au prochain lancement
      }
      listeners.forEach((notify) => notify());
    })
    .catch(() => {});
}

/** Se redessine quand le catalogue arrive. */
export function useModelWindowsVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      loadModelWindows();
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => version,
  );
}

/** La taille connue d'un modèle d'après le catalogue, ou rien. */
export function catalogWindowFor(modelId?: string): number | undefined {
  if (!modelId) return undefined;
  const id = normalize(modelId);
  return catalog[id] ?? catalog[id.slice(id.lastIndexOf("/") + 1)];
}

/** La fenêtre de contexte d'un modèle : celle du catalogue, sinon une estimation par famille (200 k si on ne le connaît pas). */
export function contextWindowFor(modelId?: string, agentId?: string): number {
  const known = catalogWindowFor(modelId);
  if (known) return known;
  const key = `${modelId ?? ""} ${agentId === "gemini" ? "gemini" : ""}`;
  for (const [pattern, size] of RULES) if (pattern.test(key)) return size;
  return DEFAULT_CONTEXT_WINDOW;
}
