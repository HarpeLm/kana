import type { PermissionRequest } from "./chatState";

/** Comment les demandes d'autorisation des agents sont traitées. */
export type PermissionMode = "ask" | "plan" | "auto" | "full";

export const MODES: { id: PermissionMode; label: string; description: string }[] = [
  {
    id: "ask",
    label: "Demander l'approbation",
    description: "Toujours demander avant de modifier les fichiers ou d'utiliser Internet",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Créer un plan avant d'apporter des modifications",
  },
  {
    id: "auto",
    label: "Approuver à ma place",
    description: "Demander l'autorisation uniquement pour les actions détectées comme potentiellement dangereuses",
  },
  {
    id: "full",
    label: "Accès complet",
    description: "Accès non restreint à Internet et aux fichiers de votre ordinateur",
  },
];

const KEY = "kana-permission-mode";

export function loadMode(): PermissionMode {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.some((m) => m.id === stored) ? (stored as PermissionMode) : "ask";
  } catch {
    return "ask";
  }
}

export function saveMode(mode: PermissionMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // stockage indisponible : le choix ne sera pas conservé
  }
}

/** Gestes qu'on ne valide jamais seul en mode « Approuver à ma place ». */
const DANGEROUS =
  /\b(rm|sudo|chmod|chown|mkfs|dd|curl|wget|ssh|scp|kill|killall)\b|git\s+(push|reset|clean)|--force|\bforce\b|supprim|delete|drop\s+table|\.env\b|password|mot de passe|secret|token/i;

/**
 * L'option à choisir d'office pour cette demande, ou `null` s'il faut demander à l'utilisateur.
 * On ne choisit jamais qu'une autorisation ponctuelle : refuser ou retenir un choix reste à lui.
 */
export function autoAnswer(mode: PermissionMode, request: Pick<PermissionRequest, "title" | "options">): string | null {
  if (mode === "ask" || mode === "plan") return null;
  if (mode === "auto" && DANGEROUS.test(request.title)) return null;
  return request.options.find((o) => o.kind === "allow_once")?.id ?? null;
}

const PLAN_INSTRUCTION =
  "Mode plan : ne modifie aucun fichier et ne lance aucune commande qui change quoi que ce soit. " +
  "Étudie d'abord le sujet, propose un plan détaillé, puis attends mon accord avant d'agir.\n\n";

/** Le texte réellement envoyé à l'agent : en mode plan, il reçoit la consigne de planifier d'abord. */
export function promptFor(mode: PermissionMode, text: string): string {
  return mode === "plan" ? PLAN_INSTRUCTION + text : text;
}
