import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Blocks,
  Bug,
  Check,
  Database,
  FileCode2,
  FolderOpen,
  GitBranch,
  Globe,
  Layers,
  Plug,
  Plus,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  Webhook,
} from "lucide-react";
import {
  BUILTIN_PLUGIN_PACKS,
  BUILTIN_SKILLS,
  RULE_FILE_PATHS,
  importPluginPack,
  loadHooks,
  loadMcpServers,
  loadSkills,
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
  type KanaPluginPack,
  type McpTransport,
  type RuleFile,
  type RuleFilePath,
  type UserMcpServer,
} from "../lib/extensibility";
import { NO_PROJECT } from "../lib/projects";

type CustomizationsTab = "catalog" | "installed" | "mcp" | "skills" | "rules";

interface CatalogMcpEntry {
  id: string;
  name: string;
  serverName: string;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  icon: ReactNode;
}

const ICON_CLS = "h-4 w-4 text-[#cfcec6]";

const CATALOG_MCP_SERVERS: CatalogMcpEntry[] = [
  {
    id: "cat-github",
    name: "GitHub MCP",
    serverName: "github",
    description: "Issues, pull requests, dépôts et revue de code GitHub.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    icon: <GitBranch className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-postgres",
    name: "Postgres MCP",
    serverName: "postgres",
    description: "Inspection de schéma et requêtes SQL en lecture seule.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    icon: <Database className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-filesystem",
    name: "Filesystem MCP",
    serverName: "filesystem",
    description: "Lecture et navigation contrôlées dans des dossiers locaux.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    icon: <FolderOpen className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-playwright",
    name: "Playwright MCP",
    serverName: "playwright",
    description: "Automatisation navigateur, captures et vérification UI.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    icon: <Globe className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-sentry",
    name: "Sentry MCP",
    serverName: "sentry",
    description: "Analyse des erreurs, stacktraces et alertes de production.",
    transport: "http",
    url: "https://mcp.sentry.dev/mcp",
    icon: <Bug className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-linear",
    name: "Linear MCP",
    serverName: "linear",
    description: "Suivi des tickets, cycles et feuilles de route Linear.",
    transport: "sse",
    url: "https://mcp.linear.app/sse",
    icon: <Layers className={ICON_CLS} strokeWidth={1.7} />,
  },
  {
    id: "cat-fetch",
    name: "Fetch MCP",
    serverName: "fetch",
    description: "Récupération et conversion Markdown de pages web et docs.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    icon: <Plug className={ICON_CLS} strokeWidth={1.7} />,
  },
];

interface CustomizationsViewProps {
  projectPath?: string;
}

