import { useAgentAccount, type AccountPhase } from "../hooks/useAgentAccount";
import { tr, translateRustError, useLocale } from "../lib/i18n";
import type { AgentInfo } from "../data";
import ApiKeyField from "./ApiKeyField";

const pillMeta: Record<AccountPhase, { fr: string; en: string; style: string }> = {
  idle: { fr: "Non vérifié", en: "Not checked", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  checking: { fr: "Vérification…", en: "Checking…", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  ready: { fr: "Connecté", en: "Connected", style: "bg-emerald-500/15 text-emerald-400" },
  needs_login: { fr: "Connexion requise", en: "Sign-in required", style: "bg-[#1e3a8a]/35 text-[#93c5fd]" },
  logging_in: { fr: "Connexion en cours…", en: "Signing in…", style: "bg-[#2e2e2b] text-[#a3a29a]" },
  error: { fr: "Erreur", en: "Error", style: "bg-red-500/15 text-red-300" },
};

export default function AccountCard({ agent }: { agent: AgentInfo }) {
  const locale = useLocale();
  const { state, check, login, saveKey, removeKey } = useAgentAccount(agent.id);
  const busy = state.phase === "checking" || state.phase === "logging_in";
  const { fr, en, style } = pillMeta[state.phase];
  const label = tr(fr, en, locale);

  return (
    <section className="space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-[#ecebe4]">{agent.name}</h2>
          <p className="mt-0.5 text-[12px] text-[#8c8b83]">{agent.hint}</p>
        </div>
        <span
          title={
            state.checkedAt
              ? tr(
                  `Vérifié le ${new Date(state.checkedAt).toLocaleString("fr-FR")}`,
                  `Checked on ${new Date(state.checkedAt).toLocaleString("en-US")}`,
                  locale,
                )
              : undefined
          }
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
                className="w-full rounded-lg bg-[#1e40af] px-3 py-2 text-left text-[13px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb]"
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
        <p className="text-[12px] text-[#93c5fd]">
          {tr(
            "Cet agent demande une connexion mais n'annonce aucune méthode : connecte-le depuis son propre terminal, puis vérifie à nouveau.",
            "This agent requires authentication but exposes no sign-in method: sign in from its own terminal, then check again.",
            locale,
          )}
        </p>
      )}

      {state.phase === "error" && (
        <p className="whitespace-pre-wrap text-[12px] text-red-300">
          {translateRustError(state.message, locale)}
        </p>
      )}

      <button
        onClick={check}
        disabled={busy}
        className="rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12px] font-medium text-[#e6e5df] transition hover:bg-[#383835] disabled:opacity-50"
      >
        {tr("Vérifier la connexion", "Check connection", locale)}
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
