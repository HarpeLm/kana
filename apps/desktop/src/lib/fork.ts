import type { ChatMessage } from "./chatState";

const FORK_INTRO = "Cette conversation est une bifurcation d'une conversation précédente.";

/** Au-delà, le début de la conversation d'origine est coupé : l'agent a une mémoire limitée. */
const MAX_CHARS = 12_000;

/**
 * Le résumé d'une conversation à glisser dans le premier message d'une bifurcation : le nouvel
 * agent démarre à neuf et ne se souvient de rien, il faut donc lui raconter ce qui s'est dit.
 */
export function buildForkContext(messages: ChatMessage[], intro: string = FORK_INTRO): string {
  const lines = messages
    .filter((m) => (m.role === "user" || m.role === "agent") && m.text.trim())
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Agent"} : ${m.text.trim()}`);
  let body = lines.join("\n\n");
  if (body.length > MAX_CHARS) body = `[…]\n${body.slice(body.length - MAX_CHARS)}`;
  return (
    `${intro} Voici ce qui s'y est dit jusqu'ici, pour que tu aies le contexte :\n\n` +
    `${body}\n\n---\nMaintenant, voici mon nouveau message :\n\n`
  );
}

/** Le contexte donné au fournisseur qui prend le relais d'un autre qui a atteint sa limite. */
export const buildRelayContext = (messages: ChatMessage[], fromName: string) =>
  buildForkContext(messages, `Cette conversation se poursuit avec un autre fournisseur, car ${fromName} ne peut plus répondre pour l'instant.`);
