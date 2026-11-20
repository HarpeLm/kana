import type { ChatMessage } from "./chatState";

/** Au-delà, le début de la conversation d'origine est coupé : l'agent a une mémoire limitée. */
const MAX_CHARS = 12_000;

/**
 * Le résumé d'une conversation à glisser dans le premier message d'une bifurcation : le nouvel
 * agent démarre à neuf et ne se souvient de rien, il faut donc lui raconter ce qui s'est dit.
 */
export function buildForkContext(messages: ChatMessage[]): string {
  const lines = messages
    .filter((m) => (m.role === "user" || m.role === "agent") && m.text.trim())
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Agent"} : ${m.text.trim()}`);
  let body = lines.join("\n\n");
  if (body.length > MAX_CHARS) body = `[…]\n${body.slice(body.length - MAX_CHARS)}`;
  return (
    "Cette conversation est une bifurcation d'une conversation précédente. " +
    "Voici ce qui s'y est dit jusqu'ici, pour que tu aies le contexte :\n\n" +
    `${body}\n\n---\nMaintenant, voici mon nouveau message :\n\n`
  );
}
