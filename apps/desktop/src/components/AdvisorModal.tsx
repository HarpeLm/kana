import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Compass, GitCompare, Loader2, Shield, Sparkles, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AGENTS } from "../data";
import { inTauri } from "../lib/env";
import type { PermissionMode } from "../lib/permissionMode";

export type AdvisorTaskKind = "feature" | "bugfix" | "refactor" | "security" | "ui_globe";
export type AdvisorGoalKind = "turnkey" | "plan_first" | "diff_review" | "visual_globe";

export interface CrossReviewStage {
  step: 1 | 2 | 3;
  role: string;
  agentId: string;
  status: "pending" | "running" | "done";
}

export interface CrossReviewPipelineState {
  taskSummary: string;
  stages: CrossReviewStage[];
}

interface AdvisorRecommendation {
  primaryAgent: string;
  mode: PermissionMode;
  sandbox: boolean;
  useWorktree: boolean;
  implementer: string;
  reviewer: string;
  verifier: string;
  whatSummary: string;
  forWhatSummary: string;
  whyAgent: string;
  whyEnv: string;
  whyCrossReview: string;
}

const TASK_CHOICES: Array<{ id: AdvisorTaskKind; label: string }> = [
  { id: "feature", label: "Nouvelle fonctionnalité" },
  { id: "bugfix", label: "Correction de bug / CI" },
  { id: "refactor", label: "Refactoring & Architecture" },
  { id: "security", label: "Audit Sécurité & Permissions" },
  { id: "ui_globe", label: "Interface UI / Artéfact & Globe" },
];

const GOAL_CHOICES: Array<{ id: AdvisorGoalKind; label: string }> = [
  { id: "turnkey", label: "Livraison clé en main avec tests" },
  { id: "plan_first", label: "Plan d'architecture avant modification" },
  { id: "diff_review", label: "Revue critique du diff existant" },
  { id: "visual_globe", label: "Vérification visuelle bout-en-bout dans le Globe" },
];

/** Analyse intelligente d'une consigne libre pour pré-sélectionner la nature et l'objectif. */
export function inferAdvisorPlanFromText(query: string): {
  taskKind: AdvisorTaskKind;
  goalKind: AdvisorGoalKind;
  note: string;
} {
  const lower = query.toLowerCase();
  let taskKind: AdvisorTaskKind = "feature";
  let goalKind: AdvisorGoalKind = "turnkey";

  if (/(sécur|secur|audit|perm|secret|cve|vuln|auth|token|sandbox)/.test(lower)) {
    taskKind = "security";
    goalKind = "plan_first";
  } else if (/(ui|ux|design|css|html|globe|visuel|responsive|bouton|page|écran|ecran|layout)/.test(lower)) {
    taskKind = "ui_globe";
    goalKind = "visual_globe";
  } else if (/(bug|fix|corrig|erreur|crash|ci|test|fail|cass|regression|régression)/.test(lower)) {
    taskKind = "bugfix";
    goalKind = "turnkey";
  } else if (/(refactor|découp|decoup|archi|nettoy|clean|simplif|migrat)/.test(lower)) {
    taskKind = "refactor";
    goalKind = /(plan|avant|proposition)/.test(lower) ? "plan_first" : "turnkey";
  }

  if (/(plan|architecture avant|sans modifier|lecture seule)/.test(lower)) {
    goalKind = "plan_first";
  } else if (/(relire|review|diff|pr |pull request|merge request)/.test(lower)) {
    goalKind = "diff_review";
  } else if (/(globe|capture|visuel|console|réseau|reseau)/.test(lower)) {
    goalKind = "visual_globe";
  }

  const taskLabel = TASK_CHOICES.find((t) => t.id === taskKind)?.label ?? "Nouvelle fonctionnalité";
  const goalLabel = GOAL_CHOICES.find((g) => g.id === goalKind)?.label ?? "Livraison clé en main";
  return {
    taskKind,
    goalKind,
    note: `Stratégie détectée : ${taskLabel} · ${goalLabel}.`,
  };
}

