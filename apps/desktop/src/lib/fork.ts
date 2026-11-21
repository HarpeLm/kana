import type { ChatMessage } from "./chatState";
import { getLocale, type Locale } from "./i18n";

const FORK_INTRO_FR = "Cette conversation est une bifurcation d'une conversation précédente.";
const FORK_INTRO_EN = "This conversation is a fork of a previous conversation.";

/** Au-delà, le début de la conversation d'origine est coupé : l'agent a une mémoire limitée. */
const MAX_CHARS = 12_000;

/**
 * Le résumé d'une conversation à glisser dans le premier message d'une bifurcation : le nouvel
 * agent démarre à neuf et ne se souvient de rien, il faut donc lui raconter ce qui s'est dit.
 */
export function buildForkContext(
  messages: ChatMessage[],
  intro?: string,
  locale: Locale = getLocale(),
): string {
  const isEn = locale === "en";
  const effectiveIntro = intro ?? (isEn ? FORK_INTRO_EN : FORK_INTRO_FR);
  const userLabel = isEn ? "User" : "Utilisateur";
  const sep = isEn ? ": " : " : ";
  const lines = messages
    .filter((m) => (m.role === "user" || m.role === "agent") && m.text.trim())
    .map((m) => `${m.role === "user" ? userLabel : "Agent"}${sep}${m.text.trim()}`);
  let body = lines.join("\n\n");
  if (body.length > MAX_CHARS) body = `[…]\n${body.slice(body.length - MAX_CHARS)}`;
  if (isEn) {
    return (
      `${effectiveIntro} Here is what was discussed so far so you have context:\n\n` +
      `${body}\n\n---\nNow, here is my new message:\n\n`
    );
  }
  return (
    `${effectiveIntro} Voici ce qui s'y est dit jusqu'ici, pour que tu aies le contexte :\n\n` +
    `${body}\n\n---\nMaintenant, voici mon nouveau message :\n\n`
  );
}

/** Le contexte donné au fournisseur qui prend le relais d'un autre qui a atteint sa limite. */
export const buildRelayContext = (
  messages: ChatMessage[],
  fromName: string,
  locale: Locale = getLocale(),
) =>
  buildForkContext(
    messages,
    locale === "en"
      ? `This conversation continues with another provider because ${fromName} cannot respond right now.`
      : `Cette conversation se poursuit avec un autre fournisseur, car ${fromName} ne peut plus répondre pour l'instant.`,
    locale,
  );

/** Les échanges récents sont gardés en entier jusqu'à ce volume ; au-delà, chaque ancien message est raccourci. */
const RECENT_CHARS = 8_000;
const OLD_MESSAGE_CHARS = 240;
const COMPACT_INTRO_FR =
  "La session de l'agent a été compactée pour libérer sa mémoire : voici un résumé de la conversation, avec les échanges récents en entier et les plus anciens raccourcis.";
const COMPACT_INTRO_EN =
  "The agent session was compacted to free up context memory: here is a summary of the conversation, with recent exchanges in full and older ones shortened.";
const RESUME_INTRO_FR =
  "Cette conversation reprend après un redémarrage de l'application ou de l'agent : voici le contexte des échanges précédents, avec les plus récents en entier et les plus anciens raccourcis.";
const RESUME_INTRO_EN =
  "This conversation is resuming after an application or agent restart: here is the context from previous exchanges, with recent ones in full and older ones shortened.";

function formatCondensedHistory(talk: ChatMessage[], intro: string, locale: Locale): string {
  const isEn = locale === "en";
  const userLabel = isEn ? "User" : "Utilisateur";
  const sep = isEn ? ": " : " : ";
  const lines: string[] = [];
  let recent = 0;
  for (let i = talk.length - 1; i >= 0; i--) {
    const m = talk[i];
    const text = m.text.trim();
    const full = recent + text.length <= RECENT_CHARS;
    recent += text.length;
    const shown = full ? text : text.length > OLD_MESSAGE_CHARS ? `${text.slice(0, OLD_MESSAGE_CHARS)}…` : text;
    lines.unshift(`${m.role === "user" ? userLabel : "Agent"}${sep}${shown}`);
  }
  const trailer = isEn ? "Now, here is my new message:" : "Maintenant, voici mon nouveau message :";
  return `${intro}\n\n${lines.join("\n\n")}\n\n---\n${trailer}\n\n`;
}

function talkMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => (m.role === "user" || m.role === "agent") && m.text.trim());
}

/**
 * Le contexte d'une session compactée : l'agent repart de zéro avec ce résumé au lieu de tout l'historique.
 * Les messages les plus récents restent complets, les anciens sont réduits à leur début.
 */
export function buildCompactContext(messages: ChatMessage[], locale: Locale = getLocale()): string {
  return formatCondensedHistory(
    talkMessages(messages),
    locale === "en" ? COMPACT_INTRO_EN : COMPACT_INTRO_FR,
    locale,
  );
}

/**
 * Le contexte de reprise après un redémarrage lorsque l'agent ne peut pas reprendre via `session/load`.
 * Renvoie une chaîne vide s'il n'y a aucun échange exploitable.
 */
export function buildResumeContext(messages: ChatMessage[], locale: Locale = getLocale()): string {
  const talk = talkMessages(messages);
  if (talk.length === 0) return "";
  return formatCondensedHistory(talk, locale === "en" ? RESUME_INTRO_EN : RESUME_INTRO_FR, locale);
}
