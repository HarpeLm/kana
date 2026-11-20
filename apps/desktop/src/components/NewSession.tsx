import type { ReactNode } from "react";
import { Laptop, Sparkles } from "lucide-react";
import { NO_PROJECT, type Project } from "../lib/projects";
import ProjectPicker from "./ProjectPicker";

export interface NewSessionProps {
  projectName: string;
  /** Chemin du projet choisi, ou `none`. */
  projectPath: string | undefined;
  projects: Project[];
  useWorktree: boolean;
  onSelectProject: (project: Project | null) => void;
  onOpenFolder: () => void;
  onCreateProject: (name: string) => Promise<string | null>;
  onToggleWorktree: (value: boolean) => void;
}

/**
 * L'écran d'une conversation vide : un titre, la zone de saisie, puis sous elle l'endroit où
 * l'agent travaille (cet ordinateur, le projet, un dossier de travail à part).
 */
export default function NewSession({ session, children }: { session: NewSessionProps; children: ReactNode }) {
  const none = session.projectPath === NO_PROJECT;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
      <Sparkles className="mb-6 h-9 w-9 text-[#d97757]" strokeWidth={1.4} />
      <h1 className="mb-8 text-center text-[26px] font-normal text-[#ecebe4]">
        {none ? "Que voulez-vous faire ?" : `Que voulez-vous créer dans ${session.projectName} ?`}
      </h1>
      <div className="w-full max-w-[740px]">{children}</div>
      <div className="mt-1 flex items-center gap-1 text-[#c4c3bc]">
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
    </div>
  );
}
