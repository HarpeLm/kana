import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Compass, GitCompare, Shield, Sparkles, X } from "lucide-react";
import { AGENTS } from "../data";
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

const TASK_CHOICES: Array<{ id: AdvisorTaskKind; label: string; subtitle: string }> = [
  {
    id: "feature",
    label: "Nouvelle fonctionnalité",
    subtitle: "Conception et implémentation bout-en-bout (Rust / TypeScript)",
  },
  {
    id: "bugfix",
    label: "Correction de bug / CI",
    subtitle: "Diagnostic précis, correctif chirurgical et test de non-régression",
  },
  {
    id: "refactor",
    label: "Refactoring & Architecture",
    subtitle: "Découpage multi-fichiers, typage strict et propreté du domaine",
  },
  {
    id: "security",
    label: "Audit Sécurité & Permissions",
    subtitle: "Analyse des flux sensibles, secrets, sandbox et règles d'accès",
  },
  {
    id: "ui_globe",
    label: "Interface UI / Artéfact & Globe",
    subtitle: "Composants visuels, maquettes HTML et vérification dans le Globe",
  },
];

const GOAL_CHOICES: Array<{ id: AdvisorGoalKind; label: string; subtitle: string }> = [
  {
    id: "turnkey",
    label: "Livraison clé en main avec tests",
    subtitle: "Code appliqué dans un worktree isolé + tests unitaires validés",
  },
  {
    id: "plan_first",
    label: "Plan d'architecture avant modification",
    subtitle: "Exploration en lecture seule avec plan détaillé à approuver",
  },
  {
    id: "diff_review",
    label: "Revue critique du diff existant",
    subtitle: "Analyse multi-fournisseurs des changements et détection d'angles morts",
  },
  {
    id: "visual_globe",
    label: "Vérification visuelle bout-en-bout dans le Globe",
    subtitle: "Inspection UI responsive, console DevTools et trace HTML",
  },
];

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

  const rec = computeAdvisorRecommendation(taskKind, goalKind);
  const [implementer, setImplementer] = useState(rec.implementer);
  const [reviewer, setReviewer] = useState(rec.reviewer);
  const [verifier, setVerifier] = useState(rec.verifier);

  useEffect(() => {
    if (open && initialQuery) {
      setCustomTask(initialQuery);
    }
  }, [open, initialQuery]);

  useEffect(() => {
    const next = computeAdvisorRecommendation(taskKind, goalKind);
    setImplementer(next.implementer);
    setReviewer(next.reviewer);
    setVerifier(next.verifier);
  }, [taskKind, goalKind]);

  if (!open) return null;

  const taskLabel = TASK_CHOICES.find((t) => t.id === taskKind)?.label ?? "Fonctionnalité";
  const goalLabel = GOAL_CHOICES.find((g) => g.id === goalKind)?.label ?? "Livraison clé en main";
  const effectiveTask = customTask.trim() || `${taskLabel} — ${goalLabel}`;

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

  return (
    <div
      role="dialog"
      aria-label="Conseiller /advisor & Cross-Review"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-[#383834] bg-[#20201e] text-[#ecebe4] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2e2e2b] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-[#d97757]" strokeWidth={1.8} />
            <div>
              <h2 className="text-[15px] font-semibold">
                Conseiller interactif <code>/advisor</code> & Workflows Cross-Review
              </h2>
              <p className="text-[12px] text-[#9a9992]">
                Définissons ensemble : qu'est-ce que l'on met en place, pour quel objectif, et pourquoi cette orchestration.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le conseiller"
            className="rounded-lg p-1.5 text-[#9a9992] transition hover:bg-[#2e2e2b] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-[13px]">
          {/* Question 1 : QUOI */}
          <section className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#f0efe9]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d97757]/20 text-[11.5px] text-[#d97757]">
                1
              </span>
              <span>Qu'est-ce que l'on met en place ? (Nature de la tâche)</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TASK_CHOICES.map((choice) => {
                const active = taskKind === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTaskKind(choice.id)}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-[#d97757] bg-[#d97757]/15 text-[#f0efe9]"
                        : "border-[#32322f] bg-[#191918] text-[#dcdbd3] hover:border-[#454541]"
                    }`}
                  >
                    <span className="font-medium">{choice.label}</span>
                    <span className="mt-0.5 text-[11.5px] text-[#8c8b83]">{choice.subtitle}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              aria-label="Description précise du besoin"
              value={customTask}
              onChange={(e) => setCustomTask(e.target.value)}
              placeholder="Précise ce que tu veux construire, corriger ou auditer…"
              className="w-full rounded-xl border border-[#343431] bg-[#181817] px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#78776f] outline-none focus:border-[#d97757] select-text"
            />
          </section>

          {/* Question 2 : POUR QUOI */}
          <section className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#f0efe9]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d97757]/20 text-[11.5px] text-[#d97757]">
                2
              </span>
              <span>Pour quoi / quel objectif ? (Livrable & niveau d'exigence)</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GOAL_CHOICES.map((choice) => {
                const active = goalKind === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGoalKind(choice.id)}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-[#d97757] bg-[#d97757]/15 text-[#f0efe9]"
                        : "border-[#32322f] bg-[#191918] text-[#dcdbd3] hover:border-[#454541]"
                    }`}
                  >
                    <span className="font-medium">{choice.label}</span>
                    <span className="mt-0.5 text-[11.5px] text-[#8c8b83]">{choice.subtitle}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Question 3 : POURQUOI */}
          <section className="space-y-3 rounded-2xl border border-[#363632] bg-[#181816] p-4">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-[#f0efe9]">
              <Sparkles className="h-4 w-4 text-[#d97757]" />
              <span>3. Pourquoi cette configuration ? (Recommandation argumentée)</span>
            </h3>

            <div className="space-y-2 text-[12.5px] text-[#dcdbd3]">
              <p>
                <strong className="text-[#f0efe9]">Ce que l'on met :</strong> {rec.whatSummary}
              </p>
              <p>
                <strong className="text-[#f0efe9]">Pour quoi :</strong> {rec.forWhatSummary}
              </p>
              <p>
                <strong className="text-[#f0efe9]">Pourquoi cet agent principal ({implementer}) :</strong>{" "}
                {rec.whyAgent}
              </p>
              <p>
                <strong className="text-[#f0efe9]">
                  Pourquoi ce mode ({rec.mode === "plan" ? "Plan lecture seule" : "Exécution contrôlée"} + Sandbox OS) :
                </strong>{" "}
                {rec.whyEnv}
              </p>
              <p>
                <strong className="text-[#f0efe9]">Pourquoi le pipeline Cross-Review :</strong>{" "}
                {rec.whyCrossReview}
              </p>
            </div>

            <div className="border-t border-[#2c2c29] pt-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[#c8c7bf]">
                <GitCompare className="h-3.5 w-3.5 text-[#8ab4f8]" />
                <span>Pipeline Cross-Review multi-fournisseurs (personnalisable)</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-2.5">
                  <span className="text-[11px] text-[#9a9992]">Étape 1 · Implémentation</span>
                  <select
                    aria-label="Agent Étape 1 Implémentation"
                    value={implementer}
                    onChange={(e) => setImplementer(e.target.value)}
                    className="rounded-lg border border-[#343431] bg-[#161615] px-2 py-1 text-[12.5px] text-[#ecebe4] outline-none"
                  >
                    {AGENTS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-2.5">
                  <span className="text-[11px] text-[#9a9992]">Étape 2 · Cross-Review du Diff</span>
                  <select
                    aria-label="Agent Étape 2 Cross-Review"
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    className="rounded-lg border border-[#343431] bg-[#161615] px-2 py-1 text-[12.5px] text-[#ecebe4] outline-none"
                  >
                    {AGENTS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-2.5">
                  <span className="text-[11px] text-[#9a9992]">Étape 3 · Vérification & Globe</span>
                  <select
                    aria-label="Agent Étape 3 Vérification"
                    value={verifier}
                    onChange={(e) => setVerifier(e.target.value)}
                    className="rounded-lg border border-[#343431] bg-[#161615] px-2 py-1 text-[12.5px] text-[#ecebe4] outline-none"
                  >
                    {AGENTS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2e2e2b] bg-[#1a1a18] px-5 py-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#8c8b83]">
            <Shield className="h-3.5 w-3.5 text-[#8ce09b]" />
            <span>Worktree isolé + Sandbox OS activés</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSingleLaunch}
              className="flex items-center gap-1.5 rounded-xl border border-[#3d3d39] bg-[#282825] px-3.5 py-2 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#343430]"
            >
              <CheckCircle2 className="h-4 w-4 text-[#8ce09b]" />
              <span>Appliquer et lancer la tâche</span>
            </button>
            <button
              type="button"
              onClick={handleCrossReviewLaunch}
              className="flex items-center gap-1.5 rounded-xl bg-[#d97757] px-4 py-2 text-[12.5px] font-semibold text-[#181817] transition hover:bg-[#e38768]"
            >
              <span>Lancer le pipeline Cross-Review (3 agents)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
