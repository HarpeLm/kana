import { Laptop } from "lucide-react";
import { tr, useLocale } from "../lib/i18n";
import { NO_PROJECT, type Project } from "../lib/projects";
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
  /** Lance une amorce rapide en 1 clic. */
  onQuickPrompt?: (prompt: string) => void;
  /** Ouvre le conseiller `/advisor` / Cross-Review. */
  onOpenAdvisor?: () => void;
  /** Ouvre le navigateur intégré Globe. */
  onOpenGlobe?: () => void;
  /** Ouvre la configuration du Relais multi-fournisseurs. */
  onOpenRelay?: () => void;
}

/** Marque monochrome très sobre façon Codex / Antigravity (sans halo ni couleur criarde). */
function KanaMark() {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="h-9 w-9 text-[#5c5b56]"
    >
      <rect
        x="4.5"
        y="4.5"
        width="27"
        height="27"
        rx="8.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M13 11.5V24.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M23 12L14.8 18L23.5 24.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

/** En-tête épuré d'une nouvelle session (style Codex / Antigravity) centré juste au-dessus du Composer. */
export function NewSessionCenter({ session }: { session: NewSessionProps }) {
  const locale = useLocale();
  const none = !session.projectPath || session.projectPath === NO_PROJECT;

  return (
    <div className="mb-7 flex flex-col items-center px-6 text-center">
      <KanaMark />
      <h1 className="mt-4 text-[28px] font-medium tracking-[-0.025em] text-[#ecebe4]">
        {tr("Que voulez-vous créer ?", "What do you want to build?", locale)}
      </h1>
      {!none && (
        <p className="mt-1.5 text-[13px] text-[#7a7972]">
          {session.projectName}
          {session.useWorktree ? ` · ${tr("worktree isolé", "isolated worktree", locale)}` : ""}
        </p>
      )}
    </div>
  );
}

/** Actions rapides discrètes (une seule ligne sobre sous le Composer, façon Antigravity). */
export function NewSessionQuickActions({
  session,
  onSend,
}: {
  session: NewSessionProps;
  onSend?: (text: string) => void;
}) {
  const locale = useLocale();
  const dispatchPrompt = (text: string) => {
    if (session.onQuickPrompt) session.onQuickPrompt(text);
    else onSend?.(text);
  };

  const actions = [
    {
      id: "fix",
      label: tr("Corriger & tester", "Fix & test", locale),
      onClick: () =>
        dispatchPrompt(
          tr(
            "Analyse les erreurs récentes du dépôt, propose un correctif ciblé et lance la suite de tests.",
            "Analyze recent repository errors, propose a focused fix, and run the test suite.",
            locale,
          ),
        ),
    },
    {
      id: "cross-review",
      label: tr("Cross-Review", "Cross-Review", locale),
      onClick: () => {
        if (session.onOpenAdvisor) session.onOpenAdvisor();
        else dispatchPrompt("/advisor");
      },
    },
    {
      id: "globe",
      label: tr("Vérifier dans Globe", "Verify in Globe", locale),
      onClick: () => {
        session.onOpenGlobe?.();
        dispatchPrompt(
          tr(
            "Ouvre l'application dans Globe, inspecte la console JS et le réseau, puis vérifie le rendu.",
            "Open the app in Globe, inspect JS console and network, then verify the rendering.",
            locale,
          ),
        );
      },
    },
    {
      id: "advisor",
      label: "/advisor",
      onClick: () => {
        if (session.onOpenAdvisor) session.onOpenAdvisor();
        else dispatchPrompt("/advisor");
      },
    },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 px-6">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          className="rounded-full border border-[#2b2b29] bg-transparent px-3 py-1 text-[12px] text-[#8c8b83] transition hover:border-[#3c3c38] hover:bg-[#21211f] hover:text-[#dcdbd3]"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
