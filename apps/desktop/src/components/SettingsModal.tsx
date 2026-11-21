import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronUp,
  Coffee,
  Cpu,
  Download,
  KeyRound,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { AGENTS, type AgentInfo } from "../data";
import { useAgentAccount } from "../hooks/useAgentAccount";
import { setLocale, tr, translateRustError, useLocale, type Locale } from "../lib/i18n";
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
import { clearUserProfile, saveUserProfile, useUserProfile, userInitials } from "../lib/profile";
import {
  checkAppUpdate,
  installAdapterCache,
  listAdapterCaches,
  setNotificationPrefs,
  useNotificationPrefs,
  type AdapterCacheInfo,
  type AppUpdateInfo,
} from "../lib/settings";
import ApiKeyField from "./ApiKeyField";
import OrphanCleaner from "./OrphanCleaner";

export type SettingsTabId =
  | "providers"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "application";

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTabId;
  conversationIds: string[];
  projectPaths: string[];
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  onOpenRelay: () => void;
  onClose: () => void;
}

const POLICY_STYLE: Record<PermissionPolicy, string> = {
  allow: "bg-emerald-500/15 text-emerald-300",
  ask: "bg-amber-500/15 text-amber-300",
  deny: "bg-red-500/15 text-red-300",
};

const PROVIDER_ORDER = ["claude", "codex", "gemini", "opencode"] as const;
const RECOMMENDED_PROVIDERS = new Set(["claude", "codex"]);

function ProviderIcon({ agentId }: { agentId: string }) {
  if (agentId === "claude") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#3b82f6]/40 bg-[#1e3a8a]/35 text-[#93c5fd]">
        <Sparkles className="h-4 w-4" strokeWidth={1.8} />
      </span>
    );
  }
  if (agentId === "codex") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
        <Cpu className="h-4 w-4" strokeWidth={1.8} />
      </span>
    );
  }
  if (agentId === "gemini") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-300">
        <Zap className="h-4 w-4" strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#3f3f3a] bg-[#2a2a27] text-[#dcdbd3]">
      <Terminal className="h-4 w-4" strokeWidth={1.8} />
    </span>
  );
}

