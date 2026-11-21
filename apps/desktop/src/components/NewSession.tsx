import { Compass, GitCompare, Globe, Laptop, Wrench, X } from "lucide-react";
import { AGENTS } from "../data";
import { tr, useLocale } from "../lib/i18n";
import { NO_PROJECT, type Project } from "../lib/projects";
import { problemOf, useUsageVersion } from "../lib/usage";
import ProjectPicker from "./ProjectPicker";

export interface NewSessionProps {
  projectName: string;
  /** Chemin du projet choisi, ou `none`. */
  projectPath: string | undefined;
  projects: Project[];
  useWorktree: boolean;
  activeAgentId?: string;
  onSelectProject: (project: Project | null) => void;
  onOpenFolder: () => void;
  onCreateProject: (name: string) => Promise<string | null>;
  /** Retire un projet de la liste de Kana (le dossier n'est pas supprimé). */
  onRemoveProject: (project: Project) => void;
  onToggleWorktree: (value: boolean) => void;
  /** Lance ou pré-remplit une amorce rapide en 1 clic. */
  onQuickPrompt?: (prompt: string) => void;
  /** Ouvre le conseiller `/advisor` / Cross-Review. */
  onOpenAdvisor?: () => void;
  /** Ouvre le navigateur intégré Globe. */
  onOpenGlobe?: () => void;
  /** Ouvre la configuration du Relais multi-fournisseurs. */
  onOpenRelay?: () => void;
}

/** Emblème minimaliste Kana en SVG (sceau géométrique aux tons chauds #d97757). */
function KanaEmblem() {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#3a312c] bg-[#211f1d] shadow-[0_8px_28px_rgba(217,119,87,0.14)]">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className="h-7 w-7 text-[#d97757]"
      >
        <path
          d="M11 8.5V27.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M24.5 9.5L13.5 18L25 27"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="25.5" cy="9.5" r="2" fill="#e5977b" />
      </svg>
    </div>
  );
}

