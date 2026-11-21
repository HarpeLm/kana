import { useCallback, useEffect, useRef, useState } from "react";
import { AGENTS } from "../data";
import { stopAgent } from "../lib/acp";
import type { ChatState } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import { buildRelayContext } from "../lib/fork";
import { pickTarget, useRelay } from "../lib/relay";
import { problemOf, useUsageVersion } from "../lib/usage";
import type { RelayBannerProps } from "../components/RelayBanner";

const nameOf = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
const clock = (at: number) => new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

interface RelayFlowArgs {
  conversation: Conversation;
  chat: ChatState;
  send: (text: string) => Promise<void>;
  relayTo: (id: string, agentId: string, context: string) => void;
  onOpenRelay: () => void;
}

/**
 * Le relais d'une conversation : quand son fournisseur atteint sa limite (ou refuse la connexion),
 * un bandeau propose de continuer chez le suivant de la liste, ou la bascule se fait toute seule en
 * mode automatique. Le nouvel agent reçoit le résumé de ce qui s'est dit, et le message qui a échoué est renvoyé.
 */
export function useRelayFlow({ conversation, chat, send, relayTo, onOpenRelay }: RelayFlowArgs): RelayBannerProps | null {
  const relay = useRelay();
  useUsageVersion();
  const [dismissed, setDismissed] = useState<string | null>(null);
  /** Le message à renvoyer dès que le nouvel agent est en place. */
  const pending = useRef<{ threadId: string; agentId: string; text: string } | null>(null);
  const handled = useRef<string | null>(null);

  const agentId = conversation.agentId;
  const problem = problemOf(agentId);
  const target = problem ? pickTarget(agentId, relay) : null;
  const problemKey = problem ? `${conversation.id}:${agentId}:${problem.at}` : null;

  const switchTo = useCallback(
    (to: string) => {
      const messages = chat.messages;
      const last = messages[messages.length - 1];
      // Le dernier tour a échoué : on renvoie le message de l'utilisateur au nouvel agent.
      const failed = last?.role === "error";
      const lastUserIndex = failed ? messages.map((m) => m.role).lastIndexOf("user") : -1;
      const resend = failed && lastUserIndex >= 0 ? messages[lastUserIndex].text : null;
      const history = resend ? messages.slice(0, lastUserIndex) : messages.filter((m) => m.role !== "error");
      stopAgent(conversation.id).catch(() => {});
      relayTo(conversation.id, to, history.length > 0 ? buildRelayContext(history, nameOf(agentId)) : "");
      if (resend) pending.current = { threadId: conversation.id, agentId: to, text: resend };
    },
    [chat.messages, conversation.id, agentId, relayTo],
  );

  // Dès que le nouvel agent est en place (`send` a été recréé pour lui), on renvoie le message.
  useEffect(() => {
    const todo = pending.current;
    if (todo && todo.threadId === conversation.id && todo.agentId === agentId) {
      pending.current = null;
      void send(todo.text);
    }
  }, [conversation.id, agentId, send]);

  // Mode automatique : le dernier tour a échoué à cause du fournisseur, on bascule sans demander.
  const lastFailed = chat.messages[chat.messages.length - 1]?.role === "error";
  useEffect(() => {
    if (relay.auto && problemKey && target && lastFailed && !chat.busy && handled.current !== problemKey) {
      handled.current = problemKey;
      switchTo(target);
    }
  }, [relay.auto, problemKey, target, lastFailed, chat.busy, switchTo]);

  if (!problem || chat.busy || dismissed === problemKey) return null;
  const message =
    problem.kind === "limit"
      ? `Limite atteinte sur ${nameOf(agentId)}${problem.until ? ` · reprise vers ${clock(problem.until)}` : ""}`
      : `${nameOf(agentId)} n'est pas connecté ou sa connexion a expiré`;
  return {
    message,
    targetName: target ? nameOf(target) : null,
    onSwitch: () => target && switchTo(target),
    onDismiss: () => setDismissed(problemKey),
    onOpenRelay,
  };
}
