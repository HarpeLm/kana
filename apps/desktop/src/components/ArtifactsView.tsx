import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import type { ArtifactEntry } from "../lib/artifactIndex";
import { relativeTime } from "../lib/relativeTime";
import ArtifactThumb from "./ArtifactThumb";

interface ArtifactsViewProps {
  items: ArtifactEntry[];
  loading: boolean;
  onOpen: (item: ArtifactEntry) => void;
  onMenu: (item: ArtifactEntry, x: number, y: number) => void;
  /** Le dossier de la conversation ouverte : l'onglet « Cette conversation » ne montre que ses artéfacts. */
  currentRoot?: string;
}

type Scope = "all" | "current";
type Sort = "recent" | "title" | "project";
type Layout = "grid" | "list";

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Plus récents" },
  { id: "title", label: "Titre" },
  { id: "project", label: "Projet" },
];

const chip = (on: boolean) =>
  `h-8 rounded-lg px-3 text-[14px] transition ${on ? "bg-[#3a3a37] text-[#f0efe9]" : "text-[#c4c3bc] hover:bg-[#2a2a28] hover:text-[#f0efe9]"}`;

/** La galerie de tous les artéfacts : une carte par page, avec son aperçu. */
export default function ArtifactsView({ items, loading, onOpen, onMenu, currentRoot }: ArtifactsViewProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem("kana-artifacts-sort") as Sort) || "recent");
  const [layout, setLayout] = useState<Layout>(() => (localStorage.getItem("kana-artifacts-layout") as Layout) || "grid");
  const choose = <T extends string>(key: string, set: (v: T) => void) => (value: T) => {
    set(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      // préférence non retenue
    }
  };
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = scope === "current" && currentRoot ? items.filter((i) => i.root === currentRoot) : items;
    if (needle) list = list.filter((i) => i.title.toLowerCase().includes(needle) || i.project.toLowerCase().includes(needle));
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    else if (sort === "project") sorted.sort((a, b) => a.project.localeCompare(b.project, "fr") || b.modified - a.modified);
    else sorted.sort((a, b) => b.modified - a.modified);
    return sorted;
  }, [items, query, scope, sort, currentRoot]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1130px] px-10 pb-16 pt-14">
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-serif text-[34px] text-[#ecebe4]">Artéfacts</h1>
          <label className="flex h-9 w-[260px] items-center gap-2 rounded-xl border border-[#333331] bg-[#1f1f1d] px-3 text-[#8c8b83] focus-within:border-[#4a4a46]">
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un artéfact"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#ecebe4] outline-none placeholder:text-[#6f6e68]"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex gap-1">
            <button onClick={() => setScope("all")} className={chip(scope === "all")}>
              Tous
            </button>
            <button onClick={() => setScope("current")} className={chip(scope === "current")}>
              Cette conversation
            </button>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={sort}
              onChange={(e) => choose<Sort>("kana-artifacts-sort", setSort)(e.target.value as Sort)}
              aria-label="Trier par"
              className="h-8 rounded-lg bg-transparent px-2 text-[14px] text-[#c4c3bc] outline-none hover:bg-[#2a2a28]"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#2b2b29]">
                  {s.label}
                </option>
              ))}
            </select>
            <button onClick={() => choose<Layout>("kana-artifacts-layout", setLayout)("grid")} title="Grille" className={`${chip(layout === "grid")} flex w-8 items-center justify-center px-0`}>
              <LayoutGrid className="h-4 w-4" strokeWidth={1.7} />
            </button>
            <button onClick={() => choose<Layout>("kana-artifacts-layout", setLayout)("list")} title="Liste" className={`${chip(layout === "list")} flex w-8 items-center justify-center px-0`}>
              <List className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="pt-16 text-center text-[14px] text-[#8c8b83]">
            {loading ? "Recherche des artéfacts…" : items.length === 0 ? "Aucun artéfact pour l'instant. Demande à un agent d'en créer un." : "Aucun résultat."}
          </p>
        ) : (
          <div className={layout === "grid" ? "mt-5 grid grid-cols-3 gap-4" : "mt-5 divide-y divide-[#2a2a28] rounded-xl border border-[#333331]"}>
            {shown.map((item) =>
              layout === "list" ? (
                <button
                  key={item.key}
                  onClick={() => onOpen(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onMenu(item, e.clientX, e.clientY);
                  }}
                  className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition first:rounded-t-xl last:rounded-b-xl hover:bg-[#232321]"
                >
                  <ArtifactThumb html={item.html} className="h-[42px] w-[56px] shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-[#ecebe4]">{item.title}</span>
                  <span className="shrink-0 text-[13px] text-[#8c8b83]">{item.project}</span>
                  <span className="w-[130px] shrink-0 text-right text-[13px] text-[#8c8b83]">{relativeTime(item.modified)}</span>
                </button>
              ) : (
              <button
                key={item.key}
                onClick={() => onOpen(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu(item, e.clientX, e.clientY);
                }}
                className="group overflow-hidden rounded-xl border border-[#333331] bg-[#232321] text-left transition hover:border-[#4a4a46]"
              >
                <ArtifactThumb html={item.html} className="aspect-[4/3] w-full" />
                <div className="border-t border-[#333331] px-4 py-3">
                  <p className="truncate text-[15px] text-[#ecebe4]">{item.title}</p>
                  <p className="truncate text-[13px] text-[#8c8b83]">
                    {relativeTime(item.modified)} · {item.project}
                  </p>
                </div>
              </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
