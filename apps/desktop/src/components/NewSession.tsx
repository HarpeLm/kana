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
          className="h-3.5 w-3.5 accent-[#2563eb]"
        />
        Worktree
      </label>
    </div>
  );
}

/** En-tête épuré d'une nouvelle session centré juste au-dessus du Composer. */
export function NewSessionCenter() {
  const locale = useLocale();

  return (
    <div className="mb-7 flex flex-col items-center px-6 text-center">
      <img
        src="/icon.png"
        alt="Kana"
        className="h-12 w-12 rounded-2xl border border-white/[0.08] shadow-[0_8px_24px_rgba(30,64,175,0.28)]"
      />
      <h1 className="mt-4 text-[28px] font-medium tracking-[-0.025em] text-[#ecebe4]">
        {tr("Que voulez-vous créer ?", "What do you want to build?", locale)}
      </h1>
    </div>
  );
}
