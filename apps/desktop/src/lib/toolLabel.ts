import type { ToolCall } from "./chatState";

const actions: Record<string, string> = {
  navigate: "Aller sur",
  snapshot: "Lire la page",
  click: "Cliquer",
  type: "Saisir du texte",
  press_key: "Appuyer sur une touche",
  select_option: "Choisir une option",
  scroll: "Faire défiler",
  back: "Page précédente",
  forward: "Page suivante",
  reload: "Recharger la page",
  wait: "Attendre",
};

function field(input: unknown, name: string): string | null {
  if (input && typeof input === "object") {
    const value = (input as Record<string, unknown>)[name];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Libellé d'une action du Globe, avec sa cible si on la connaît. */
function describe(action: string, target: string | null): string {
  const label = actions[action];
  if (!label) return action;
  if (!target) return label;
  return `${label} ${target.length > 48 ? `${target.slice(0, 47)}…` : target}`;
}

/**
 * OpenCode regroupe ses appels dans un script JavaScript (« execute ») : on y relit les outils
 * du Globe, dans l'ordre, pour les nommer.
 */
function fromScript(code: string): string | null {
  const steps: string[] = [];
  for (const call of code.matchAll(/browser_([a-z_]+)\(\s*(\{[^}]*\})?/g)) {
    const target = /(?:url|text|key)\s*:\s*["'`]([^"'`]+)["'`]/.exec(call[2] ?? "");
    steps.push(describe(call[1], target?.[1] ?? null));
  }
  return steps.length > 0 ? steps.join(" → ") : null;
}

/** Nom lisible d'un outil : les outils du Globe sont traduits, les autres gardent leur titre. */
export function toolLabel(tool: ToolCall): string {
  const code = field(tool.input, "code");
  const scripted = code ? fromScript(code) : null;
  if (scripted) return scripted;
  const found = /browser_([a-z_]+)/.exec(`${tool.title} ${field(tool.input, "name") ?? ""}`);
  if (!found || !actions[found[1]]) return tool.title;
  return describe(found[1], field(tool.input, "url") ?? field(tool.input, "text") ?? field(tool.input, "key"));
}
