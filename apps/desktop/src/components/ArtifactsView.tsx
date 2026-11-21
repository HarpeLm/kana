import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ArtifactEntry } from "../lib/artifactIndex";
import { relativeTime } from "../lib/relativeTime";
import ArtifactThumb from "./ArtifactThumb";

interface ArtifactsViewProps {
  items: ArtifactEntry[];
  loading: boolean;
  onOpen: (item: ArtifactEntry) => void;
}

/** La galerie de tous les artéfacts : une carte par page, avec son aperçu. */
export default function ArtifactsView({ items, loading, onOpen }: ArtifactsViewProps) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((i) => i.title.toLowerCase().includes(needle) || i.project.toLowerCase().includes(needle)) : items;
  }, [items, query]);

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

        {shown.length === 0 ? (
          <p className="pt-16 text-center text-[14px] text-[#8c8b83]">
            {loading ? "Recherche des artéfacts…" : items.length === 0 ? "Aucun artéfact pour l'instant. Demande à un agent d'en créer un." : "Aucun résultat."}
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-3 gap-4">
            {shown.map((item) => (
              <button
                key={item.key}
                onClick={() => onOpen(item)}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
