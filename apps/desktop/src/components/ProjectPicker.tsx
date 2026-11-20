import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, FolderPlus, Folder } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { NO_PROJECT, type Project } from "../lib/projects";

interface ProjectPickerProps {
  projects: Project[];
  /** Chemin du projet choisi, ou `none`. */
  current: string | undefined;
  currentName: string;
  onSelect: (project: Project | null) => void;
  /** Ouvre le sélecteur de dossiers du système. */
  onOpenFolder: () => void;
  /** Crée un projet neuf ; renvoie l'erreur à montrer, ou `null`. */
  onCreate: (name: string) => Promise<string | null>;
}

const row = "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#333331]";

/** Choix du projet d'une session : recherche, récents, ouvrir un dossier, nouveau projet. */
export default function ProjectPicker({ projects, current, currentName, onSelect, onOpenFolder, onCreate }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useClickOutside(root, open, () => setOpen(false));

  useEffect(() => {
    if (open) {
      setQuery("");
      setCreating(false);
      setError(null);
      setTimeout(() => search.current?.focus(), 0);
    }
  }, [open]);

  const needle = query.trim().toLowerCase();
  const shown = projects.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle));
  const duplicated = (project: Project) => projects.filter((p) => p.name === project.name).length > 1;
  const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

  const pick = (project: Project | null) => {
    setOpen(false);
    onSelect(project);
  };

  const create = async () => {
    const failure = await onCreate(name);
    if (failure) setError(failure);
    else setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-[#c4c3bc] transition hover:bg-[#262624] hover:text-[#ecebe4]"
      >
        <Folder className="h-[15px] w-[15px]" strokeWidth={1.6} />
        {currentName}
        <ChevronDown className="h-3 w-3" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[260px] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl">
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher des dossiers"
            className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
          />
          <div className="my-0.5 border-t border-[#343432]" />
          <button className={row} onClick={() => pick(null)}>
            <span className="flex-1">Aucun dossier</span>
            {current === NO_PROJECT && <Check className="h-4 w-4 text-[#4a9bff]" strokeWidth={1.8} />}
          </button>
          {shown.length > 0 && (
            <>
              <div className="my-0.5 border-t border-[#343432]" />
              <p className="px-3 pb-0.5 pt-1.5 text-[11.5px] text-[#8c8b83]">Récents</p>
              <div className="max-h-[260px] overflow-y-auto">
                {shown.map((project) => (
                  <button key={project.path} className={row} onClick={() => pick(project)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{project.name}</span>
                      {duplicated(project) && (
                        <span className="block truncate text-[11.5px] text-[#8c8b83]">{home(project.path)}</span>
                      )}
                    </span>
                    {current === project.path && <Check className="h-4 w-4 shrink-0 text-[#4a9bff]" strokeWidth={1.8} />}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="my-0.5 border-t border-[#343432]" />
          <button
            className={row}
            onClick={() => {
              setOpen(false);
              onOpenFolder();
            }}
          >
            <FolderOpen className="h-4 w-4 text-[#9a9992]" strokeWidth={1.6} />
            Ouvrir un dossier…
          </button>
          {creating ? (
            <div className="px-2 pb-2 pt-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void create();
                  else if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Nom du projet"
                className="w-full rounded-lg border border-[#3d3d3a] bg-[#222220] px-2.5 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#7e7d76] outline-none focus:border-[#55554f]"
              />
              <p className="mt-1.5 px-0.5 text-[11.5px] leading-snug text-[#8c8b83]">
                Créé dans ~/Kana avec un dépôt git. Entrée pour valider.
              </p>
              {error && <p className="mt-1 px-0.5 text-[11.5px] text-red-300">{error}</p>}
            </div>
          ) : (
            <button
              className={row}
              onClick={() => {
                setCreating(true);
                setName("");
              }}
            >
              <FolderPlus className="h-4 w-4 text-[#9a9992]" strokeWidth={1.6} />
              Nouveau projet…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
