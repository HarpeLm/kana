import { ArrowDown, ArrowUp } from "lucide-react";
import { AGENTS } from "../data";
import { setRelay, useRelay } from "../lib/relay";
import { clearProblem, formatCostUsd, formatTokens, problemOf, usageToday, useUsageVersion } from "../lib/usage";

const nameOf = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
const clock = (at: number) => new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Réglages du relais : l'ordre des fournisseurs, lesquels participent, et ce qu'ils ont consommé aujourd'hui. */
export default function RelayView() {
  const relay = useRelay();
  useUsageVersion();

  const move = (index: number, delta: number) => {
    const order = [...relay.order];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setRelay({ ...relay, order });
  };
  const toggle = (id: string) =>
    setRelay({ ...relay, disabled: relay.disabled.includes(id) ? relay.disabled.filter((d) => d !== id) : [...relay.disabled, id] });

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto border-r border-[#2b2b28] p-7">
        <div className="mx-auto max-w-[580px]">
          <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">Relais entre fournisseurs</h1>
          <p className="mb-6 text-[13px] text-[#8c8b83]">
            Quand le fournisseur d'une conversation atteint sa limite ou refuse la connexion, la conversation continue chez le suivant
            de cette liste, avec le résumé de ce qui s'est dit. Mets en dernier un fournisseur gratuit pour ne jamais être bloqué.
          </p>

          <div className="space-y-3">
            {relay.order.map((id, index) => {
              const problem = problemOf(id);
              const usage = usageToday(id);
              const off = relay.disabled.includes(id);
              return (
                <div
                  key={id}
                  className={`rounded-xl border p-4 ${problem ? "border-[#3b82f6]/40 bg-[#1e3a8a]/20" : "border-[#2e2e2b] bg-[#21211f]"} ${off ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-3 text-[13px]">
                    <span className="w-5 text-[#8c8b83]">{index + 1}.</span>
                    <span className="flex-1 font-medium text-[#ecebe4]">{nameOf(id)}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                        problem ? "bg-[#1e3a8a]/35 text-[#93c5fd]" : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {problem
                        ? problem.kind === "limit"
                          ? `Limite atteinte${problem.until ? ` · reprise vers ${clock(problem.until)}` : ""}`
                          : "Connexion refusée"
                        : "Disponible"}
                    </span>
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Monter"
                      className="rounded-md p-1 text-[#9a9992] hover:bg-[#2e2e2b] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === relay.order.length - 1}
                      aria-label="Descendre"
                      className="rounded-md p-1 text-[#9a9992] hover:bg-[#2e2e2b] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3 pl-8 text-[12px] text-[#8c8b83]">
                    <span>
                      Aujourd'hui : {usage.turns} réponse{usage.turns > 1 ? "s" : ""}
                      {usage.totalTokens > 0 ? ` · ${formatTokens(usage.totalTokens)} jetons · ${formatCostUsd(usage.costUsd)}` : ""}
                    </span>
                    <span className="flex-1" />
                    {problem && (
                      <button onClick={() => clearProblem(id)} className="underline underline-offset-2 hover:text-[#ecebe4]">
                        Marquer comme disponible
                      </button>
                    )}
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" checked={!off} onChange={() => toggle(id)} className="accent-[#2563eb]" />
                      Dans le relais
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 bg-[#1d1d1b] p-6">
        <h2 className="mb-4 text-[13px] font-semibold text-[#ecebe4]">Politique de bascule</h2>
        <button
          onClick={() => setRelay({ ...relay, auto: !relay.auto })}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#2e2e2b] bg-[#242422] px-3.5 py-3 text-left"
        >
          <span className="text-[13px] text-[#dcdbd3]">Basculer automatiquement</span>
          <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${relay.auto ? "justify-end bg-[#2563eb]" : "justify-start bg-[#444440]"}`}>
            <span className="h-4 w-4 rounded-full bg-[#ecebe4]" />
          </span>
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-[#8c8b83]">
          {relay.auto
            ? "Dès qu'une limite est atteinte, Kana continue la conversation chez le fournisseur suivant et renvoie ton dernier message."
            : "Un bandeau te propose de continuer chez le fournisseur suivant ; rien ne change sans ton accord."}
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-[#6f6e68]">
          Kana mesure la consommation d'après ce que les agents annoncent (jetons, réponses). Les plafonds de ton abonnement ne sont pas
          lisibles de l'extérieur : la limite est détectée quand l'agent la signale.
        </p>
      </aside>
    </div>
  );
}