/** Sous la zone de saisie : où l'agent travaille (cet ordinateur, le projet, un dossier de travail à part). */
export function EnvironmentRow({ session }: { session: NewSessionProps }) {
  const none = session.projectPath === NO_PROJECT;
  return (
    <div className="flex items-center gap-0.5 whitespace-nowrap text-[#c4c3bc]">
      <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px]">
        <Laptop className="h-[15px] w-[15px]" strokeWidth={1.6} />
        Cet ordinateur
      </span>
      <ProjectPicker
        projects={session.projects}
        current={session.projectPath}
        currentName={none ? "Aucun dossier" : session.projectName}
        onSelect={session.onSelectProject}
        onOpenFolder={session.onOpenFolder}
        onCreate={session.onCreateProject}
        onRemove={session.onRemoveProject}
      />
      <label
        className={`flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1 text-[13px] transition hover:bg-[#262624] ${
          none ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={session.useWorktree && !none}
          disabled={none}
          onChange={(e) => session.onToggleWorktree(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#2f6bd8]"
        />
        Worktree
      </label>
    </div>
  );
}

interface QuickStartCard {
  id: string;
  title: string;
  description: string;
  icon: typeof Wrench;
  accent: string;
  onClick: () => void;
}

/** Au centre d'une conversation vide : emblème Kana, cockpit prêt, pilules projets et amorces 1 clic. */
export function NewSessionCenter({
  session,
  onSend,
}: {
  session: NewSessionProps;
  onSend?: (text: string) => void;
}) {
  const locale = useLocale();
  useUsageVersion();

  const recent = session.projects.slice(0, 4);
  const none = !session.projectPath || session.projectPath === NO_PROJECT;
  const dispatchPrompt = (text: string) => {
    if (session.onQuickPrompt) session.onQuickPrompt(text);
    else onSend?.(text);
  };

  const cockpitAgents = AGENTS.filter((a) => a.id === "claude" || a.id === "codex" || a.id === "gemini");

  const quickCards: QuickStartCard[] = [
    {
      id: "fix-test",
      title: tr("Corriger & tester", "Fix & test", locale),
      description: tr(
        "Analyse les erreurs et lance la suite de tests",
        "Analyze errors and run the test suite",
        locale,
      ),
      icon: Wrench,
      accent: "text-[#d97757]",
      onClick: () =>
        dispatchPrompt(
          tr(
            "Analyse les erreurs récentes du dépôt, propose un correctif ciblé et lance la suite de tests pour vérifier.",
            "Analyze recent repository errors, propose a focused fix, and run the test suite to verify.",
            locale,
          ),
        ),
    },
    {
      id: "cross-review",
      title: tr("Cross-Review (A → B → C)", "Cross-Review (A → B → C)", locale),
      description: tr(
        "Implémenter puis faire relire par un 2e agent",
        "Implement then review with a second provider",
        locale,
      ),
      icon: GitCompare,
      accent: "text-[#8ab4f8]",
      onClick: () => {
        if (session.onOpenAdvisor) session.onOpenAdvisor();
        else dispatchPrompt("/advisor");
      },
    },
    {
      id: "globe-verify",
      title: tr("Vérifier dans Globe", "Verify in Globe", locale),
      description: tr(
        "Ouvrir l'app, inspecter Console/Réseau et capturer",
        "Open the app, inspect Console/Network and capture",
        locale,
      ),
      icon: Globe,
      accent: "text-[#3fb950]",
      onClick: () => {
        session.onOpenGlobe?.();
        dispatchPrompt(
          tr(
            "Ouvre l'application dans Globe, inspecte les erreurs console JS et réseau, puis vérifie le rendu visuel.",
            "Open the app in Globe, inspect JS console and network errors, and verify the visual rendering.",
            locale,
          ),
        );
      },
    },
    {
      id: "advisor",
      title: tr("Conseiller /advisor", "Advisor /advisor", locale),
      description: tr(
        "Choisir le meilleur agent et mode pour ta tâche",
        "Pick the best agent and mode for your task",
        locale,
      ),
      icon: Compass,
      accent: "text-[#c49bff]",
      onClick: () => {
        if (session.onOpenAdvisor) session.onOpenAdvisor();
        else dispatchPrompt("/advisor");
      },
    },
  ];

  const contextSubtitle = none
    ? tr("Aucun dossier sélectionné · Choisis un projet ci-dessous", "No folder selected · Pick a project below", locale)
    : session.useWorktree
      ? tr(
          `Projet actif : ${session.projectName} · Worktree isolé`,
          `Active project: ${session.projectName} · Isolated worktree`,
          locale,
        )
      : tr(
          `Projet actif : ${session.projectName} · Dossier local`,
          `Active project: ${session.projectName} · Local folder`,
          locale,
        );

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      {/* Lueur ambiante très subtile derrière l'emblème pour casser le gris plat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[520px] -translate-x-1/2 -translate-y-[58%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(217,119,87,0.11)_0%,rgba(217,119,87,0.03)_42%,transparent_72%)] blur-2xl"
      />

      <div className="relative z-10 flex w-full max-w-[600px] flex-col items-center">
        {/* Emblème Kana + mini-pilule Cockpit prêt */}
        <div className="mb-4 flex flex-col items-center gap-3">
          <KanaEmblem />
          <button
            type="button"
            onClick={session.onOpenRelay}
            title={tr("Configurer le relais multi-fournisseurs", "Configure multi-provider relay", locale)}
            className="inline-flex items-center gap-2 rounded-full border border-[#2f2f2c] bg-[#1e1e1c]/90 px-3 py-1 text-[11.5px] text-[#a7a69e] transition hover:border-[#42423d] hover:text-[#ecebe4]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950]" />
            <span className="font-medium text-[#dcdbd3]">
              {tr("Cockpit prêt", "Cockpit ready", locale)}
            </span>
            <span className="text-[#565650]">·</span>
            <span className="inline-flex items-center gap-2">
              {cockpitAgents.map((agent, idx) => {
                const blocked = Boolean(problemOf(agent.id));
                const isSelected = session.activeAgentId === agent.id;
                return (
                  <span key={agent.id} className="inline-flex items-center gap-1">
                    {idx > 0 && <span className="text-[#4a4a45]">·</span>}
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        blocked ? "bg-[#e0a84b]" : isSelected ? "bg-[#d97757]" : "bg-[#5f6368]"
                      }`}
                    />
                    <span className={isSelected ? "text-[#ecebe4]" : "text-[#9a9992]"}>
                      {agent.name.split(" ")[0]}
                    </span>
                  </span>
                );
              })}
            </span>
          </button>
        </div>

        {/* Accroche chaleureuse + contexte actif */}
        <h1 className="text-center text-[26px] font-semibold tracking-[-0.02em] text-[#ecebe4]">
          {tr("Que veux-tu construire ?", "What do you want to build?", locale)}
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-[#8c8b83]">{contextSubtitle}</p>

        {/* Barre compacte de pilules Projets récents */}
        <div
          aria-label={tr("Projets récents", "Recent projects", locale)}
          className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
        >
          {recent.map((project) => {
            const active = project.path === session.projectPath;
            return (
              <div
                key={project.path}
                title={project.path.replace(/^\/Users\/[^/]+/, "~")}
                className={`group inline-flex items-center rounded-full border transition ${
                  active
                    ? "border-[#4b433e] bg-[#262320] text-[#ecebe4]"
                    : "border-[#2c2c29] bg-[#1e1e1c] text-[#b8b7ae] hover:border-[#3e3e39] hover:bg-[#242422] hover:text-[#ecebe4]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => session.onSelectProject(project)}
                  className="inline-flex items-center gap-1.5 py-1 pl-3 pr-2 text-[12.5px]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#d97757]" : "bg-[#5a5a54]"}`}
                  />
                  <span className="max-w-[140px] truncate">{project.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => session.onRemoveProject(project)}
                  title={tr("Retirer de Kana (le dossier n'est pas supprimé)", "Remove from Kana (folder is not deleted)", locale)}
                  aria-label={`Retirer ${project.name}`}
                  className="mr-1 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[#7c7b74] opacity-0 transition hover:bg-[#353531] hover:text-[#ecebe4] group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" strokeWidth={1.8} />
                </button>
              </div>
            );
          })}

          <ProjectPicker
            projects={session.projects}
            current={session.projectPath}
            currentName={session.projectName}
            onSelect={session.onSelectProject}
            onOpenFolder={session.onOpenFolder}
            onCreate={session.onCreateProject}
            onRemove={session.onRemoveProject}
            triggerLabel={tr("+ Projet…", "+ Project…", locale)}
            dropDown
            triggerClassName="inline-flex items-center gap-1 rounded-full border border-dashed border-[#343430] bg-transparent px-3 py-1 text-[12.5px] text-[#9a9992] transition hover:border-[#4c4c46] hover:bg-[#222220] hover:text-[#ecebe4]"
          />
        </div>

        {/* 4 cartes d'amorce en 1 clic (grille 2×2) */}
        <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
          {quickCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={card.onClick}
                className="group flex items-start gap-3 rounded-2xl border border-[#2d2d2a] bg-[#1e1e1c]/95 px-3.5 py-3 text-left transition hover:border-[#45433e] hover:bg-[#252522]"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#2f2f2c] bg-[#252523] transition group-hover:border-[#3e3e3a]">
                  <Icon className={`h-3.5 w-3.5 ${card.accent}`} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[#ecebe4]">{card.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[#8c8b83] group-hover:text-[#a4a39b]">
                    {card.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Micro-aide raccourcis */}
        <p className="mt-5 text-center text-[11.5px] text-[#6d6c66]">
          {tr("⌘K commandes · ⌥Espace dictée vocale · @ fichiers · / slash", "⌘K commands · ⌥Space voice dictation · @ files · / slash", locale)}
        </p>
      </div>
    </div>
  );
}
