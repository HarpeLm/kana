import { useSyncExternalStore } from "react";
import { hostOf } from "./address";

const KEY = "kana-favicons";
const MAX = 300;

/** Icônes des sites visités dans le Globe : domaine → adresse de l'image. */
let icons: Record<string, string> = load();
const listeners = new Set<() => void>();
let version = 0;

function load(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const normalize = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Retient l'icône d'une page que le Globe vient de charger. */
export function recordFavicon(pageUrl: string, icon: string): void {
  const host = normalize(hostOf(pageUrl));
  if (!host || icons[host] === icon) return;
  const entries = Object.entries({ ...icons, [host]: icon });
  icons = Object.fromEntries(entries.slice(-MAX));
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(icons));
  } catch {
    // stockage indisponible : l'icône ne sera pas conservée
  }
  listeners.forEach((notify) => notify());
}

export const faviconFor = (host: string): string | undefined => icons[normalize(host)];

/** Change à chaque nouvelle icône : de quoi redessiner les liens qui l'attendaient. */
export function useFaviconVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => version,
  );
}