export function computeAdvisorRecommendation(
  taskKind: AdvisorTaskKind,
  goalKind: AdvisorGoalKind,
): AdvisorRecommendation {
  const planMode = goalKind === "plan_first" || taskKind === "security";
  if (taskKind === "security") {
    return {
      primaryAgent: "claude",
      mode: "plan",
      sandbox: true,
      useWorktree: true,
      implementer: "claude",
      reviewer: "codex",
      verifier: "gemini",
      whatSummary: "Audit de sécurité en lecture seule avec Sandbox OS, règles granulaires et contre-audit croisé.",
      forWhatSummary: "Identifier les failles, secrets exposés ou permissions trop larges sans modifier le dépôt.",
      whyAgent:
        "Claude analyse finement les flux inter-modules (Rust ↔ Tauri ↔ React) et les invariants de sécurité.",
      whyEnv:
        "Le mode `plan` (lecture seule) couplé au Sandbox OS garantit qu'aucun fichier sensible (.env, clés) n'est altéré.",
      whyCrossReview:
        "Claude réalise l'audit initial, Codex vérifie les vecteurs d'injection et règles de permissions, puis Gemini synthétise la couverture.",
    };
  }
  if (taskKind === "ui_globe" || goalKind === "visual_globe") {
    return {
      primaryAgent: "gemini",
      mode: planMode ? "plan" : "auto",
      sandbox: true,
      useWorktree: true,
      implementer: "gemini",
      reviewer: "claude",
      verifier: "codex",
      whatSummary: "Atelier UI & Artéfact avec aperçu en direct et validation dans le navigateur intégré Globe.",
      forWhatSummary: "Produire une interface soignée, responsive et sans erreur console/réseau dans le Globe.",
      whyAgent:
        "Gemini excelle sur les tâches multimodales, le rendu visuel DOM/CSS et l'inspection via les outils MCP du Globe.",
      whyEnv:
        "Un worktree isolé permet d'itérer visuellement et d'exporter une trace HTML Globe avant fusion dans `main`.",
      whyCrossReview:
        "Gemini construit l'UI, Claude relit l'accessibilité et la cohérence architecturale, puis Codex vérifie les tests Playwright E2E.",
    };
  }
  if (taskKind === "bugfix") {
    return {
      primaryAgent: "codex",
      mode: planMode ? "plan" : "auto",
      sandbox: true,
      useWorktree: true,
      implementer: "codex",
      reviewer: "claude",
      verifier: "gemini",
      whatSummary: "Correctif ciblé avec reproduction du bug, patch minimal et suite de tests automatisés.",
      forWhatSummary: "Résoudre la cause racine rapidement tout en garantissant zéro régression sur la CI.",
      whyAgent:
        "Codex est particulièrement chirurgical pour localiser une erreur compilateur/test et écrire le test unitaire associé.",
      whyEnv:
        "Le mode `auto` en worktree isolé + Sandbox OS permet d'exécuter `cargo test` et `tsc` en boucle sans risque.",
      whyCrossReview:
        "Codex implémente le correctif, Claude inspecte les effets de bord dans le diff, et Gemini valide le comportement global.",
    };
  }
  return {
    primaryAgent: "claude",
    mode: planMode ? "plan" : "auto",
    sandbox: true,
    useWorktree: true,
    implementer: "claude",
    reviewer: "codex",
    verifier: "gemini",
    whatSummary:
      "Conception et implémentation structurée dans un worktree Git dédié avec garde-fous de compilation.",
    forWhatSummary:
      goalKind === "plan_first"
        ? "Obtenir un plan d'architecture clair et validé avant toute écriture disque."
        : "Livrer une fonctionnalité complète, typée et relue par trois fournisseurs complémentaires.",
    whyAgent:
      "Claude maintient une excellente cohérence sur les changements multi-fichiers et l'architecture Rust/TypeScript.",
    whyEnv:
      "L'isolation par worktree Git et Sandbox OS protège la branche principale jusqu'à la validation finale.",
    whyCrossReview:
      "Dissocier l'implémenteur (Claude), le relecteur critique du diff (Codex) et le vérificateur final (Gemini) élimine les angles morts.",
  };
}

interface AdvisorModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onApplySingle: (config: {
    agentId: string;
    mode: PermissionMode;
    sandbox: boolean;
    prompt: string;
  }) => void;
  onLaunchCrossReview: (config: {
    implementer: string;
    reviewer: string;
    verifier: string;
    mode: PermissionMode;
    sandbox: boolean;
    taskDescription: string;
  }) => void;
}

