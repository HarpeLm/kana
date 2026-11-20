import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, RefreshCw } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import type { AgentInfo } from "../data";
import { cachedModels, fetchModels, type AgentModels } from "../lib/models";

interface ModelPickerProps {
  agents: AgentInfo[];
  agentId: string;
  modelId: string | undefined;
  /** Le fournisseur ne se change que dans une conversation encore vide : l'agent d'une conversation commencée garde sa mémoire. */
  canSwitchProvider: boolean;
  onSelect: (agentId: string, modelId: string | undefined) => void;
}

/** Choix du fournisseur (l'agent) et de son modèle, sous la zone de saisie. */
export default function ModelPicker({ agents, agentId, modelId, canSwitchProvider, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(agentId);
  const [models, setModels] = useState<AgentModels | undefined>(() => cachedModels(agentId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useClickOutside(root, open, () => setOpen(false));

  const load = (id: string, force: boolean) => {
    const known = cachedModels(id);
    setModels(known);
    setError("");
    if (known && !force) return;
    setLoading(true);
    fetchModels(id)
      .then((fresh) => setModels((current) => (id === viewingRef.current ? fresh : current)))
      .catch((e) => id === viewingRef.current && setError(String(e)))
      .finally(() => setLoading(false));
  };
  const viewingRef = useRef(viewing);
  useEffect(() => {
    viewingRef.current = viewing;
  });

  // Ouvrir le menu montre le fournisseur de la conversation et ses modèles.
  useEffect(() => {
    if (!open) return;
    setViewing(agentId);
    viewingRef.current = agentId;
    setQuery("");
    load(agentId, false);
    setTimeout(() => search.current?.focus(), 0);
  }, [open, agentId]);

  const view = (id: string) => {
    setViewing(id);
    viewingRef.current = id;
    load(id, false);
  };

  const current = cachedModels(agentId);
  const label = (() => {
    const id = modelId ?? current?.current ?? undefined;
    const name = id ? (current?.available.find((m) => m.id === id)?.name ?? id) : "modèle par défaut";
    return name.length > 28 ? `${name.slice(0, 27)}…` : name;
  })();
  const agentName = agents.find((a) => a.id === agentId)?.name ?? agentId;

  const needle = query.trim().toLowerCase();
  const shown = (models?.available ?? []).filter(
    (m) => !needle || m.name.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle),
  );
  const selectedId = viewing === agentId ? (modelId ?? models?.current ?? undefined) : models?.current ?? undefined;

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] text-[#9a9992] transition hover:bg-[#262624] hover:text-[#ecebe4]"
      >
        {agentName} · {label}
        <ChevronDown className="h-3 w-3" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 flex h-[340px] w-[520px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-[#343432] bg-[#2a2a28] shadow-2xl">
          <div className="w-[170px] shrink-0 border-r border-[#343432] p-1">
            <p className="px-3 pb-1 pt-2 text-[11.5px] text-[#8c8b83]">Fournisseur</p>
            {agents.map((agent) => {
              const disabled = !canSwitchProvider && agent.id !== agentId;
              return (
                <button
                  key={agent.id}
                  disabled={disabled}
                  onClick={() => view(agent.id)}
                  title={disabled ? "Ouvre une nouvelle conversation pour changer de fournisseur" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
                    viewing === agent.id ? "bg-[#333331] text-[#ecebe4]" : "text-[#c4c3bc] hover:bg-[#30302e]"
                  } disabled:cursor-default disabled:text-[#6f6e68] disabled:hover:bg-transparent`}
                >
                  <span className="flex-1 truncate">{agent.name}</span>
                  {agent.id === agentId && <Check className="h-3.5 w-3.5 shrink-0 text-[#4a9bff]" strokeWidth={1.8} />}
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-1">
            <div className="flex items-center gap-1">
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un modèle"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
              />
              <button
                onClick={() => load(viewing, true)}
                disabled={loading}
                title="Actualiser la liste"
                aria-label="Actualiser la liste"
                className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-[#8c8b83] hover:bg-[#333331] hover:text-[#ecebe4] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.8} />
              </button>
            </div>
            <div className="border-t border-[#343432]" />
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {loading && !models && <p className="px-3 py-2 text-[12.5px] text-[#8c8b83]">Lecture des modèles…</p>}
              {error && <p className="whitespace-pre-wrap px-3 py-2 text-[12.5px] text-red-300">{error}</p>}
              {models && models.available.length === 0 && !loading && (
                <p className="px-3 py-2 text-[12.5px] text-[#8c8b83]">
                  Cet agent ne propose pas de choix de modèle : il utilise le sien.
                </p>
              )}
              {shown.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setOpen(false);
                    onSelect(viewing, model.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#333331]"
                >
                  <span className="flex-1 truncate">{model.name}</span>
                  {model.id === selectedId && <Check className="h-3.5 w-3.5 shrink-0 text-[#4a9bff]" strokeWidth={1.8} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