export default function CustomizationsView({ projectPath }: CustomizationsViewProps) {
  useExtensibilityVersion();
  const [tab, setTab] = useState<CustomizationsTab>("catalog");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const cleanProject = projectPath && projectPath !== NO_PROJECT ? projectPath : undefined;

  // Données réelles synchronisées via extensibility.ts (~/.kana/config.json)
  const mcpServers = loadMcpServers();
  const skills = loadSkills();
  const hooks = loadHooks();
  const installedCount = mcpServers.length + skills.length + hooks.length;

  // Formulaire MCP personnalisé
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState<McpTransport>("stdio");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  // Formulaire Skill personnalisé
  const [skillName, setSkillName] = useState("");
  const [skillSlash, setSkillSlash] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillContent, setSkillContent] = useState("");

  // Règles projet
  const [ruleFiles, setRuleFiles] = useState<RuleFile[]>([]);
  const [activeRulePath, setActiveRulePath] = useState<RuleFilePath>(".kana/rules.md");
  const [ruleDraft, setRuleDraft] = useState("");

  // Formulaire Hook
  const [hookEvent, setHookEvent] = useState<HookEvent>("PostToolUse");
  const [hookMatcher, setHookMatcher] = useState("*");
  const [hookCommand, setHookCommand] = useState("");

  useEffect(() => {
    let active = true;
    void readRuleFiles(cleanProject).then((files) => {
      if (!active) return;
      setRuleFiles(files);
      const current = files.find((f) => f.path === activeRulePath) ?? files[0];
      if (current) setRuleDraft(current.content);
    });
    return () => {
      active = false;
    };
  }, [cleanProject, activeRulePath]);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((cur) => (cur === msg ? "" : cur)), 3500);
  };

  const q = query.trim().toLowerCase();
  const matches = (...fields: Array<string | undefined>) =>
    !q || fields.some((f) => (f ?? "").toLowerCase().includes(q));

  const isMcpInstalled = (serverName: string) =>
    mcpServers.some((s) => s.name.toLowerCase() === serverName.toLowerCase());

  const isSkillInstalled = (slash: string) =>
    skills.some((s) => s.slash.toLowerCase() === slash.toLowerCase());

  const isPackInstalled = (pack: KanaPluginPack) => {
    const mcpsOk = pack.mcpServers.every((m) => isMcpInstalled(m.name));
    const skillsOk = pack.skills.every((s) => isSkillInstalled(s.slash));
    const hooksOk = pack.hooks.every((h) => hooks.some((existing) => existing.command === h.command && existing.event === h.event));
    return mcpsOk && skillsOk && hooksOk && (pack.mcpServers.length + pack.skills.length + pack.hooks.length > 0);
  };

  const installCatalogMcp = (entry: CatalogMcpEntry) => {
    if (isMcpInstalled(entry.serverName)) return;
    upsertMcpServer({
      name: entry.serverName,
      transport: entry.transport,
      command: entry.command,
      args: entry.args,
      url: entry.url,
      enabled: true,
      scope: "global",
    });
    flashNotice(`Connecteur « ${entry.name} » ajouté.`);
  };

  const installCatalogPack = async (pack: KanaPluginPack) => {
    await importPluginPack(pack, "global", cleanProject);
    flashNotice(`Pack « ${pack.name} » installé.`);
  };

  const installCatalogSkill = (skill: (typeof BUILTIN_SKILLS)[number]) => {
    if (isSkillInstalled(skill.slash)) return;
    upsertSkill({
      name: skill.name,
      slash: skill.slash,
      description: skill.description,
      content: skill.content,
      scope: "global",
      enabled: true,
    });
    flashNotice(`Skill /${skill.slash} ajouté.`);
  };

  const handleAddCustomMcp = (e: FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim()) return;
    upsertMcpServer({
      name: mcpName.trim(),
      transport: mcpTransport,
      command: mcpTransport === "stdio" ? mcpCommand.trim() || undefined : undefined,
      args:
        mcpTransport === "stdio" && mcpArgs.trim()
          ? mcpArgs.trim().split(/\s+/).filter(Boolean)
          : undefined,
      url: mcpTransport !== "stdio" ? mcpUrl.trim() || undefined : undefined,
      enabled: true,
      scope: "global",
    });
    flashNotice(`Serveur MCP « ${mcpName.trim()} » ajouté.`);
    setMcpName("");
    setMcpCommand("");
    setMcpArgs("");
    setMcpUrl("");
  };

  const handleAddSkill = (e: FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !skillContent.trim()) return;
    upsertSkill({
      name: skillName.trim(),
      slash: skillSlash.trim() || skillName.trim(),
      description: skillDesc.trim(),
      content: skillContent.trim(),
      scope: "global",
      enabled: true,
    });
    flashNotice(`Skill « ${skillName.trim()} » enregistré.`);
    setSkillName("");
    setSkillSlash("");
    setSkillDesc("");
    setSkillContent("");
  };

  const handleSaveRule = async () => {
    await writeRuleFile(activeRulePath, ruleDraft, cleanProject);
    const refreshed = await readRuleFiles(cleanProject);
    setRuleFiles(refreshed);
    flashNotice(`Règle ${activeRulePath} enregistrée.`);
  };

  const handleSyncAllRules = async () => {
    const synced = await syncRuleFiles(ruleDraft, [...RULE_FILE_PATHS], cleanProject);
    setRuleFiles(synced);
    flashNotice("Règles synchronisées vers CLAUDE.md, AGENTS.md, GEMINI.md et .kana/rules.md.");
  };

  const handleAddHook = (e: FormEvent) => {
    e.preventDefault();
    if (!hookCommand.trim()) return;
    upsertHook({
      event: hookEvent,
      matcher: hookMatcher.trim() || "*",
      command: hookCommand.trim(),
      enabled: true,
      scope: "global",
    });
    flashNotice(`Hook ${hookEvent} ajouté.`);
    setHookCommand("");
  };

  const filteredCatalogMcps = CATALOG_MCP_SERVERS.filter((m) =>
    matches(m.name, m.serverName, m.description),
  );
  const filteredPacks = BUILTIN_PLUGIN_PACKS.filter((p) =>
    matches(p.name, p.description, ...p.skills.map((s) => s.slash)),
  );
  const filteredCatalogSkills = BUILTIN_SKILLS.filter((s) =>
    matches(s.name, s.slash, s.description),
  );
  const filteredMcps = mcpServers.filter((s) =>
    matches(s.name, s.command, s.url, s.transport),
  );
  const filteredSkills = skills.filter((s) =>
    matches(s.name, s.slash, s.description, s.content),
  );
  const filteredHooks = hooks.filter((h) =>
    matches(h.event, h.matcher, h.command),
  );

  const tabs: Array<{ id: CustomizationsTab; label: string; count?: number }> = [
    { id: "catalog", label: "Catalogue" },
    { id: "installed", label: "Installés", count: installedCount },
    { id: "mcp", label: "MCP" },
    { id: "skills", label: "Skills" },
    { id: "rules", label: "Règles & Hooks" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-7 select-text">
      <div className="mx-auto max-w-[880px] space-y-5">
        {/* En-tête sobre : titre à gauche, onglets pilules à droite */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight text-[#ecebe4]">Personnalisation</h1>

          <div
            role="tablist"
            aria-label="Sections de personnalisation"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-1"
          >
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12.5px] transition ${
                    active
                      ? "bg-[#2b2b29] font-medium text-[#ecebe4]"
                      : "text-[#8c8b83] hover:text-[#ecebe4]"
                  }`}
                >
                  <span>{t.label}</span>
                  {t.count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                        active ? "bg-[#3a3a36] text-[#ecebe4]" : "bg-[#2b2b29] text-[#8c8b83]"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Barre de recherche pleine largeur */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c8b83]"
            strokeWidth={1.7}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un connecteur MCP, un skill, une règle"
            placeholder="Rechercher un connecteur MCP, un skill, une règle…"
            className="w-full rounded-xl border border-[#2f2f2c] bg-[#21211f] py-2 pl-10 pr-4 text-[13.5px] text-[#ecebe4] placeholder-[#8c8b83] outline-none transition focus:border-[#4b4b46]"
          />
        </div>

        {notice && (
          <div className="rounded-xl border border-[#2d4531] bg-[#203023] px-3.5 py-2 text-[12.5px] text-[#8ce09b]">
            {notice}
          </div>
        )}

        {/* Onglet Catalogue */}
        {tab === "catalog" && (
          <div className="space-y-6">
            {filteredCatalogMcps.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                  Connecteurs MCP
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredCatalogMcps.map((entry) => {
                    const installed = isMcpInstalled(entry.serverName);
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-3.5 transition hover:border-[#3e3e39]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2b2b29]">
                          {entry.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-medium text-[#ecebe4]">{entry.name}</div>
                          <p className="truncate text-[12px] text-[#8c8b83]">{entry.description}</p>
                        </div>
                        {installed ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#243828] px-2.5 py-1 text-[12px] text-[#8ce09b]">
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Installé
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => installCatalogMcp(entry)}
                            aria-label={`Ajouter ${entry.name}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#3a3a36] bg-[#2b2b29] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#363633]"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                            Ajouter
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredPacks.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                  Packs & Plug-ins
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredPacks.map((pack) => {
                    const installed = isPackInstalled(pack);
                    return (
                      <div
                        key={pack.id}
                        className="flex items-center gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-3.5 transition hover:border-[#3e3e39]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2b2b29]">
                          <Blocks className={ICON_CLS} strokeWidth={1.7} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-medium text-[#ecebe4]">{pack.name}</div>
                          <p className="truncate text-[12px] text-[#8c8b83]">{pack.description}</p>
                        </div>
                        {installed ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#243828] px-2.5 py-1 text-[12px] text-[#8ce09b]">
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Installé
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void installCatalogPack(pack)}
                            aria-label={`Ajouter ${pack.name}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#3a3a36] bg-[#2b2b29] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#363633]"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                            Ajouter
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredCatalogSkills.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                  Skills intégrés
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredCatalogSkills.map((skill) => {
                    const installed = isSkillInstalled(skill.slash);
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-3.5 transition hover:border-[#3e3e39]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2b2b29]">
                          <Sparkles className={ICON_CLS} strokeWidth={1.7} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium text-[#ecebe4]">{skill.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-[#8c8b83]">/{skill.slash}</span>
                          </div>
                          <p className="truncate text-[12px] text-[#8c8b83]">{skill.description}</p>
                        </div>
                        {installed ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#243828] px-2.5 py-1 text-[12px] text-[#8ce09b]">
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Installé
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => installCatalogSkill(skill)}
                            aria-label={`Ajouter ${skill.name}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#3a3a36] bg-[#2b2b29] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#363633]"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                            Ajouter
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {filteredCatalogMcps.length === 0 && filteredPacks.length === 0 && filteredCatalogSkills.length === 0 && (
              <p className="py-10 text-center text-[13px] text-[#8c8b83]">
                Aucun élément du catalogue ne correspond à « {query} ».
              </p>
            )}
          </div>
        )}

        {/* Onglet Installés */}
        {tab === "installed" && (
          <div className="space-y-5">
            {filteredMcps.length === 0 && filteredSkills.length === 0 && filteredHooks.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#8c8b83]">
                Aucun connecteur, skill ou hook installé pour ce filtre.
              </p>
            ) : (
              <>
                {filteredMcps.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                      Serveurs MCP ({filteredMcps.length})
                    </h2>
                    <div className="space-y-2">
                      {filteredMcps.map((srv) => (
                        <McpRow key={srv.id} server={srv} />
                      ))}
                    </div>
                  </section>
                )}

                {filteredSkills.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                      Skills ({filteredSkills.length})
                    </h2>
                    <div className="space-y-2">
                      {filteredSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] px-3.5 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13.5px] font-medium text-[#ecebe4]">{skill.name}</span>
                              <span className="font-mono text-[11.5px] text-[#8c8b83]">/{skill.slash}</span>
                            </div>
                            {skill.description && (
                              <p className="truncate text-[12px] text-[#8c8b83]">{skill.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleSkill(skill.id)}
                              className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                                skill.enabled
                                  ? "bg-[#243828] text-[#8ce09b]"
                                  : "bg-[#2b2b29] text-[#8c8b83] hover:text-[#ecebe4]"
                              }`}
                            >
                              {skill.enabled ? "Actif" : "Inactif"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Supprimer ${skill.name}`}
                              onClick={() => removeSkill(skill.id)}
                              className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {filteredHooks.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-[12.5px] font-medium uppercase tracking-wider text-[#8c8b83]">
                      Hooks ({filteredHooks.length})
                    </h2>
                    <div className="space-y-2">
                      {filteredHooks.map((hook) => (
                        <div
                          key={hook.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] px-3.5 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[13px]">
                              <span className="rounded bg-[#2b2b29] px-1.5 py-0.5 font-mono text-[11px] text-[#ecebe4]">
                                {hook.event}
                              </span>
                              <span className="font-mono text-[11.5px] text-[#8c8b83]">{hook.matcher}</span>
                            </div>
                            <p className="mt-0.5 truncate font-mono text-[12px] text-[#cfcec6]">{hook.command}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleHook(hook.id)}
                              className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                                hook.enabled
                                  ? "bg-[#243828] text-[#8ce09b]"
                                  : "bg-[#2b2b29] text-[#8c8b83] hover:text-[#ecebe4]"
                              }`}
                            >
                              {hook.enabled ? "Actif" : "Inactif"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Supprimer le hook ${hook.command}`}
                              onClick={() => removeHook(hook.id)}
                              className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* Onglet MCP */}
        {tab === "mcp" && (
          <div className="space-y-5">
            <form
              onSubmit={handleAddCustomMcp}
              className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4"
            >
              <div className="text-[13px] font-medium text-[#ecebe4]">Ajouter un serveur MCP</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  aria-label="Nom du serveur MCP"
                  placeholder="Nom (ex. mon-mcp)"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
                <select
                  value={mcpTransport}
                  onChange={(e) => setMcpTransport(e.target.value as McpTransport)}
                  aria-label="Transport MCP"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  <option value="stdio">stdio (commande locale)</option>
                  <option value="http">http (distant)</option>
                  <option value="sse">sse (distant)</option>
                </select>
              </div>
              {mcpTransport === "stdio" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    aria-label="Commande MCP"
                    placeholder="Commande (ex. npx)"
                    className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                  />
                  <input
                    type="text"
                    value={mcpArgs}
                    onChange={(e) => setMcpArgs(e.target.value)}
                    aria-label="Arguments MCP"
                    placeholder="Arguments (ex. -y @modelcontextprotocol/server-github)"
                    className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                  />
                </div>
              ) : (
                <input
                  type="url"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  aria-label="URL MCP"
                  placeholder="https://mcp.example.com/sse"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!mcpName.trim()}
                  className="rounded-lg bg-[#2b2b29] px-3.5 py-1.5 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#383835] disabled:opacity-40"
                >
                  Ajouter le connecteur
                </button>
              </div>
            </form>

            {filteredMcps.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#8c8b83]">
                Aucun serveur MCP configuré. Ajoutez-en un depuis le Catalogue ou le formulaire ci-dessus.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredMcps.map((srv) => (
                  <McpRow key={srv.id} server={srv} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Onglet Skills */}
        {tab === "skills" && (
          <div className="space-y-5">
            <form
              onSubmit={handleAddSkill}
              className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4"
            >
              <div className="text-[13px] font-medium text-[#ecebe4]">Nouveau skill (/commande)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  aria-label="Nom du skill"
                  placeholder="Nom du skill"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
                <input
                  type="text"
                  value={skillSlash}
                  onChange={(e) => setSkillSlash(e.target.value)}
                  aria-label="Commande slash"
                  placeholder="slash (ex. audit-sec)"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
              </div>
              <input
                type="text"
                value={skillDesc}
                onChange={(e) => setSkillDesc(e.target.value)}
                aria-label="Description du skill"
                placeholder="Description courte (1 ligne)"
                className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
              />
              <textarea
                rows={3}
                value={skillContent}
                onChange={(e) => setSkillContent(e.target.value)}
                aria-label="Instructions du skill"
                placeholder="Consigne envoyée à l'agent (utilisez $ARGUMENTS pour les paramètres)…"
                className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!skillName.trim() || !skillContent.trim()}
                  className="rounded-lg bg-[#2b2b29] px-3.5 py-1.5 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#383835] disabled:opacity-40"
                >
                  Enregistrer le skill
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-[#ecebe4]">{skill.name}</span>
                      <span className="font-mono text-[11.5px] text-[#8c8b83]">/{skill.slash}</span>
                    </div>
                    {skill.description && (
                      <p className="truncate text-[12px] text-[#8c8b83]">{skill.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                        skill.enabled
                          ? "bg-[#243828] text-[#8ce09b]"
                          : "bg-[#2b2b29] text-[#8c8b83] hover:text-[#ecebe4]"
                      }`}
                    >
                      {skill.enabled ? "Actif" : "Inactif"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Supprimer ${skill.name}`}
                      onClick={() => removeSkill(skill.id)}
                      className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onglet Règles & Hooks */}
        {tab === "rules" && (
          <div className="space-y-6">
            <section className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-[#ecebe4]">
                  <FileCode2 className="h-4 w-4 text-[#8c8b83]" strokeWidth={1.7} />
                  <span>Règles projet</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {RULE_FILE_PATHS.map((path) => {
                    const exists = ruleFiles.some((f) => f.path === path && f.exists);
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setActiveRulePath(path)}
                        className={`rounded-lg px-2.5 py-1 font-mono text-[11.5px] transition ${
                          activeRulePath === path
                            ? "bg-[#2b2b29] text-[#ecebe4]"
                            : "text-[#8c8b83] hover:bg-[#262624] hover:text-[#ecebe4]"
                        }`}
                      >
                        {path}
                        {exists ? " ·" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea
                rows={5}
                value={ruleDraft}
                onChange={(e) => setRuleDraft(e.target.value)}
                aria-label="Contenu des règles projet"
                placeholder="Instructions partagées avec tous les agents sur ce projet…"
                className="w-full rounded-lg border border-[#343430] bg-[#181817] p-3 font-mono text-[12.5px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncAllRules()}
                  className="rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[12px] text-[#cfcec6] transition hover:bg-[#2b2b29]"
                >
                  Synchroniser les 4 fichiers
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveRule()}
                  className="rounded-lg bg-[#2b2b29] px-3.5 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#383835]"
                >
                  Enregistrer {activeRulePath}
                </button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-[#ecebe4]">
                <Webhook className="h-4 w-4 text-[#8c8b83]" strokeWidth={1.7} />
                <span>Hooks déterministes</span>
              </div>

              <form onSubmit={handleAddHook} className="grid gap-2.5 sm:grid-cols-[140px_120px_1fr_auto]">
                <select
                  value={hookEvent}
                  onChange={(e) => setHookEvent(e.target.value as HookEvent)}
                  aria-label="Événement du hook"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  <option value="PreToolUse">PreToolUse</option>
                  <option value="PostToolUse">PostToolUse</option>
                  <option value="Stop">Stop</option>
                </select>
                <input
                  type="text"
                  value={hookMatcher}
                  onChange={(e) => setHookMatcher(e.target.value)}
                  aria-label="Motif du hook"
                  placeholder="* ou write|edit"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-2.5 py-1.5 font-mono text-[12.5px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
                <input
                  type="text"
                  value={hookCommand}
                  onChange={(e) => setHookCommand(e.target.value)}
                  aria-label="Commande du hook"
                  placeholder="Commande shell (ex. git diff --stat)"
                  className="rounded-lg border border-[#343430] bg-[#181817] px-2.5 py-1.5 font-mono text-[12.5px] text-[#ecebe4] placeholder-[#8c8b83] outline-none focus:border-[#55554f]"
                />
                <button
                  type="submit"
                  disabled={!hookCommand.trim()}
                  className="rounded-lg bg-[#2b2b29] px-3 py-1.5 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#383835] disabled:opacity-40"
                >
                  Ajouter
                </button>
              </form>

              {filteredHooks.length === 0 ? (
                <p className="py-2 text-[12.5px] text-[#8c8b83]">Aucun hook configuré.</p>
              ) : (
                <div className="space-y-2">
                  {filteredHooks.map((hook) => (
                    <div
                      key={hook.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#2f2f2c] bg-[#181817] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#2b2b29] px-1.5 py-0.5 font-mono text-[11px] text-[#ecebe4]">
                            {hook.event}
                          </span>
                          <span className="font-mono text-[11.5px] text-[#8c8b83]">{hook.matcher}</span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[12px] text-[#cfcec6]">{hook.command}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleHook(hook.id)}
                          className={`rounded-lg px-2.5 py-1 text-[11.5px] transition ${
                            hook.enabled
                              ? "bg-[#243828] text-[#8ce09b]"
                              : "bg-[#2b2b29] text-[#8c8b83] hover:text-[#ecebe4]"
                          }`}
                        >
                          {hook.enabled ? "Actif" : "Inactif"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Supprimer le hook ${hook.command}`}
                          onClick={() => removeHook(hook.id)}
                          className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function McpRow({ server }: { server: UserMcpServer }) {
  const detail =
    server.transport === "stdio"
      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")
      : server.url ?? "";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] px-3.5 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2b2b29]">
          <Terminal className="h-4 w-4 text-[#cfcec6]" strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-[#ecebe4]">{server.name}</span>
            <span className="rounded bg-[#2b2b29] px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-[#8c8b83]">
              {server.transport}
            </span>
          </div>
          {detail && <p className="truncate font-mono text-[11.5px] text-[#8c8b83]">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggleMcpServer(server.id)}
          className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
            server.enabled
              ? "bg-[#243828] text-[#8ce09b]"
              : "bg-[#2b2b29] text-[#8c8b83] hover:text-[#ecebe4]"
          }`}
        >
          {server.enabled ? "Actif" : "Inactif"}
        </button>
        <button
          type="button"
          aria-label={`Supprimer ${server.name}`}
          onClick={() => removeMcpServer(server.id)}
          className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
