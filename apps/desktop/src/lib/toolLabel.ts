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

/** Nom lisible d'un outil : les outils du Globe sont traduits, les autres gardent leur titre. */
export function toolLabel(tool: ToolCall): string {
  const found = /browser_([a-z_]+)/.exec(`${tool.title} ${field(tool.input, "name") ?? ""}`);
  const action = found ? actions[found[1]] : undefined;
  if (!action) return tool.title;
  const target = field(tool.input, "url") ?? field(tool.input, "text") ?? field(tool.input, "key");
  return target ? `${action} ${target.length > 48 ? `${target.slice(0, 47)}…` : target}` : action;
}
