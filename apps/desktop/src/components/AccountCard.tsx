import { useAgentAccount, type AccountPhase } from "../hooks/useAgentAccount";
import type { AgentInfo } from "../data";
import ApiKeyField from "./ApiKeyField";

const pill: Record<AccountPhase, { label: string; style: string }> = {
  idle: { label: "Non vérifié", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  checking: { label: "Vérification…", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  ready: { label: "Connecté", style: "bg-emerald-500/15 text-emerald-400" },
  needs_login: { label: "Connexion requise", style: "bg-[#d97757]/15 text-[#e69b80]" },
  logging_in: { label: "Connexion en cours…", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  error: { label: "Erreur", style: "bg-red-500/15 text-red-300" },
};

export default function AccountCard({ agent }: { agent: AgentInfo }) {
  const { state, check, login, saveKey, removeKey } = useAgentAccount(agent.id);
  const busy = state.phase === "checking" || state.phase === "logging_in";
  const { label, style } = pill[state.phase];

  return (
    <section className="space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-[#ecebe4]">{agent.name}</h2>
          <p className="mt-0.5 text-[12px] text-[#8c8b83]">{agent.hint}</p>
        </div>
        <span
          title={state.checkedAt ? `Vérifié le ${new Date(state.checkedAt).toLocaleString("fr-FR")}` : undefined}
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${style}`}
        >
          {label}
        </span>
      </div>

      {state.phase === "needs_login" && state.methods.length > 0 && (
        <ul className="space-y-2">
          {state.methods.map((method) => (
            <li key={method.id}>
              <button
                onClick={() => login(method.id)}
                className="w-full rounded-lg bg-[#d97757] px-3 py-2 text-left text-[13px] font-medium text-[#181817] transition hover:bg-[#e38768]"
              >
                {method.name}
                {method.description && (
                  <span className="mt-0.5 block text-[12px] font-normal text-[#3a2a22]">
                    {method.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.phase === "needs_login" && state.methods.length === 0 && (
        <p className="text-[12px] text-[#e69b80]">
          Cet agent demande une connexion mais n'annonce aucune méthode : connecte-le depuis son
          propre terminal, puis vérifie à nouveau.
        </p>
      )}

      {state.phase === "error" && (
        <p className="whitespace-pre-wrap text-[12px] text-red-300">{state.message}</p>
      )}

      <button
        onClick={check}
        disabled={busy}
        className="rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12px] font-medium text-[#e6e5df] transition hover:bg-[#383835] disabled:opacity-50"
      >
        Vérifier la connexion
      </button>

      {agent.keyVariable && (
        <div className="border-t border-[#2b2b28] pt-3">
          <ApiKeyField
            variable={agent.keyVariable}
            hasKey={state.hasKey}
            onSave={saveKey}
            onRemove={removeKey}
          />
        </div>
      )}
    </section>
  );
}