export default function AdvisorModal({
  open,
  initialQuery = "",
  onClose,
  onApplySingle,
  onLaunchCrossReview,
}: AdvisorModalProps) {
  const [taskKind, setTaskKind] = useState<AdvisorTaskKind>("feature");
  const [goalKind, setGoalKind] = useState<AdvisorGoalKind>("turnkey");
  const [customTask, setCustomTask] = useState(initialQuery);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const rec = computeAdvisorRecommendation(taskKind, goalKind);
  const [implementer, setImplementer] = useState(rec.implementer);
  const [reviewer, setReviewer] = useState(rec.reviewer);
  const [verifier, setVerifier] = useState(rec.verifier);

  useEffect(() => {
    if (!open) return;
    if (initialQuery) {
      setCustomTask(initialQuery);
      const inferred = inferAdvisorPlanFromText(initialQuery);
      setTaskKind(inferred.taskKind);
      setGoalKind(inferred.goalKind);
      setAiNote(inferred.note);
    } else {
      setAiNote(null);
    }
  }, [open, initialQuery]);

  useEffect(() => {
    const next = computeAdvisorRecommendation(taskKind, goalKind);
    setImplementer(next.implementer);
    setReviewer(next.reviewer);
    setVerifier(next.verifier);
  }, [taskKind, goalKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const taskLabel = TASK_CHOICES.find((t) => t.id === taskKind)?.label ?? "Fonctionnalité";
  const goalLabel = GOAL_CHOICES.find((g) => g.id === goalKind)?.label ?? "Livraison clé en main";
  const effectiveTask = customTask.trim() || `${taskLabel} — ${goalLabel}`;

  const analyzeWithAi = async () => {
    const text = customTask.trim();
    if (!text || aiAnalyzing) return;
    setAiAnalyzing(true);
    try {
      const inferred = inferAdvisorPlanFromText(text);
      setTaskKind(inferred.taskKind);
      setGoalKind(inferred.goalKind);
      let summary = inferred.note;
      if (inTauri) {
        try {
          const refined = await invoke<string>("suggest_title", {
            agent: implementer,
            request: `En 1 phrase courte (max 12 mots), résume l'objectif technique pour : ${text}`,
          });
          if (refined.trim()) {
            summary = `IA : ${refined.trim()} (${inferred.note})`;
          }
        } catch {
          // Repli immédiat sur l'analyse locale
        }
      }
      setAiNote(summary);
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSingleLaunch = () => {
    const prompt = [
      `[Configuration /advisor Kana]`,
      `- Quoi : ${taskLabel} (${effectiveTask})`,
      `- Pour quoi : ${goalLabel}`,
      `- Pourquoi cette approche : ${rec.whyAgent} ${rec.whyEnv}`,
      ``,
      `Consigne : ${effectiveTask}`,
    ].join("\n");
    onApplySingle({
      agentId: implementer,
      mode: rec.mode,
      sandbox: rec.sandbox,
      prompt,
    });
    onClose();
  };

  const handleCrossReviewLaunch = () => {
    onLaunchCrossReview({
      implementer,
      reviewer,
      verifier,
      mode: rec.mode,
      sandbox: rec.sandbox,
      taskDescription: effectiveTask,
    });
    onClose();
  };

  const agentOptions = AGENTS.filter((a) => a.id === "claude" || a.id === "codex" || a.id === "gemini" || a.id === "opencode");

  return (
    <div
      role="dialog"
      aria-label="Conseiller /advisor & Cross-Review"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[#343430] bg-[#1e1e1c] text-[#ecebe4] shadow-2xl">
        {/* En-tête minimaliste */}
        <div className="flex items-center justify-between border-b border-[#2b2b28] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Compass className="h-4.5 w-4.5 text-[#60a5fa]" strokeWidth={1.8} />
            <h2 className="text-[14.5px] font-semibold text-[#f0efe9]">
              Conseiller <code className="font-mono text-[#60a5fa]">/advisor</code>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le conseiller"
            className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2a2a27] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps compact & fluide */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-[13px]">
          {/* Entrée libre + Analyser avec l'IA */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-[#353531] bg-[#161615] p-1.5 focus-within:border-[#52524c]">
              <input
                type="text"
                aria-label="Description précise du besoin"
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void analyzeWithAi();
                  }
                }}
                placeholder="Décris ce que tu veux faire (ex. auditer les permissions, corriger la CI, refaire une vue)…"
                className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-[13.5px] text-[#ecebe4] placeholder-[#73726b] outline-none select-text"
              />
              <button
                type="button"
                disabled={!customTask.trim() || aiAnalyzing}
                onClick={() => void analyzeWithAi()}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2c2c29] px-3 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#383834] disabled:opacity-40"
              >
                {aiAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#60a5fa]" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-[#60a5fa]" strokeWidth={1.8} />
                )}
                <span>{aiAnalyzing ? "Analyse…" : "Configurer avec l'IA"}</span>
              </button>
            </div>
            {aiNote && (
              <p className="flex items-center gap-1.5 px-1 text-[12px] text-[#9ec5fe]">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span>{aiNote}</span>
              </p>
            )}
          </div>

          {/* 1. Quoi (pilules compactes) */}
          <section className="space-y-2">
            <h3 className="text-[12px] font-medium text-[#8c8b83]">
              Qu'est-ce que l'on met en place ?
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {TASK_CHOICES.map((choice) => {
                const active = taskKind === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTaskKind(choice.id)}
                    className={`rounded-full border px-3 py-1 text-[12.5px] transition ${
                      active
                        ? "border-[#3b82f6] bg-[#1e3a8a]/35 text-[#f0efe9]"
                        : "border-[#2f2f2c] bg-[#181817] text-[#b8b7ae] hover:border-[#42423d] hover:text-[#ecebe4]"
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Pour quoi (pilules compactes) */}
          <section className="space-y-2">
            <h3 className="text-[12px] font-medium text-[#8c8b83]">
              Pour quoi / quel objectif ?
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_CHOICES.map((choice) => {
                const active = goalKind === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGoalKind(choice.id)}
                    className={`rounded-full border px-3 py-1 text-[12.5px] transition ${
                      active
                        ? "border-[#3b82f6] bg-[#1e3a8a]/35 text-[#f0efe9]"
                        : "border-[#2f2f2c] bg-[#181817] text-[#b8b7ae] hover:border-[#42423d] hover:text-[#ecebe4]"
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Synthèse & Pipeline Cross-Review (épuré) */}
          <section className="space-y-3 rounded-xl border border-[#2d2d2a] bg-[#181817] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#ecebe4]">
                <GitCompare className="h-3.5 w-3.5 text-[#8ab4f8]" />
                <span>Pourquoi cette configuration ?</span>
              </h3>
              <span className="rounded-full bg-[#242422] px-2 py-0.5 text-[11px] text-[#9a9992]">
                Mode : <strong className="text-[#dcdbd3]">{rec.mode}</strong> · Sandbox OS
              </span>
            </div>

            <div className="space-y-1.5 text-[12px] leading-relaxed text-[#b8b7ae]">
              <p>
                <span className="text-[#ecebe4] font-medium">Agent principal ({implementer}) :</span> {rec.whyAgent}
              </p>
              <p>
                <span className="text-[#ecebe4] font-medium">Environnement :</span> {rec.whyEnv}
              </p>
            </div>

            {/* Chaîne Cross-Review inline A → B → C */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[#282825] pt-2.5 text-[12px]">
              <span className="text-[11.5px] text-[#8c8b83]">Pipeline :</span>
              <select
                aria-label="Agent Étape 1 (Implémentation)"
                value={implementer}
                onChange={(e) => setImplementer(e.target.value)}
                className="rounded-lg border border-[#343430] bg-[#21211f] px-2 py-1 text-[12px] text-[#ecebe4] outline-none"
              >
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    1. {a.name}
                  </option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-[#6f6e68]" />
              <select
                aria-label="Agent Étape 2 (Cross-Review)"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="rounded-lg border border-[#343430] bg-[#21211f] px-2 py-1 text-[12px] text-[#ecebe4] outline-none"
              >
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    2. {a.name}
                  </option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-[#6f6e68]" />
              <select
                aria-label="Agent Étape 3 (Vérification)"
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                className="rounded-lg border border-[#343430] bg-[#21211f] px-2 py-1 text-[12px] text-[#ecebe4] outline-none"
              >
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    3. {a.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>

        {/* Pied de page sobre */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2b2b28] px-5 py-3">
          <span className="flex items-center gap-1.5 text-[11.5px] text-[#8c8b83]">
            <Shield className="h-3.5 w-3.5 text-[#3fb950]" />
            <span>Worktree isolé · Sandbox OS</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSingleLaunch}
              className="flex items-center gap-1.5 rounded-xl border border-[#383834] bg-[#262624] px-3.5 py-1.5 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#32322f]"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" />
              <span>Appliquer et lancer la tâche</span>
            </button>
            <button
              type="button"
              onClick={handleCrossReviewLaunch}
              className="flex items-center gap-1.5 rounded-xl bg-[#1e40af] px-3.5 py-1.5 text-[12.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb]"
            >
              <span>Lancer le pipeline Cross-Review (3 agents)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