function ProvidersTab({ onOpenRelay }: { onOpenRelay: () => void }) {
  const locale = useLocale();
  const claude = useAgentAccount("claude");
  const codex = useAgentAccount("codex");
  const gemini = useAgentAccount("gemini");
  const opencode = useAgentAccount("opencode");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const accounts: Record<string, ReturnType<typeof useAgentAccount>> = {
    claude,
    codex,
    gemini,
    opencode,
  };

  const orderedAgents: AgentInfo[] = PROVIDER_ORDER.map(
    (id) => AGENTS.find((agent) => agent.id === id)!,
  ).filter(Boolean);

  const connectedAgents = orderedAgents.filter((agent) => {
    const acc = accounts[agent.id];
    return acc.state.phase === "ready" || acc.state.hasKey;
  });

  const toggleExpand = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[#ecebe4]">
          {tr("Fournisseurs", "Providers", locale)}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#8c8b83]">
          {tr(
            "Connectez vos agents IA via OAuth ACP local ou clé API stockée dans le Trousseau macOS.",
            "Connect your AI agents via local ACP OAuth or an API key stored in the macOS Keychain.",
            locale,
          )}
        </p>
      </div>

      {/* Section 1: Fournisseurs connectés */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8c8b83]">
            {tr("Fournisseurs connectés", "Connected providers", locale)}
          </h3>
          <span className="rounded-full bg-[#252523] px-2 py-0.5 font-mono text-[11px] text-[#a3a29a]">
            {connectedAgents.length}
          </span>
        </div>

        <div className="rounded-xl border border-[#2f2f2c] bg-[#181817]">
          {connectedAgents.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-[12.5px] text-[#8c8b83]">
              <span>
                {tr(
                  "Aucun fournisseur connecté pour l'instant. Sélectionnez un fournisseur ci-dessous pour démarrer.",
                  "No providers connected yet. Pick a provider below to get started.",
                  locale,
                )}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-[#282825]">
              {connectedAgents.map((agent) => {
                const { state } = accounts[agent.id];
                const isReady = state.phase === "ready";
                return (
                  <div key={agent.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ProviderIcon agentId={agent.id} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                          <span className="truncate text-[13.5px] font-medium text-[#ecebe4]">
                            {agent.name}
                          </span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            {isReady
                              ? tr("Connecté", "Connected", locale)
                              : tr("Clé API", "API Key", locale)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-[#8c8b83]">{agent.hint}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(agent.id)}
                      className="shrink-0 rounded-lg border border-[#343430] bg-[#252523] px-3 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#2f2f2c]"
                    >
                      {tr("Gérer", "Manage", locale)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Fournisseurs disponibles */}
      <section className="space-y-2.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8c8b83]">
          {tr("Fournisseurs disponibles", "Available providers", locale)}
        </h3>

        <div className="divide-y divide-[#282825] overflow-hidden rounded-xl border border-[#2f2f2c] bg-[#181817]">
          {orderedAgents.map((agent) => {
            const { state, check, login, saveKey, removeKey } = accounts[agent.id];
            const expanded = expandedId === agent.id;
            const busy = state.phase === "checking" || state.phase === "logging_in";
            const isConnected = state.phase === "ready" || state.hasKey;
            const recommended = RECOMMENDED_PROVIDERS.has(agent.id);

            return (
              <div key={agent.id} className="transition">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProviderIcon agentId={agent.id} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium text-[#ecebe4]">{agent.name}</span>
                        {recommended && (
                          <span className="rounded-full bg-[#1e3a8a]/35 px-2 py-0.5 text-[10.5px] font-medium text-[#93c5fd]">
                            {tr("Recommandé", "Recommended", locale)}
                          </span>
                        )}
                        {isConnected && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {state.phase === "ready"
                              ? tr("Connecté", "Connected", locale)
                              : tr("Clé API", "API Key", locale)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-[#8c8b83]">{agent.hint}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(agent.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                      expanded
                        ? "border border-[#3f3f3a] bg-[#2b2b29] text-[#ecebe4]"
                        : isConnected
                          ? "border border-[#343430] bg-[#252523] text-[#dcdbd3] hover:bg-[#2f2f2c]"
                          : "bg-[#2b2b29] text-[#ecebe4] hover:bg-[#383834]"
                    }`}
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        <span>{tr("Fermer", "Close", locale)}</span>
                      </>
                    ) : isConnected ? (
                      <span>{tr("Gérer", "Manage", locale)}</span>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 text-[#60a5fa]" />
                        <span>{tr("Connecter", "Connect", locale)}</span>
                      </>
                    )}
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 border-t border-[#262623] bg-[#1c1c1a] px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] text-[#a3a29a]">
                        {state.phase === "ready"
                          ? tr("Connexion ACP vérifiée et prête.", "ACP connection verified and ready.", locale)
                          : state.phase === "checking"
                            ? tr("Vérification de l'agent en cours…", "Checking agent status…", locale)
                            : state.phase === "logging_in"
                              ? tr("Connexion OAuth en cours…", "OAuth sign-in in progress…", locale)
                              : tr("Vérifiez la session ACP ou connectez-vous via OAuth.", "Verify the ACP session or sign in with OAuth.", locale)}
                      </span>
                      <button
                        type="button"
                        onClick={check}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg border border-[#383834] bg-[#252523] px-3 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#2f2f2c] disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                        <span>{tr("Vérifier", "Check", locale)}</span>
                      </button>
                    </div>

                    {state.phase === "needs_login" && state.methods.length > 0 && (
                      <div className="space-y-1.5">
                        {state.methods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => login(method.id)}
                            className="w-full rounded-xl bg-[#1e40af] px-3.5 py-2 text-left text-[12.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb]"
                          >
                            {method.name}
                            {method.description && (
                              <span className="mt-0.5 block text-[11.5px] font-normal text-[#3a2a22]">
                                {method.description}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {state.phase === "needs_login" && state.methods.length === 0 && (
                      <p className="text-[12px] text-[#93c5fd]">
                        {tr(
                          "Connectez cet agent depuis son propre terminal, puis cliquez sur Vérifier.",
                          "Sign in to this agent from its own terminal, then click Check.",
                          locale,
                        )}
                      </p>
                    )}

                    {state.phase === "error" && (
                      <p className="whitespace-pre-wrap rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                        {translateRustError(state.message, locale)}
                      </p>
                    )}

                    {agent.keyVariable && (
                      <div className="border-t border-[#2b2b28] pt-3">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[#8c8b83]">
                          <KeyRound className="h-3.5 w-3.5 text-[#60a5fa]" />
                          <span>{tr("Trousseau macOS", "macOS Keychain", locale)}</span>
                        </div>
                        <ApiKeyField
                          variable={agent.keyVariable}
                          hasKey={state.hasKey}
                          onSave={saveKey}
                          onRemove={removeKey}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Carte compacte Relais automatique de quota */}
      <section className="flex items-center justify-between gap-4 rounded-xl border border-[#2f2f2c] bg-[#181817] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#383834] bg-[#252523] text-[#60a5fa]">
            <Repeat2 className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-[#ecebe4]">
              {tr("Relais automatique de quota", "Automatic quota relay", locale)}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#8c8b83]">
              {tr(
                "Bascule automatiquement vers un autre fournisseur lorsqu'une limite est atteinte.",
                "Automatically hand off to another provider when a quota limit is reached.",
                locale,
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenRelay}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#383834] bg-[#252523] px-3 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#2f2f2c]"
        >
          <span>{tr("Configurer", "Configure", locale)}</span>
          <ArrowRight className="h-3.5 w-3.5 text-[#8c8b83]" />
        </button>
      </section>
    </div>
  );
}

function AccountTab() {
  const locale = useLocale();
  const profile = useUserProfile();
  const [nameInput, setNameInput] = useState(profile.name);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setNameInput(profile.name);
  }, [profile.name]);

  const initials = userInitials(nameInput.trim() || profile.name);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    saveUserProfile(trimmed);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[#ecebe4]">
          {tr("Compte", "Account", locale)}
        </h2>
        <p className="mt-1 text-[12.5px] text-[#8c8b83]">
          {tr(
            "Votre profil est stocké localement dans ~/.kana/ et SQLite, sans compte cloud requis.",
            "Your profile is stored locally in ~/.kana/ and SQLite, with no cloud account required.",
            locale,
          )}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-[#2f2f2c] bg-[#181817] p-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#3e3e39] bg-[#1e3a8a]/35 text-[15px] font-semibold text-[#93c5fd]">
            {initials ? initials : <User className="h-5 w-5 text-[#8c8b83]" />}
          </div>
          <div>
            <p className="text-[14px] font-medium text-[#ecebe4]">
              {profile.name || tr("Profil local", "Local profile", locale)}
            </p>
            <p className="text-[12px] text-[#8c8b83]">
              {tr("Stockage 100 % local · macOS", "100% local storage · macOS", locale)}
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="kana-settings-account-name"
            className="mb-1.5 block text-[12.5px] font-medium text-[#c4c3bc]"
          >
            {tr("Comment souhaitez-vous que Kana vous appelle ?", "What should Kana call you?", locale)}
          </label>
          <input
            id="kana-settings-account-name"
            type="text"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder={tr("Prénom ou pseudo", "First name or handle", locale)}
            className="w-full rounded-xl border border-[#343430] bg-[#1f1f1d] px-3.5 py-2 text-[13px] text-[#ecebe4] placeholder-[#6e6d66] outline-none focus:border-[#3b82f6] select-text"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {profile.name ? (
            <button
              type="button"
              onClick={() => clearUserProfile()}
              className="rounded-lg border border-[#383834] bg-[#252523] px-3 py-1.5 text-[12px] text-[#93c5fd] transition hover:bg-[#2f2f2c]"
            >
              {tr("Se déconnecter", "Sign out", locale)}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            {savedNotice && (
              <span className="flex items-center gap-1 text-[12px] text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                {tr("Enregistré", "Saved", locale)}
              </span>
            )}
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="rounded-lg bg-[#1e40af] px-3.5 py-1.5 text-[12.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:opacity-40"
            >
              {tr("Enregistrer", "Save", locale)}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AppearanceTab() {
  const locale = useLocale();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[#ecebe4]">
          {tr("Apparence & Langue", "Appearance & Language", locale)}
        </h2>
        <p className="mt-1 text-[12.5px] text-[#8c8b83]">
          {tr(
            "Langue de l'interface, des messages système et des consignes envoyées aux agents.",
            "Language for the interface, system messages, and prompts sent to agents.",
            locale,
          )}
        </p>
      </div>

      <section className="rounded-xl border border-[#2f2f2c] bg-[#181817] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[13.5px] font-medium text-[#ecebe4]">
              {tr("Langue", "Language", locale)}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#8c8b83]">
              {tr("Français ou English", "Français or English", locale)}
            </p>
          </div>
          <select
            aria-label={tr("Langue de l'interface", "Interface language", locale)}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="rounded-lg border border-[#343431] bg-[#252523] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#3b82f6]"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-[#2f2f2c] bg-[#181817] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[13.5px] font-medium text-[#ecebe4]">
              {tr("Thème visuel", "Visual theme", locale)}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#8c8b83]">
              {tr("Palette sombre Kana Bleu Marine (#181817 · accent #1e40af / #3b82f6).", "Kana Navy Blue dark palette (#181817 · accent #1e40af / #3b82f6).", locale)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-[#343431] bg-[#252523] px-2.5 py-1.5 text-[12px] text-[#ecebe4]">
            <span className="h-3 w-3 rounded-full border border-[#4a4a44] bg-[#181817]" />
            <span className="h-3 w-3 rounded-full bg-[#2563eb]" />
            <span>{tr("Sombre", "Dark", locale)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function NotificationsTab({
  keepAwake,
  onToggleKeepAwake,
}: {
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
}) {
  const locale = useLocale();
  const notifications = useNotificationPrefs();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[#ecebe4]">
          {tr("Notifications", "Notifications", locale)}
        </h2>
        <p className="mt-1 text-[12.5px] text-[#8c8b83]">
          {tr(
            "Alerte le système lorsqu'un agent termine en arrière-plan ou demande une autorisation.",
            "Alerts macOS when a background agent finishes or requests permission.",
            locale,
          )}
        </p>
      </div>

      <section className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#181817] p-4 text-[13px] text-[#ecebe4]">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[#222220] px-3.5 py-2.5">
          <div>
            <span className="block font-medium">
              {tr("Notifications système macOS", "macOS system notifications", locale)}
            </span>
            <span className="text-[11.5px] text-[#8c8b83]">
              {tr("Bannières natives à la fin d'une tâche.", "Native banners when a task finishes.", locale)}
            </span>
          </div>
          <input
            type="checkbox"
            checked={notifications.enabled}
            onChange={(event) => setNotificationPrefs({ ...notifications, enabled: event.target.checked })}
            className="h-4 w-4 accent-[#2563eb]"
          />
        </label>

        <label
          className={`flex items-center justify-between gap-3 rounded-lg bg-[#222220] px-3.5 py-2.5 transition ${
            notifications.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <div>
            <span className="block font-medium">
              {tr("Son de notification « Glass »", "\"Glass\" notification sound", locale)}
            </span>
            <span className="text-[11.5px] text-[#8c8b83]">
              {tr("Joue le son système discret lors d'une alerte.", "Play a subtle system sound on alerts.", locale)}
            </span>
          </div>
          <input
            type="checkbox"
            checked={notifications.sound}
            disabled={!notifications.enabled}
            onChange={(event) => setNotificationPrefs({ ...notifications, sound: event.target.checked })}
            className="h-4 w-4 accent-[#2563eb] disabled:cursor-not-allowed"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[#222220] px-3.5 py-2.5">
          <div className="flex items-start gap-2.5">
            <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-[#60a5fa]" />
            <div>
              <span className="block font-medium">
                {tr("Maintenir l'ordinateur actif", "Keep computer awake", locale)}
              </span>
              <span className="text-[11.5px] text-[#8c8b83]">
                {tr(
                  "Empêche la mise en veille pendant les longues exécutions d'agents.",
                  "Prevents sleep during long-running agent sessions.",
                  locale,
                )}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={keepAwake}
            onChange={onToggleKeepAwake}
            className="h-4 w-4 accent-[#2563eb]"
          />
        </label>
      </section>
    </div>
  );
}

function SecurityTab() {
  const locale = useLocale();
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
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-[#ecebe4]">
          {tr("Sécurité, règles de permissions & journal d'audit", "Security, permission rules & audit log", locale)}
        </h2>
        <p className="mt-1 text-[12.5px] text-[#8c8b83]">
          {tr(
            "Définis des règles persistantes par outil, commande ou chemin (allow / ask / deny). Les fichiers sensibles (.env, clés SSH, .pem, .key) sont protégés et les secrets sont masqués automatiquement.",
            "Define persistent rules by tool, command, or path (allow / ask / deny). Sensitive files (.env, SSH keys, .pem, .key) are protected and secrets are automatically redacted.",
            locale,
          )}
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-[#2f2f2c] bg-[#181817] p-4">
        <form onSubmit={handleAddRule} className="flex flex-wrap items-center gap-2">
          <select
            aria-label={tr("Portée de la règle", "Rule scope", locale)}
            value={ruleScope}
            onChange={(event) => setRuleScope(event.target.value as PermissionRuleScope)}
            className="rounded-lg border border-[#343431] bg-[#252523] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] outline-none"
          >
            <option value="command">{tr("Commande", "Command", locale)}</option>
            <option value="path">{tr("Chemin", "Path", locale)}</option>
            <option value="tool">{tr("Outil", "Tool", locale)}</option>
            <option value="any">{tr("Tout", "Any", locale)}</option>
          </select>

          <select
            aria-label={tr("Décision de la règle", "Rule policy", locale)}
            value={rulePolicy}
            onChange={(event) => setRulePolicy(event.target.value as PermissionPolicy)}
            className="rounded-lg border border-[#343431] bg-[#252523] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] outline-none"
          >
            <option value="allow">allow</option>
            <option value="ask">ask</option>
            <option value="deny">deny</option>
          </select>

          <input
            type="text"
            aria-label={tr("Motif de la règle", "Rule pattern", locale)}
            value={rulePattern}
            onChange={(event) => setRulePattern(event.target.value)}
            placeholder={tr("ex. npm test, *.pem, git push", "e.g. npm test, *.pem, git push", locale)}
            className="min-w-[150px] flex-1 rounded-lg border border-[#343431] bg-[#1f1f1d] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#3b82f6] select-text"
          />

          <button
            type="submit"
            disabled={!rulePattern.trim()}
            className="rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:opacity-40"
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
                className="flex items-center gap-2.5 rounded-lg bg-[#222220] px-3 py-2 text-[12.5px]"
              >
                <input
                  type="checkbox"
                  aria-label={tr(`Activer ${rule.pattern}`, `Enable ${rule.pattern}`, locale)}
                  checked={rule.enabled}
                  onChange={() => togglePermissionRule(rule.id)}
                  className="h-3.5 w-3.5 accent-[#2563eb]"
                />
                <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase ${POLICY_STYLE[rule.policy]}`}>
                  {rule.policy}
                </span>
                <span className="rounded bg-[#2a2a27] px-1.5 py-0.5 font-mono text-[11px] text-[#a3a29a]">
                  {rule.scope}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-mono ${
                    rule.enabled ? "text-[#ecebe4]" : "text-[#6f6e68] line-through"
                  }`}
                >
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

        <div className="border-t border-[#2b2b28] pt-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-[#dcdbd3]">
              {tr("Journal d'audit des permissions", "Permission audit log", locale)}{" "}
              <span className="text-[11.5px] text-[#7e7d76]">({audit.length})</span>
            </h3>
            <button
              type="button"
              onClick={clearPermissionAudit}
              disabled={audit.length === 0}
              className="rounded-lg bg-[#2b2b29] px-2.5 py-1 text-[11.5px] text-[#dcdbd3] transition hover:bg-[#383834] disabled:opacity-40"
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
                  className="flex items-center gap-2 rounded-lg bg-[#222220] px-2.5 py-1.5 text-[12px]"
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
    </div>
  );
}

function ApplicationTab({
  conversationIds,
  projectPaths,
}: {
  conversationIds: string[];
  projectPaths: string[];
}) {
  const locale = useLocale();
  const [adapterCaches, setAdapterCaches] = useState<AdapterCacheInfo[]>([]);
  const [installingAdapter, setInstallingAdapter] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    void listAdapterCaches()
      .then(setAdapterCaches)
      .catch(() => {});
  }, []);

  const handleInstallAdapter = async (agentId: string) => {
    if (installingAdapter) return;
    setInstallingAdapter(agentId);
    try {
      const updated = await installAdapterCache(agentId);
      setAdapterCaches((prev) => prev.map((item) => (item.agent_id === agentId ? updated : item)));
    } finally {
      setInstallingAdapter(null);
    }
  };

  const handleInstallAllAdapters = async () => {
    if (installingAdapter) return;
    for (const adapter of adapterCaches) {
      setInstallingAdapter(adapter.agent_id);
      try {
        const updated = await installAdapterCache(adapter.agent_id);
        setAdapterCaches((prev) => prev.map((item) => (item.agent_id === adapter.agent_id ? updated : item)));
      } catch {
        // continue caching remaining adapters
      }
    }
    setInstallingAdapter(null);
  };

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const info = await checkAppUpdate();
      setUpdateInfo(info);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#ecebe4]">
            {tr(
              "Mises à jour Tauri & Cache local des adaptateurs ACP",
              "Tauri Auto-updater & Local ACP Adapter Cache",
              locale,
            )}
          </h2>
          <p className="mt-1 text-[12.5px] text-[#8c8b83]">
            {tr(
              "Vérifie les mises à jour GitHub Releases et pré-installe les adaptateurs ACP dans ~/.kana/adapters.",
              "Check GitHub Releases updates and pre-install ACP adapters in ~/.kana/adapters.",
              locale,
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#343430] bg-[#181817] px-2.5 py-0.5 font-mono text-[11.5px] text-[#a3a29a]">
          v0.1.0
        </span>
      </div>

      <section className="space-y-4 rounded-xl border border-[#2f2f2c] bg-[#181817] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleInstallAllAdapters()}
            disabled={installingAdapter !== null || adapterCaches.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{tr("Tout mettre en cache", "Cache all adapters", locale)}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCheckUpdate()}
            disabled={checkingUpdate}
            className="flex items-center gap-1.5 rounded-lg border border-[#383834] bg-[#252523] px-3 py-1.5 text-[12px] text-[#ecebe4] transition hover:bg-[#31312e] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? "animate-spin" : ""}`} />
            <span>{tr("Vérifier les mises à jour", "Check for updates", locale)}</span>
          </button>
        </div>

        {updateInfo && (
          <div className="rounded-lg border border-[#343431] bg-[#222220] px-3 py-2.5 text-[12.5px] text-[#dcdbd3]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#ecebe4]">
                Kana v{updateInfo.currentVersion} ({updateInfo.channel})
              </span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                {updateInfo.updateAvailable
                  ? tr(`Mise à jour v${updateInfo.latestVersion} disponible`, `Update v${updateInfo.latestVersion} available`, locale)
                  : tr("À jour", "Up to date", locale)}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#8c8b83]">{updateInfo.releaseNotes}</p>
          </div>
        )}

        <div className="space-y-2">
          {adapterCaches.map((adapter) => (
            <div
              key={adapter.agent_id}
              className="flex items-center justify-between gap-3 rounded-lg bg-[#222220] px-3 py-2 text-[12.5px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize text-[#ecebe4]">{adapter.agent_id}</span>
                  <span className="font-mono text-[11px] text-[#8c8b83]">{adapter.package}</span>
                  {adapter.cached ? (
                    <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
                      <Check className="h-3 w-3" />
                      <span>{tr("En cache local", "Cached locally", locale)}</span>
                    </span>
                  ) : (
                    <span className="rounded bg-[#2b2b29] px-1.5 py-0.5 text-[11px] text-[#9a9992]">
                      npx -y
                    </span>
                  )}
                </div>
                {adapter.local_path && (
                  <p className="mt-0.5 truncate font-mono text-[11px] text-[#6f6e68]">
                    {adapter.local_path}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={installingAdapter === adapter.agent_id}
                onClick={() => void handleInstallAdapter(adapter.agent_id)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2f2f2c] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3a3a36] disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>
                  {installingAdapter === adapter.agent_id
                    ? tr("Installation…", "Installing…", locale)
                    : adapter.cached
                      ? tr("Mettre à jour le cache", "Update cache", locale)
                      : tr("Mettre en cache", "Cache locally", locale)}
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <OrphanCleaner knownIds={conversationIds} projects={projectPaths} />
    </div>
  );
}

export default function SettingsModal({
  open,
  initialTab = "providers",
  conversationIds,
  projectPaths,
  keepAwake,
  onToggleKeepAwake,
  onOpenRelay,
  onClose,
}: SettingsModalProps) {
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setQuery("");
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const tabs = useMemo(
    () => [
      {
        id: "providers" as const,
        label: tr("Fournisseurs", "Providers", locale),
        icon: Sparkles,
        keywords: "fournisseurs providers claude codex gemini opencode api oauth acp relais quota",
      },
      {
        id: "account" as const,
        label: tr("Compte", "Account", locale),
        icon: User,
        keywords: "compte account profil profile nom pseudo avatar",
      },
      {
        id: "appearance" as const,
        label: tr("Apparence & Langue", "Appearance & Language", locale),
        icon: Palette,
        keywords: "apparence langue appearance language theme fr en francais english",
      },
      {
        id: "notifications" as const,
        label: tr("Notifications", "Notifications", locale),
        icon: Bell,
        keywords: "notifications son sound glass keepawake veille",
      },
      {
        id: "security" as const,
        label: tr("Permissions & Sécurité", "Permissions & Security", locale),
        icon: Shield,
        keywords: "permissions securite security allow deny ask audit regles rules",
      },
      {
        id: "application" as const,
        label: tr("Application", "Application", locale),
        icon: Package,
        keywords: "application cache adaptateurs acp mises a jour update version github releases",
      },
    ],
    [locale],
  );

  const filteredTabs = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return tabs;
    return tabs.filter(
      (tab) =>
        tab.label.toLowerCase().includes(trimmed) || tab.keywords.toLowerCase().includes(trimmed),
    );
  }, [tabs, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Paramètres", "Settings", locale)}
        className="flex h-[640px] max-h-[88vh] w-full max-w-[820px] overflow-hidden rounded-2xl border border-[#383834] bg-[#1f1f1d] text-[#ecebe4] shadow-2xl"
      >
        {/* Barre latérale gauche */}
        <aside className="flex w-[210px] shrink-0 flex-col border-r border-[#2d2d2a] bg-[#1a1a18] p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[13.5px] font-semibold text-[#ecebe4]">
              {tr("Paramètres", "Settings", locale)}
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#7e7d76]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Rechercher", "Search", locale)}
              aria-label={tr("Rechercher dans les paramètres", "Search settings", locale)}
              className="w-full rounded-lg border border-[#31312e] bg-[#252523] py-1.5 pr-2.5 pl-8 text-[12.5px] text-[#ecebe4] placeholder-[#7e7d76] outline-none focus:border-[#4e4e48] select-text"
            />
          </div>

          <nav aria-label={tr("Onglets des paramètres", "Settings tabs", locale)} className="flex-1 space-y-0.5 overflow-y-auto">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition ${
                    selected
                      ? "bg-[#2b2b29] font-medium text-[#ecebe4]"
                      : "text-[#a8a79f] hover:bg-[#242422] hover:text-[#ecebe4]"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${selected ? "text-[#60a5fa]" : "text-[#8c8b83]"}`}
                    strokeWidth={1.7}
                  />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
            {filteredTabs.length === 0 && (
              <p className="px-2.5 py-3 text-[12px] text-[#7e7d76]">
                {tr("Aucun onglet trouvé.", "No matching tab.", locale)}
              </p>
            )}
          </nav>

          <div className="mt-2 border-t border-[#2b2b28] px-2 pt-2.5 text-[11px] text-[#7e7d76]">
            Kana v0.1.0
          </div>
        </aside>

        {/* Contenu principal */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-end px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={onClose}
              aria-label={tr("Fermer les paramètres", "Close settings", locale)}
              className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {activeTab === "providers" && (
              <ProvidersTab
                onOpenRelay={() => {
                  onClose();
                  onOpenRelay();
                }}
              />
            )}
            {activeTab === "account" && <AccountTab />}
            {activeTab === "appearance" && <AppearanceTab />}
            {activeTab === "notifications" && (
              <NotificationsTab keepAwake={keepAwake} onToggleKeepAwake={onToggleKeepAwake} />
            )}
            {activeTab === "security" && <SecurityTab />}
            {activeTab === "application" && (
              <ApplicationTab conversationIds={conversationIds} projectPaths={projectPaths} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
