import { useState, type FormEvent } from "react";
import { Shield, Trash2 } from "lucide-react";
import { AGENTS } from "../data";
import { setLocale, tr, useLocale, type Locale } from "../lib/i18n";
import {
  addPermissionRule,
  clearPermissionAudit,
  removePermissionRule,
  togglePermissionRule,
  usePermissionAudit,
  usePermissionRules,
  type PermissionPolicy,
  type PermissionRuleScope,
} from "../lib/permissionMode";
import { setNotificationPrefs, useNotificationPrefs } from "../lib/settings";
import AccountCard from "./AccountCard";
import OrphanCleaner from "./OrphanCleaner";

interface SettingsViewProps {
  /** Identifiants des conversations et dossiers des projets, pour retrouver les dossiers de travail orphelins. */
  conversationIds: string[];
  projectPaths: string[];
}

const POLICY_STYLE: Record<PermissionPolicy, string> = {
  allow: "bg-emerald-500/15 text-emerald-300",
  ask: "bg-amber-500/15 text-amber-300",
  deny: "bg-red-500/15 text-red-300",
};

export default function SettingsView({ conversationIds, projectPaths }: SettingsViewProps) {
  const locale = useLocale();
  const notifications = useNotificationPrefs();
  const rules = usePermissionRules();
  const audit = usePermissionAudit();

  const [ruleScope, setRuleScope] = useState<PermissionRuleScope>("command");
  const [rulePolicy, setRulePolicy] = useState<PermissionPolicy>("allow");
  const [rulePattern, setRulePattern] = useState("");

  const handleAddRule = (event: FormEvent) => {
    event.preventDefault();
    if (!rulePattern.trim()) return;
    addPermissionRule({ scope: ruleScope, policy: rulePolicy, pattern: rulePattern });
    setRulePattern("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-7">
      <div className="mx-auto max-w-[620px]">
        <section className="mb-8 space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-medium text-[#ecebe4]">{tr("Langue", "Language", locale)}</h2>
              <p className="mt-0.5 text-[12px] text-[#8c8b83]">
                {tr(
                  "Langue de l'interface, des messages système et des consignes envoyées aux agents.",
                  "Language for the interface, system messages, and prompts sent to agents.",
                  locale,
                )}
              </p>
            </div>
            <select
              aria-label={tr("Langue de l'interface", "Interface language", locale)}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="rounded-lg border border-[#343431] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
        </section>

        <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">
          {tr("Comptes et connexions", "Accounts & connections", locale)}
        </h1>
        <p className="mb-6 max-w-[56ch] text-[13px] text-[#8c8b83]">
          {tr(
            "Connecte chaque agent avec ton compte, sans clé d'API. Kana ne demande ni ton e-mail ni ton mot de passe : l'agent ouvre lui-même sa page de connexion. Une clé d'API reste possible et se range dans le Trousseau du Mac.",
            "Sign in to each agent with your account without an API key. Kana never asks for your email or password: the agent opens its own login flow. An API key remains optional and is stored in the macOS Keychain.",
            locale,
          )}
        </p>

        <div className="space-y-3">
          {AGENTS.map((agent) => (
            <AccountCard key={agent.id} agent={agent} />
          ))}
        </div>

        <section className="mt-8 space-y-3 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
          <div>
            <h2 className="text-[14px] font-medium text-[#ecebe4]">
              {tr("Notifications", "Notifications", locale)}
            </h2>
            <p className="mt-0.5 text-[12px] text-[#8c8b83]">
              {tr(
                "Alerte le système lorsqu'un agent termine en arrière-plan ou demande une autorisation.",
                "Alerts the OS when a background agent finishes or requests permission.",
                locale,
              )}
            </p>
          </div>

          <div className="space-y-2.5 text-[13px] text-[#e6e5df]">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[#1b1b19] px-3 py-2">
              <span>{tr("Notifications système", "System notifications", locale)}</span>
              <input
                type="checkbox"
                checked={notifications.enabled}
                onChange={(e) => setNotificationPrefs({ ...notifications, enabled: e.target.checked })}
                className="h-4 w-4 accent-[#d97757]"
              />
            </label>

            <label
              className={`flex items-center justify-between gap-3 rounded-lg bg-[#1b1b19] px-3 py-2 transition ${
                notifications.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              }`}
            >
              <span>{tr("Son de notification", "Notification sound", locale)}</span>
              <input
                type="checkbox"
                checked={notifications.sound}
                disabled={!notifications.enabled}
                onChange={(e) => setNotificationPrefs({ ...notifications, sound: e.target.checked })}
                className="h-4 w-4 accent-[#d97757] disabled:cursor-not-allowed"
              />
            </label>
          </div>
        </section>

        <section className="mt-8 space-y-4 rounded-xl border border-[#2e2e2b] bg-[#21211f] p-4">
          <div className="flex items-start gap-2.5">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#d97757]" strokeWidth={1.8} />
            <div>
              <h2 className="text-[14px] font-medium text-[#ecebe4]">
                {tr(
                  "Sécurité, règles de permissions & journal d'audit",
                  "Security, permission rules & audit log",
                  locale,
                )}
              </h2>
              <p className="mt-0.5 text-[12px] text-[#8c8b83]">
                {tr(
                  "Définis des règles persistantes par outil, commande ou chemin (allow / ask / deny). Les fichiers sensibles (.env, clés SSH, .pem, .key) sont protégés et les secrets sont masqués automatiquement.",
                  "Define persistent rules by tool, command, or path (allow / ask / deny). Sensitive files (.env, SSH keys, .pem, .key) are protected and secrets are automatically redacted.",
                  locale,
                )}
              </p>
            </div>
          </div>

          <form onSubmit={handleAddRule} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={tr("Portée de la règle", "Rule scope", locale)}
              value={ruleScope}
              onChange={(e) => setRuleScope(e.target.value as PermissionRuleScope)}
              className="rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] outline-none"
            >
              <option value="command">{tr("Commande", "Command", locale)}</option>
              <option value="path">{tr("Chemin", "Path", locale)}</option>
              <option value="tool">{tr("Outil", "Tool", locale)}</option>
              <option value="any">{tr("Tout", "Any", locale)}</option>
            </select>

            <select
              aria-label={tr("Décision de la règle", "Rule policy", locale)}
              value={rulePolicy}
              onChange={(e) => setRulePolicy(e.target.value as PermissionPolicy)}
              className="rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] outline-none"
            >
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>

            <input
              type="text"
              aria-label={tr("Motif de la règle", "Rule pattern", locale)}
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              placeholder={tr("ex. npm test, *.pem, git push", "e.g. npm test, *.pem, git push", locale)}
              className="min-w-[160px] flex-1 rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
            />

            <button
              type="submit"
              disabled={!rulePattern.trim()}
              className="rounded-lg bg-[#d97757] px-3 py-1.5 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:opacity-40"
            >
              {tr("Ajouter la règle", "Add rule", locale)}
            </button>
          </form>

          {rules.length === 0 ? (
            <p className="text-[12.5px] text-[#7e7d76]">
              {tr("Aucune règle personnalisée enregistrée.", "No custom rules saved.", locale)}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-2.5 rounded-lg bg-[#1b1b19] px-3 py-2 text-[12.5px]"
                >
                  <input
                    type="checkbox"
                    aria-label={tr(`Activer ${rule.pattern}`, `Enable ${rule.pattern}`, locale)}
                    checked={rule.enabled}
                    onChange={() => togglePermissionRule(rule.id)}
                    className="h-3.5 w-3.5 accent-[#d97757]"
                  />
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase ${POLICY_STYLE[rule.policy]}`}>
                    {rule.policy}
                  </span>
                  <span className="rounded bg-[#2a2a27] px-1.5 py-0.5 font-mono text-[11px] text-[#a3a29a]">
                    {rule.scope}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono ${rule.enabled ? "text-[#ecebe4]" : "text-[#6f6e68] line-through"}`}>
                    {rule.pattern}
                  </span>
                  <button
                    type="button"
                    aria-label={tr(`Supprimer la règle ${rule.pattern}`, `Remove rule ${rule.pattern}`, locale)}
                    onClick={() => removePermissionRule(rule.id)}
                    className="rounded p-1 text-[#8c8b83] transition hover:bg-[#2e2e2b] hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[#2b2b28] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-[#dcdbd3]">
                {tr("Journal d'audit des permissions", "Permission audit log", locale)}{" "}
                <span className="text-[11.5px] text-[#7e7d76]">({audit.length})</span>
              </h3>
              <button
                type="button"
                onClick={clearPermissionAudit}
                disabled={audit.length === 0}
                className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[11.5px] text-[#dcdbd3] transition hover:bg-[#383835] disabled:opacity-40"
              >
                {tr("Vider le journal", "Clear log", locale)}
              </button>
            </div>
            {audit.length === 0 ? (
              <p className="text-[12px] text-[#7e7d76]">
                {tr("Aucune décision enregistrée pour l'instant.", "No permission decisions recorded yet.", locale)}
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {audit.slice(0, 50).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg bg-[#1b1b19] px-2.5 py-1.5 text-[12px]"
                  >
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] uppercase ${POLICY_STYLE[entry.decision]}`}>
                      {entry.decision}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[#dcdbd3]" title={entry.title}>
                      {entry.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[#7e7d76]">
                      {entry.mode} · {entry.source}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <OrphanCleaner knownIds={conversationIds} projects={projectPaths} />
      </div>
    </div>
  );
}
