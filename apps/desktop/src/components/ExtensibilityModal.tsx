import { useEffect, useState } from "react";
import { Blocks, Check, Download, FileText, Play, Plug, Plus, RefreshCw, Sparkles, Terminal, Trash2, Upload, X } from "lucide-react";
import {
  BUILTIN_PLUGIN_PACKS,
  RULE_FILE_PATHS,
  clearHookLogs,
  exportPluginPack,
  exportSkillMarkdown,
  importPluginPack,
  loadHookLogs,
  loadHooks,
  loadMcpServers,
  loadSkills,
  parseSkillMarkdown,
  readRuleFiles,
  removeHook,
  removeMcpServer,
  removeSkill,
  syncRuleFiles,
  toggleHook,
  toggleMcpServer,
  toggleSkill,
  upsertHook,
  upsertMcpServer,
  upsertSkill,
  useExtensibilityVersion,
  writeRuleFile,
  type HookEvent,
  type McpTransport,
  type RuleFile,
  type SkillItem,
  type UserMcpServer,
} from "../lib/extensibility";
import { NO_PROJECT } from "../lib/projects";

export type ExtensibilityTab = "mcp" | "rules" | "skills" | "hooks" | "plugins";

interface ExtensibilityModalProps {
  open: boolean;
  initialTab: ExtensibilityTab;
  projectPath?: string;
  ruleRoot?: string;
  onClose: () => void;
}

const TABS: Array<{ id: ExtensibilityTab; label: string }> = [
  { id: "mcp", label: "Connecteurs MCP" },
  { id: "rules", label: "Règles" },
  { id: "skills", label: "Skills" },
  { id: "hooks", label: "Hooks" },
  { id: "plugins", label: "Plug-ins & Packs" },
];

