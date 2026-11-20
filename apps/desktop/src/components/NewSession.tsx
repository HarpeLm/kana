import { Laptop, Sparkles, X } from "lucide-react";
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
  /** Retire un projet de la liste de Kana (le dossier n'est pas supprimé). */
  onRemoveProject: (project: Project) => void;
  onToggleWorktree: (value: boolean) => void;
}

/** Sous la zone de saisie : où l'agent travaille (cet ordinateur, le projet, un dossier de travail à part). */
export function EnvironmentRow({ session }: { session: NewSessionProps }) {
  const none = session.projectPath === NO_PROJECT;
  return (
    <div className="flex items-center gap-0.5 text-[#c4c3bc]">
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

/** Au centre d'une conversation vide : une mascotte et les projets récents, un clic pour en choisir un. */
export function NewSessionCenter({ session }: { session: NewSessionProps }) {
  const recent = session.projects.slice(0, 3);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Sparkles className="mb-5 h-9 w-9 text-[#d97757]" strokeWidth={1.4} />
      <div className="w-[372px] max-w-full rounded-2xl border border-[#2b2b29] bg-[#1d1d1b] p-1">
        {recent.map((project) => (
          <div
            key={project.path}
            title={project.path.replace(/^\/Users\/[^/]+/, "~")}
            className={`group flex items-center rounded-xl transition hover:bg-[#262624] ${
              project.path === session.projectPath ? "bg-[#222220]" : ""
            }`}
          >
            <button
              onClick={() => session.onSelectProject(project)}
              className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-[14px] ${
                project.path === session.projectPath ? "text-[#ecebe4]" : "text-[#c4c3bc]"
              }`}
            >
              <Laptop className="h-4 w-4 shrink-0 text-[#8c8b83]" strokeWidth={1.6} />
              <span className="truncate">{project.name}</span>
            </button>
            <button
              onClick={() => session.onRemoveProject(project)}
              title="Retirer de Kana (le dossier n'est pas supprimé)"
              aria-label={`Retirer ${project.name}`}
              className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8c8b83] opacity-0 transition hover:bg-[#333331] hover:text-[#ecebe4] group-hover:opacity-100 focus:opacity-100"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ))}
        <div className={recent.length > 0 ? "mt-1 border-t border-[#2b2b29] pt-1" : ""}>
          <ProjectPicker
            projects={session.projects}
            current={session.projectPath}
            currentName={session.projectName}
            onSelect={session.onSelectProject}
            onOpenFolder={session.onOpenFolder}
            onCreate={session.onCreateProject}
            onRemove={session.onRemoveProject}
            triggerLabel="Choisir un projet"
            dropDown
            triggerClassName="flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] text-[#c4c3bc] transition hover:bg-[#262624] hover:text-[#ecebe4]"
          />
        </div>
      </div>
    </div>
  );
}