const parseKeyValues = (raw: string, sep: "=" | ":"): Record<string, string> | undefined => {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(sep);
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const formatKeyValues = (obj: Record<string, string> | undefined, sep: "=" | ":"): string =>
  obj ? Object.entries(obj).map(([k, v]) => `${k}${sep === ":" ? ": " : "="}${v}`).join("\n") : "";

const scopeLabel = (scope: string) =>
  scope === "global" ? "Global" : scope.split("/").filter(Boolean).pop() ?? scope;

export default function ExtensibilityModal({
  open,
  initialTab,
  projectPath,
  ruleRoot,
  onClose,
}: ExtensibilityModalProps) {
  useExtensibilityVersion();
  const [tab, setTab] = useState<ExtensibilityTab>(initialTab);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const hasProject = !!projectPath && projectPath !== NO_PROJECT;
  const effectiveRuleRoot = ruleRoot && ruleRoot !== NO_PROJECT ? ruleRoot : hasProject ? projectPath : undefined;

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setNotice("");
      setError("");
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // --- MCP state ---
  const [mcpEditId, setMcpEditId] = useState<string | undefined>();
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState<McpTransport>("stdio");
  const [mcpScope, setMcpScope] = useState<string>("global");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpEnv, setMcpEnv] = useState("");
  const [mcpOauth, setMcpOauth] = useState("");
  const [mcpHeaders, setMcpHeaders] = useState("");

  const resetMcpForm = () => {
    setMcpEditId(undefined);
    setMcpName("");
    setMcpTransport("stdio");
    setMcpScope("global");
    setMcpUrl("");
    setMcpCommand("");
    setMcpArgs("");
    setMcpEnv("");
    setMcpOauth("");
    setMcpHeaders("");
  };

  const editMcp = (srv: UserMcpServer) => {
    setMcpEditId(srv.id);
    setMcpName(srv.name);
    setMcpTransport(srv.transport);
    setMcpScope(srv.scope);
    setMcpUrl(srv.url ?? "");
    setMcpCommand(srv.command ?? "");
    setMcpArgs((srv.args ?? []).join(" "));
    setMcpEnv(formatKeyValues(srv.env, "="));
    setMcpOauth(srv.oauthToken ?? "");
    setMcpHeaders(formatKeyValues(srv.headers, ":"));
  };

  const saveMcp = () => {
    setError("");
    if (!mcpName.trim()) {
      setError("Indique un nom pour le serveur MCP.");
      return;
    }
    if (mcpTransport === "stdio" && !mcpCommand.trim()) {
      setError("Indique la commande du serveur stdio.");
      return;
    }
    if (mcpTransport !== "stdio" && !mcpUrl.trim()) {
      setError("Indique l'URL du serveur HTTP / SSE.");
      return;
    }
    upsertMcpServer({
      id: mcpEditId,
      name: mcpName.trim(),
      transport: mcpTransport,
      scope: mcpScope,
      url: mcpTransport !== "stdio" ? mcpUrl.trim() : undefined,
      command: mcpTransport === "stdio" ? mcpCommand.trim() : undefined,
      args: mcpTransport === "stdio" ? mcpArgs.trim().split(/\s+/).filter(Boolean) : undefined,
      env: mcpTransport === "stdio" ? parseKeyValues(mcpEnv, "=") : undefined,
      oauthToken: mcpTransport !== "stdio" ? mcpOauth.trim() || undefined : undefined,
      headers: mcpTransport !== "stdio" ? parseKeyValues(mcpHeaders, ":") : undefined,
      enabled: true,
    });
    setNotice(`Serveur MCP « ${mcpName.trim()} » enregistré.`);
    resetMcpForm();
  };

  // --- Rules state ---
  const [ruleFiles, setRuleFiles] = useState<RuleFile[]>([]);
  const [activeRulePath, setActiveRulePath] = useState<string>(RULE_FILE_PATHS[0]);
  const [ruleDraft, setRuleDraft] = useState("");
  const [syncTargets, setSyncTargets] = useState<string[]>([...RULE_FILE_PATHS]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const refreshRules = async (selectPath?: string) => {
    setRulesLoading(true);
    try {
      const files = await readRuleFiles(effectiveRuleRoot);
      setRuleFiles(files);
      const target = selectPath ?? activeRulePath;
      const found = files.find((f) => f.path === target) ?? files[0];
      if (found) {
        setActiveRulePath(found.path);
        setRuleDraft(found.content);
      }
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    if (open && (tab === "rules" || tab === "plugins")) {
      void refreshRules();
    }
  }, [open, tab, effectiveRuleRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrentRule = async () => {
    setError("");
    try {
      await writeRuleFile(activeRulePath, ruleDraft, effectiveRuleRoot);
      await refreshRules(activeRulePath);
      setNotice(`${activeRulePath} enregistré.`);
    } catch (e) {
      setError(String(e));
    }
  };

  const syncSelectedRules = async () => {
    setError("");
    try {
      await syncRuleFiles(ruleDraft, syncTargets, effectiveRuleRoot);
      await refreshRules(activeRulePath);
      setNotice(`Règles synchronisées vers ${syncTargets.join(", ")}.`);
    } catch (e) {
      setError(String(e));
    }
  };

  // --- Skills state ---
  const [skillName, setSkillName] = useState("");
  const [skillSlash, setSkillSlash] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillScope, setSkillScope] = useState("global");
  const [skillMdImport, setSkillMdImport] = useState("");

  const addSkill = () => {
    setError("");
    if (!skillName.trim() || !skillContent.trim()) {
      setError("Indique un nom et un contenu pour le skill.");
      return;
    }
    upsertSkill({
      name: skillName.trim(),
      slash: skillSlash.trim() || skillName.trim(),
      description: skillDesc.trim(),
      content: skillContent.trim(),
      scope: skillScope,
      enabled: true,
    });
    setNotice(`Skill /${(skillSlash.trim() || skillName.trim()).replace(/^\/+/, "")} ajouté.`);
    setSkillName("");
    setSkillSlash("");
    setSkillDesc("");
    setSkillContent("");
  };

  const importSkillMd = () => {
    setError("");
    if (!skillMdImport.trim()) {
      setError("Colle le contenu d'un fichier SKILL.md à importer.");
      return;
    }
    const parsed = parseSkillMarkdown(skillMdImport, skillScope);
    upsertSkill(parsed);
    setSkillMdImport("");
    setNotice(`Skill /${parsed.slash} importé depuis SKILL.md.`);
  };

  const copySkillMd = (skill: SkillItem) => {
    const md = exportSkillMarkdown(skill);
    void navigator.clipboard?.writeText(md).catch(() => {});
    setSkillMdImport(md);
    setNotice(`SKILL.md de /${skill.slash} copié dans le presse-papiers et l'aperçu.`);
  };

  // --- Hooks state ---
  const [hookEvent, setHookEvent] = useState<HookEvent>("PostToolUse");
  const [hookMatcher, setHookMatcher] = useState("*");
  const [hookCommand, setHookCommand] = useState("");
  const [hookScope, setHookScope] = useState("global");

  const addHook = () => {
    setError("");
    if (!hookCommand.trim()) {
      setError("Indique la commande shell du hook.");
      return;
    }
    upsertHook({
      event: hookEvent,
      matcher: hookMatcher.trim() || "*",
      command: hookCommand.trim(),
      scope: hookScope,
      enabled: true,
    });
    setHookCommand("");
    setNotice(`Hook ${hookEvent} enregistré.`);
  };

  // --- Plugins state ---
  const [packScope, setPackScope] = useState("global");
  const [packExportName, setPackExportName] = useState("Mon pack Kana");
  const [packJson, setPackJson] = useState("");

  if (!open) return null;

  const mcpServers = loadMcpServers();
  const skills = loadSkills();
  const hooks = loadHooks();
  const hookLogs = loadHookLogs();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Extensibilité et connecteurs"
        className="flex max-h-[86vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#1e1e1c] text-[#ecebe4] shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-center justify-between border-b border-[#2f2f2c] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Blocks className="h-4 w-4 text-[#60a5fa]" strokeWidth={1.8} />
            <h2 className="text-[15px] font-medium">Extensibilité & Connecteurs</h2>
            {hasProject && (
              <span className="rounded-md bg-[#2b2b29] px-2 py-0.5 text-[11.5px] text-[#a3a29a]">
                Projet : {scopeLabel(projectPath)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9a9992] transition hover:bg-[#2f2f2c] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div role="tablist" aria-label="Sections d'extensibilité" className="flex flex-wrap gap-1 border-b border-[#2f2f2c] bg-[#1a1a18] px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setError("");
                setNotice("");
              }}
              className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                tab === t.id
                  ? "bg-[#333330] font-medium text-[#ecebe4]"
                  : "text-[#9a9992] hover:bg-[#272724] hover:text-[#dcdbd3]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 select-text">
          {notice && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
              {error}
            </p>
          )}

          {tab === "mcp" && (
            <div className="space-y-4">
              <div className="space-y-2">
                {mcpServers.length === 0 ? (
                  <p className="rounded-xl border border-[#2f2f2c] bg-[#181817] px-3 py-3 text-[13px] text-[#8c8b83]">
                    Aucun serveur MCP utilisateur configuré. Le serveur intégré <code>kana-browser</code> reste actif automatiquement.
                  </p>
                ) : (
                  mcpServers.map((srv) => (
                    <div
                      key={srv.id}
                      className="flex items-center gap-3 rounded-xl border border-[#2f2f2c] bg-[#232321] px-3.5 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={srv.enabled}
                        aria-label={`Activer ${srv.name}`}
                        onChange={() => toggleMcpServer(srv.id)}
                        className="h-3.5 w-3.5 accent-[#2563eb]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[13.5px]">{srv.name}</span>
                          <span className="rounded bg-[#2f2f2c] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[#8ab4f8]">
                            {srv.transport}
                          </span>
                          <span className="rounded bg-[#2f2f2c] px-1.5 py-0.5 text-[11px] text-[#b3b2aa]">
                            {scopeLabel(srv.scope)}
                          </span>
                          {srv.oauthToken && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
                              OAuth Bearer
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[12px] text-[#8c8b83]">
                          {srv.transport === "stdio"
                            ? `${srv.command ?? ""} ${(srv.args ?? []).join(" ")}`.trim()
                            : srv.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => editMcp(srv)}
                        className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#dcdbd3] hover:bg-[#3a3a36]"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        aria-label={`Supprimer ${srv.name}`}
                        onClick={() => removeMcpServer(srv.id)}
                        className="rounded-lg p-1.5 text-[#8c8b83] hover:bg-[#2f2f2c] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#191918] p-4">
                <h3 className="text-[13px] font-medium text-[#dcdbd3]">
                  {mcpEditId ? "Modifier le serveur MCP" : "Ajouter un serveur MCP"}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <input
                    type="text"
                    aria-label="Nom du serveur MCP"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="Nom (ex. github, context7)"
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#55554f]"
                  />
                  <select
                    aria-label="Transport MCP"
                    value={mcpTransport}
                    onChange={(e) => setMcpTransport(e.target.value as McpTransport)}
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#55554f]"
                  >
                    <option value="stdio">stdio (processus local)</option>
                    <option value="http">HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                  <select
                    aria-label="Portée MCP"
                    value={mcpScope}
                    onChange={(e) => setMcpScope(e.target.value)}
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#55554f]"
                  >
                    <option value="global">Global (tous projets)</option>
                    {hasProject && <option value={projectPath}>Ce projet uniquement</option>}
                  </select>
                </div>

                {mcpTransport === "stdio" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <input
                        type="text"
                        aria-label="Commande MCP"
                        value={mcpCommand}
                        onChange={(e) => setMcpCommand(e.target.value)}
                        placeholder="Commande (ex. npx)"
                        className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                      />
                      <input
                        type="text"
                        aria-label="Arguments MCP"
                        value={mcpArgs}
                        onChange={(e) => setMcpArgs(e.target.value)}
                        placeholder="Arguments (ex. -y @modelcontextprotocol/server-filesystem .)"
                        className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                      />
                    </div>
                    <textarea
                      rows={2}
                      aria-label="Variables d'environnement MCP"
                      value={mcpEnv}
                      onChange={(e) => setMcpEnv(e.target.value)}
                      placeholder="Variables d'environnement (une par ligne : CLE=valeur)"
                      className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[#55554f]"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <input
                        type="text"
                        aria-label="URL MCP"
                        value={mcpUrl}
                        onChange={(e) => setMcpUrl(e.target.value)}
                        placeholder="URL (ex. https://mcp.exemple.com/mcp)"
                        className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                      />
                      <input
                        type="password"
                        aria-label="Jeton OAuth MCP"
                        value={mcpOauth}
                        onChange={(e) => setMcpOauth(e.target.value)}
                        placeholder="Jeton Bearer OAuth (optionnel)"
                        className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                      />
                    </div>
                    <textarea
                      rows={2}
                      aria-label="En-têtes HTTP MCP"
                      value={mcpHeaders}
                      onChange={(e) => setMcpHeaders(e.target.value)}
                      placeholder="En-têtes personnalisés (un par ligne : Nom: valeur)"
                      className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[#55554f]"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  {mcpEditId && (
                    <button
                      type="button"
                      onClick={resetMcpForm}
                      className="rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12.5px] text-[#dcdbd3] hover:bg-[#3a3a36]"
                    >
                      Annuler l'édition
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveMcp}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1e40af] px-3.5 py-1.5 text-[12.5px] font-medium text-[#f8fafc] hover:bg-[#2563eb]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{mcpEditId ? "Mettre à jour" : "Ajouter le serveur MCP"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "rules" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {RULE_FILE_PATHS.map((path) => {
                    const info = ruleFiles.find((f) => f.path === path);
                    const active = activeRulePath === path;
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => {
                          setActiveRulePath(path);
                          setRuleDraft(info?.content ?? "");
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[12px] transition ${
                          active
                            ? "border-[#3b82f6] bg-[#1e3a8a]/35 text-[#ecebe4]"
                            : "border-[#343431] bg-[#232321] text-[#b3b2aa] hover:bg-[#2c2c29]"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${info?.exists ? "bg-emerald-400" : "bg-[#55554f]"}`} />
                        <span>{path}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void refreshRules()}
                  disabled={rulesLoading}
                  className="flex items-center gap-1 rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#dcdbd3] hover:bg-[#3a3a36]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${rulesLoading ? "animate-spin" : ""}`} />
                  <span>Relire</span>
                </button>
              </div>

              <textarea
                rows={10}
                aria-label="Contenu de la règle"
                value={ruleDraft}
                onChange={(e) => setRuleDraft(e.target.value)}
                placeholder={`Instructions pour ${activeRulePath}…`}
                className="w-full rounded-xl border border-[#343431] bg-[#181817] p-3 font-mono text-[12.5px] leading-relaxed text-[#ecebe4] outline-none focus:border-[#55554f]"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12px] text-[#9a9992]">Cibles de sync :</span>
                  {RULE_FILE_PATHS.map((path) => {
                    const checked = syncTargets.includes(path);
                    return (
                      <label key={path} className="flex cursor-pointer items-center gap-1.5 font-mono text-[12px] text-[#dcdbd3]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSyncTargets((prev) =>
                              e.target.checked ? [...new Set([...prev, path])] : prev.filter((p) => p !== path),
                            )
                          }
                          className="h-3.5 w-3.5 accent-[#2563eb]"
                        />
                        <span>{path}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveCurrentRule()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12.5px] text-[#ecebe4] hover:bg-[#3a3a36]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Enregistrer {activeRulePath}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncSelectedRules()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12.5px] font-medium text-[#f8fafc] hover:bg-[#2563eb]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Synchroniser les règles</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "skills" && (
            <div className="space-y-4">
              <div className="space-y-2">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-start gap-3 rounded-xl border border-[#2f2f2c] bg-[#232321] px-3.5 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      aria-label={`Activer /${skill.slash}`}
                      onChange={() => toggleSkill(skill.id)}
                      className="mt-1 h-3.5 w-3.5 accent-[#2563eb]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] font-medium text-[#8ab4f8]">/{skill.slash}</span>
                        <span className="text-[13px] font-medium">{skill.name}</span>
                        <span className="rounded bg-[#2f2f2c] px-1.5 py-0.5 text-[11px] text-[#b3b2aa]">
                          {scopeLabel(skill.scope)}
                        </span>
                      </div>
                      {skill.description && <p className="mt-0.5 text-[12px] text-[#9a9992]">{skill.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => copySkillMd(skill)}
                      className="rounded-lg bg-[#2e2e2b] px-2 py-1 text-[11.5px] text-[#dcdbd3] hover:bg-[#3a3a36]"
                    >
                      SKILL.md
                    </button>
                    <button
                      type="button"
                      aria-label={`Supprimer ${skill.slash}`}
                      onClick={() => removeSkill(skill.id)}
                      className="rounded-lg p-1.5 text-[#8c8b83] hover:bg-[#2f2f2c] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3.5">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-[#dcdbd3]">
                    <Sparkles className="h-3.5 w-3.5 text-[#8ab4f8]" />
                    <span>Créer un skill</span>
                  </h3>
                  <input
                    type="text"
                    aria-label="Nom du skill"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="Nom du skill"
                    className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      aria-label="Commande slash"
                      value={skillSlash}
                      onChange={(e) => setSkillSlash(e.target.value)}
                      placeholder="/commande-slash"
                      className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                    />
                    <select
                      aria-label="Portée du skill"
                      value={skillScope}
                      onChange={(e) => setSkillScope(e.target.value)}
                      className="rounded-lg border border-[#343431] bg-[#222220] px-2 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                    >
                      <option value="global">Global</option>
                      {hasProject && <option value={projectPath}>Ce projet</option>}
                    </select>
                  </div>
                  <input
                    type="text"
                    aria-label="Description du skill"
                    value={skillDesc}
                    onChange={(e) => setSkillDesc(e.target.value)}
                    placeholder="Courte description"
                    className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                  />
                  <textarea
                    rows={4}
                    aria-label="Prompt du skill"
                    value={skillContent}
                    onChange={(e) => setSkillContent(e.target.value)}
                    placeholder="Prompt réutilisable ($ARGUMENTS accepté)…"
                    className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[#55554f]"
                  />
                  <button
                    type="button"
                    onClick={addSkill}
                    className="w-full rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12.5px] font-medium text-[#f8fafc] hover:bg-[#2563eb]"
                  >
                    Ajouter le skill
                  </button>
                </div>

                <div className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3.5">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-[#dcdbd3]">
                    <Upload className="h-3.5 w-3.5 text-[#8ab4f8]" />
                    <span>Importer un SKILL.md</span>
                  </h3>
                  <textarea
                    rows={8}
                    aria-label="Contenu SKILL.md à importer"
                    value={skillMdImport}
                    onChange={(e) => setSkillMdImport(e.target.value)}
                    placeholder={"---\nname: Mon Skill\nslash: mon-skill\ndescription: Aide ciblée\n---\n\nInstructions…"}
                    className="w-full rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[#55554f]"
                  />
                  <button
                    type="button"
                    onClick={importSkillMd}
                    className="w-full rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12.5px] text-[#ecebe4] hover:bg-[#3a3a36]"
                  >
                    Importer SKILL.md
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "hooks" && (
            <div className="space-y-4">
              <div className="space-y-2">
                {hooks.length === 0 ? (
                  <p className="rounded-xl border border-[#2f2f2c] bg-[#181817] px-3 py-3 text-[13px] text-[#8c8b83]">
                    Aucun hook déterministe configuré. Ajoute une règle ci-dessous pour formater, linter ou vérifier automatiquement.
                  </p>
                ) : (
                  hooks.map((hook) => (
                    <div
                      key={hook.id}
                      className="flex items-center gap-3 rounded-xl border border-[#2f2f2c] bg-[#232321] px-3.5 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={hook.enabled}
                        aria-label={`Activer hook ${hook.event}`}
                        onChange={() => toggleHook(hook.id)}
                        className="h-3.5 w-3.5 accent-[#2563eb]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[#2f2f2c] px-1.5 py-0.5 font-mono text-[11px] text-[#e0b25f]">
                            {hook.event}
                          </span>
                          <span className="font-mono text-[12px] text-[#9a9992]">motif : {hook.matcher}</span>
                          <span className="rounded bg-[#2f2f2c] px-1.5 py-0.5 text-[11px] text-[#b3b2aa]">
                            {scopeLabel(hook.scope)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[12.5px] text-[#ecebe4]">{hook.command}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Supprimer hook ${hook.command}`}
                        onClick={() => removeHook(hook.id)}
                        className="rounded-lg p-1.5 text-[#8c8b83] hover:bg-[#2f2f2c] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3.5">
                <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-[#dcdbd3]">
                  <Terminal className="h-3.5 w-3.5 text-[#e0b25f]" />
                  <span>Nouveau hook</span>
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    aria-label="Événement du hook"
                    value={hookEvent}
                    onChange={(e) => setHookEvent(e.target.value as HookEvent)}
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                  >
                    <option value="PreToolUse">PreToolUse</option>
                    <option value="PostToolUse">PostToolUse</option>
                    <option value="Stop">Stop</option>
                  </select>
                  <input
                    type="text"
                    aria-label="Motif du hook"
                    value={hookMatcher}
                    onChange={(e) => setHookMatcher(e.target.value)}
                    placeholder="Motif (*, write|edit, /regex/)"
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                  />
                  <select
                    aria-label="Portée du hook"
                    value={hookScope}
                    onChange={(e) => setHookScope(e.target.value)}
                    className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                  >
                    <option value="global">Global</option>
                    {hasProject && <option value={projectPath}>Ce projet</option>}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    aria-label="Commande du hook"
                    value={hookCommand}
                    onChange={(e) => setHookCommand(e.target.value)}
                    placeholder="Commande shell (ex. npm run lint --silent)"
                    className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#55554f]"
                  />
                  <button
                    type="button"
                    onClick={addHook}
                    className="shrink-0 rounded-lg bg-[#1e40af] px-3.5 py-1.5 text-[12.5px] font-medium text-[#f8fafc] hover:bg-[#2563eb]"
                  >
                    Ajouter le hook
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-medium text-[#dcdbd3]">Journal d'exécution ({hookLogs.length})</h3>
                  {hookLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearHookLogs()}
                      className="text-[12px] text-[#8c8b83] hover:text-[#ecebe4]"
                    >
                      Effacer le journal
                    </button>
                  )}
                </div>
                {hookLogs.length === 0 ? (
                  <p className="text-[12px] text-[#7e7d76]">Aucune exécution enregistrée pour l'instant.</p>
                ) : (
                  <div className="max-h-[160px] space-y-1.5 overflow-y-auto">
                    {hookLogs.map((log) => (
                      <div key={log.id} className="rounded-lg bg-[#222220] px-2.5 py-1.5 text-[12px]">
                        <div className="flex items-center gap-2">
                          <span className={log.ok ? "text-emerald-400" : "text-red-400"}>{log.ok ? "OK" : "Échec"}</span>
                          <span className="font-mono text-[#e0b25f]">{log.event}</span>
                          <span className="truncate text-[#9a9992]">{log.target}</span>
                          <span className="ml-auto font-mono text-[11px] text-[#6f6e68]">
                            {new Date(log.at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="truncate font-mono text-[11.5px] text-[#dcdbd3]">$ {log.command}</p>
                        {log.output && <p className="mt-0.5 truncate font-mono text-[11px] text-[#8c8b83]">{log.output}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "plugins" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13.5px] font-medium text-[#dcdbd3]">Packs prêts à installer en 1 clic</h3>
                <select
                  aria-label="Portée d'installation du pack"
                  value={packScope}
                  onChange={(e) => setPackScope(e.target.value)}
                  className="rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1 text-[12.5px] outline-none focus:border-[#55554f]"
                >
                  <option value="global">Installer en global</option>
                  {hasProject && <option value={projectPath}>Installer dans ce projet</option>}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {BUILTIN_PLUGIN_PACKS.map((pack) => (
                  <div key={pack.id} className="flex flex-col justify-between rounded-xl border border-[#2f2f2c] bg-[#232321] p-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-[#60a5fa]" />
                        <span className="text-[13.5px] font-medium">{pack.name}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#9a9992]">{pack.description}</p>
                      <p className="mt-2 font-mono text-[11px] text-[#8c8b83]">
                        {pack.mcpServers.length} MCP · {pack.skills.length} skill · {pack.rules.length} règle · {pack.hooks.length} hook
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        void importPluginPack(pack, packScope, effectiveRuleRoot)
                          .then((stats) => {
                            setNotice(
                              `Pack « ${pack.name} » installé (${stats.mcpCount} MCP, ${stats.skillCount} skill, ${stats.ruleCount} règle, ${stats.hookCount} hook).`,
                            );
                          })
                          .catch((e) => setError(String(e)));
                      }}
                      className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12.5px] font-medium text-[#f8fafc] hover:bg-[#2563eb]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Installer en 1 clic</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#191918] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="Nom du pack exporté"
                    value={packExportName}
                    onChange={(e) => setPackExportName(e.target.value)}
                    placeholder="Nom du pack"
                    className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#222220] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#55554f]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const pack = exportPluginPack({
                        name: packExportName,
                        projectPath: hasProject ? projectPath : undefined,
                        ruleFiles,
                      });
                      setPackJson(JSON.stringify(pack, null, 2));
                      setNotice("Pack JSON généré.");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12.5px] text-[#ecebe4] hover:bg-[#3a3a36]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exporter en JSON</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  aria-label="JSON du pack à importer"
                  value={packJson}
                  onChange={(e) => setPackJson(e.target.value)}
                  placeholder='Colle un JSON au format "kana-plugin-pack" ou clique sur Exporter…'
                  className="w-full rounded-lg border border-[#343431] bg-[#222220] p-2.5 font-mono text-[12px] outline-none focus:border-[#55554f]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      void importPluginPack(packJson, packScope, effectiveRuleRoot)
                        .then((stats) => {
                          setNotice(
                            `Pack importé (${stats.mcpCount} MCP, ${stats.skillCount} skill, ${stats.ruleCount} règle, ${stats.hookCount} hook).`,
                          );
                        })
                        .catch((e) => setError(String(e)));
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2f6bd8] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#4079e0]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Importer le pack JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
