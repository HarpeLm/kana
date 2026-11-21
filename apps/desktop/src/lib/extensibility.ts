import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AvailableCommand, UserMcpServerParam } from "./acp";
import { inTauri } from "./env";
import { NO_PROJECT } from "./projects";

export type McpTransport = "stdio" | "http" | "sse";

export interface UserMcpServer {
  id: string;
  name: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  oauthToken?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  scope: "global" | string;
}

export const RULE_FILE_PATHS = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".kana/rules.md"] as const;
export type RuleFilePath = (typeof RULE_FILE_PATHS)[number];

export interface RuleFile {
  path: string;
  exists: boolean;
  content: string;
}

export interface SkillItem {
  id: string;
  name: string;
  slash: string;
  description: string;
  content: string;
  scope: "global" | string;
  enabled: boolean;
}

export type HookEvent = "PreToolUse" | "PostToolUse" | "Stop";

export interface HookRule {
  id: string;
  event: HookEvent;
  matcher: string;
  command: string;
  enabled: boolean;
  scope: "global" | string;
}

export interface HookRunLog {
  id: string;
  hookId: string;
  event: HookEvent;
  target: string;
  command: string;
  ok: boolean;
  output: string;
  at: number;
}

export interface KanaPluginPack {
  format: "kana-plugin-pack";
  version: 1;
  id: string;
  name: string;
  description: string;
  author?: string;
  mcpServers: Array<Omit<UserMcpServer, "id" | "scope">>;
  skills: Array<Omit<SkillItem, "id" | "scope">>;
  rules: Array<{ path: RuleFilePath; content: string }>;
  hooks: Array<Omit<HookRule, "id" | "scope">>;
}

const MCP_KEY = "kana-mcp-servers";
const RULES_KEY = "kana-rule-files";
const SKILLS_KEY = "kana-skills";
const HOOKS_KEY = "kana-hooks";
const HOOK_LOGS_KEY = "kana-hook-logs";
const MAX_HOOK_LOGS = 60;

const memoryFallback = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((cb) => cb());
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string | null {
  if (!hasBrowserStorage()) return memoryFallback.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!hasBrowserStorage()) {
    memoryFallback.set(key, value);
  } else {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
  }
  notify();
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useExtensibilityVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

export function normalizeScope(scope?: string): "global" | string {
  const clean = scope?.trim().replace(/\/+$/, "");
  if (!clean || clean === "global" || clean === NO_PROJECT) return "global";
  return clean;
}

export function matchesScope(scope: string, projectPath?: string): boolean {
  const norm = normalizeScope(scope);
  if (norm === "global") return true;
  const target = normalizeScope(projectPath);
  return target !== "global" && norm === target;
}

// ---------------------------------------------------------------------------
// 1. Serveurs MCP utilisateur
// ---------------------------------------------------------------------------

export function loadMcpServers(): UserMcpServer[] {
  const parsed = readJson<unknown>(MCP_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is UserMcpServer => !!item && typeof item === "object" && typeof (item as UserMcpServer).name === "string");
}

export function saveMcpServers(items: UserMcpServer[]): void {
  writeRaw(MCP_KEY, JSON.stringify(items));
}

export function upsertMcpServer(draft: Omit<UserMcpServer, "id"> & { id?: string }): UserMcpServer[] {
  const items = loadMcpServers();
  const entry: UserMcpServer = {
    ...draft,
    id: draft.id?.trim() || nextId("mcp"),
    name: draft.name.trim(),
    scope: normalizeScope(draft.scope),
    url: draft.url?.trim() || undefined,
    command: draft.command?.trim() || undefined,
    args: draft.args?.filter((a) => a.length > 0),
    oauthToken: draft.oauthToken?.trim() || undefined,
  };
  const idx = items.findIndex((s) => s.id === entry.id);
  const next = idx >= 0 ? items.map((s, i) => (i === idx ? entry : s)) : [...items, entry];
  saveMcpServers(next);
  return next;
}

export function removeMcpServer(id: string): UserMcpServer[] {
  const next = loadMcpServers().filter((s) => s.id !== id);
  saveMcpServers(next);
  return next;
}

export function toggleMcpServer(id: string, enabled?: boolean): UserMcpServer[] {
  const next = loadMcpServers().map((s) =>
    s.id === id ? { ...s, enabled: enabled ?? !s.enabled } : s,
  );
  saveMcpServers(next);
  return next;
}

export function activeMcpServersFor(projectPath?: string): UserMcpServer[] {
  return loadMcpServers().filter((s) => s.enabled && matchesScope(s.scope, projectPath));
}

export function toMcpServerParams(servers: UserMcpServer[]): UserMcpServerParam[] {
  return servers.map((s) => ({
    name: s.name,
    transport: s.transport,
    url: s.url,
    command: s.command,
    args: s.args,
    env: s.env,
    oauthToken: s.oauthToken,
    headers: s.headers,
  }));
}

// ---------------------------------------------------------------------------
// 2. Fichiers de règles projet (CLAUDE.md, AGENTS.md, GEMINI.md, .kana/rules.md)
// ---------------------------------------------------------------------------

function readLocalRuleMap(): Record<string, Record<string, string>> {
  const parsed = readJson<unknown>(RULES_KEY, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, Record<string, string>>;
}

function readLocalRules(projectPath?: string): RuleFile[] {
  const scope = normalizeScope(projectPath);
  const map = readLocalRuleMap();
  const bucket = map[scope] ?? map.global ?? {};
  return RULE_FILE_PATHS.map((path) => {
    const content = typeof bucket[path] === "string" ? bucket[path] : "";
    return { path, exists: typeof bucket[path] === "string" && content.length > 0, content };
  });
}

function writeLocalRule(path: RuleFilePath, content: string, projectPath?: string): RuleFile {
  const scope = normalizeScope(projectPath);
  const map = readLocalRuleMap();
  const bucket = { ...(map[scope] ?? {}), [path]: content };
  writeRaw(RULES_KEY, JSON.stringify({ ...map, [scope]: bucket }));
  return { path, exists: true, content };
}

export function isRuleFilePath(path: string): path is RuleFilePath {
  return (RULE_FILE_PATHS as readonly string[]).includes(path);
}

export async function readRuleFiles(projectPath?: string): Promise<RuleFile[]> {
  const cleanPath = projectPath && projectPath !== NO_PROJECT ? projectPath : undefined;
  if (inTauri && cleanPath) {
    try {
      return await invoke<RuleFile[]>("git_read_rule_files", { path: cleanPath });
    } catch {
      return readLocalRules(cleanPath);
    }
  }
  return readLocalRules(cleanPath);
}

export async function writeRuleFile(path: string, content: string, projectPath?: string): Promise<RuleFile> {
  if (!isRuleFilePath(path)) throw new Error(`Chemin de règle non autorisé : ${path}`);
  const cleanPath = projectPath && projectPath !== NO_PROJECT ? projectPath : undefined;
  if (inTauri && cleanPath) {
    try {
      const written = await invoke<RuleFile>("git_write_rule_file", { path: cleanPath, file: path, content });
      writeLocalRule(path, content, cleanPath);
      return written;
    } catch {
      return writeLocalRule(path, content, cleanPath);
    }
  }
  return writeLocalRule(path, content, cleanPath);
}

export async function syncRuleFiles(content: string, targets: string[], projectPath?: string): Promise<RuleFile[]> {
  const validTargets = (targets.length > 0 ? targets : [...RULE_FILE_PATHS]).filter(isRuleFilePath);
  if (validTargets.length === 0) throw new Error("Aucune cible de règle valide sélectionnée.");
  const cleanPath = projectPath && projectPath !== NO_PROJECT ? projectPath : undefined;
  if (inTauri && cleanPath) {
    try {
      const synced = await invoke<RuleFile[]>("git_sync_rule_files", {
        path: cleanPath,
        content,
        targets: validTargets,
      });
      for (const file of synced) {
        if (isRuleFilePath(file.path)) writeLocalRule(file.path, file.content, cleanPath);
      }
      return synced;
    } catch {
      return validTargets.map((target) => writeLocalRule(target, content, cleanPath));
    }
  }
  return validTargets.map((target) => writeLocalRule(target, content, cleanPath));
}

const MAX_RULES_PREFACE_CHARS = 3000;

export function buildRulesPreface(files: RuleFile[]): string {
  const active = files.filter((f) => f.exists && f.content.trim().length > 0);
  if (active.length === 0) return "";
  // Regroupe les fichiers synchronisés au contenu identique pour éviter de répéter les consignes.
  const groups = new Map<string, string[]>();
  for (const file of active) {
    const body = file.content.trim();
    const list = groups.get(body) ?? [];
    list.push(file.path);
    groups.set(body, list);
  }
  const sections: string[] = [];
  for (const [body, paths] of groups.entries()) {
    sections.push(`### ${paths.join(", ")}\n${body}`);
  }
  let joined = sections.join("\n\n");
  if (joined.length > MAX_RULES_PREFACE_CHARS) {
    joined = `${joined.slice(0, MAX_RULES_PREFACE_CHARS)}\n…`;
  }
  return `Règles du projet actives :\n${joined}\n\n`;
}

export async function loadActiveRulesPreface(projectPath?: string): Promise<string> {
  try {
    const files = await readRuleFiles(projectPath);
    return buildRulesPreface(files);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// 3. Bibliothèque de Skills (SKILL.md, slash commands)
// ---------------------------------------------------------------------------

export const BUILTIN_SKILLS: SkillItem[] = [
  {
    id: "builtin-review-clean",
    name: "Revue de code & propreté",
    slash: "review-clean",
    description: "Relire les changements récents : bugs, régressions, duplication et tests",
    content:
      "Relis attentivement les modifications récentes du dépôt : repère les bugs potentiels, cas limites, régressions, duplications ou tests manquants, puis propose ou applique des corrections propres.",
    scope: "global",
    enabled: true,
  },
  {
    id: "builtin-test-fix",
    name: "Diagnostic et correction des tests",
    slash: "test-fix",
    description: "Lancer les tests, diagnostiquer les échecs et corriger la cause racine",
    content:
      "Exécute la suite de tests pertinente, analyse précisément les échecs éventuels jusqu'à leur cause racine et applique un correctif minimal vérifié par une nouvelle exécution des tests.",
    scope: "global",
    enabled: true,
  },
];

export function normalizeSlash(raw: string): string {
  return raw
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadSkills(): SkillItem[] {
  const raw = readRaw(SKILLS_KEY);
  if (raw === null) return BUILTIN_SKILLS.map((s) => ({ ...s }));
  const parsed = readJson<unknown>(SKILLS_KEY, []);
  if (!Array.isArray(parsed)) return BUILTIN_SKILLS.map((s) => ({ ...s }));
  return parsed.filter((item): item is SkillItem => !!item && typeof item === "object" && typeof (item as SkillItem).slash === "string");
}

export function saveSkills(items: SkillItem[]): void {
  writeRaw(SKILLS_KEY, JSON.stringify(items));
}

export function upsertSkill(draft: Omit<SkillItem, "id"> & { id?: string }): SkillItem[] {
  const items = loadSkills();
  const slash = normalizeSlash(draft.slash || draft.name) || "skill";
  const entry: SkillItem = {
    ...draft,
    id: draft.id?.trim() || nextId("skill"),
    name: draft.name.trim() || slash,
    slash,
    description: draft.description.trim(),
    content: draft.content.trim(),
    scope: normalizeScope(draft.scope),
  };
  const idx = items.findIndex((s) => s.id === entry.id);
  const next = idx >= 0 ? items.map((s, i) => (i === idx ? entry : s)) : [...items, entry];
  saveSkills(next);
  return next;
}

export function removeSkill(id: string): SkillItem[] {
  const next = loadSkills().filter((s) => s.id !== id);
  saveSkills(next);
  return next;
}

export function toggleSkill(id: string, enabled?: boolean): SkillItem[] {
  const next = loadSkills().map((s) =>
    s.id === id ? { ...s, enabled: enabled ?? !s.enabled } : s,
  );
  saveSkills(next);
  return next;
}

function unquoteYaml(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSkillMarkdown(raw: string, scope: "global" | string = "global"): Omit<SkillItem, "id"> {
  const text = raw.replace(/\r\n/g, "\n").trim();
  let name = "";
  let slash = "";
  let description = "";
  let body = text;

  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const frontmatter = fm[1];
    body = fm[2].trim();
    for (const line of frontmatter.split("\n")) {
      const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = unquoteYaml(m[2]);
      if (key === "name") name = val;
      else if (key === "slash" || key === "command") slash = val;
      else if (key === "description") description = val;
    }
  }

  if (!name) {
    const heading = body.match(/^#\s+(.+)$/m);
    name = heading ? heading[1].trim() : "Skill personnalisé";
  }
  const cleanSlash = normalizeSlash(slash || name) || "skill";
  if (!description) {
    const firstLine = body
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find(Boolean);
    description = (firstLine ?? name).slice(0, 120);
  }
  return {
    name,
    slash: cleanSlash,
    description,
    content: body || description,
    scope: normalizeScope(scope),
    enabled: true,
  };
}

export function exportSkillMarkdown(skill: Pick<SkillItem, "name" | "slash" | "description" | "content">): string {
  const safeDesc = skill.description.replace(/"/g, '\\"');
  const safeName = skill.name.replace(/"/g, '\\"');
  return `---\nname: "${safeName}"\nslash: ${normalizeSlash(skill.slash)}\ndescription: "${safeDesc}"\n---\n\n${skill.content.trim()}\n`;
}

export function activeSkillsFor(projectPath?: string): SkillItem[] {
  return loadSkills().filter((s) => s.enabled && matchesScope(s.scope, projectPath));
}

export function skillsAsCommands(projectPath?: string): AvailableCommand[] {
  return activeSkillsFor(projectPath).map((skill) => ({
    name: skill.slash,
    description: skill.description || skill.name,
    hint: "skill",
  }));
}

export function expandSkillCommand(text: string, projectPath?: string): string {
  const match = text.trim().match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return text;
  const cmd = match[1].toLowerCase();
  const extra = (match[2] ?? "").trim();
  const skill = activeSkillsFor(projectPath).find((s) => s.slash.toLowerCase() === cmd);
  if (!skill) return text;

  const base = skill.content.trim();
  if (base.includes("$ARGUMENTS")) {
    return base.replace(/\$ARGUMENTS/g, extra).trim();
  }
  return extra ? `${base}\n\nPrécisions :\n${extra}` : base;
}

// ---------------------------------------------------------------------------
// 4. Moteur de Hooks déterministes (PreToolUse, PostToolUse, Stop)
// ---------------------------------------------------------------------------

export function loadHooks(): HookRule[] {
  const parsed = readJson<unknown>(HOOKS_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is HookRule => !!item && typeof item === "object" && typeof (item as HookRule).command === "string");
}

export function saveHooks(items: HookRule[]): void {
  writeRaw(HOOKS_KEY, JSON.stringify(items));
}

export function upsertHook(draft: Omit<HookRule, "id"> & { id?: string }): HookRule[] {
  const items = loadHooks();
  const entry: HookRule = {
    ...draft,
    id: draft.id?.trim() || nextId("hook"),
    matcher: draft.matcher.trim() || "*",
    command: draft.command.trim(),
    scope: normalizeScope(draft.scope),
  };
  const idx = items.findIndex((h) => h.id === entry.id);
  const next = idx >= 0 ? items.map((h, i) => (i === idx ? entry : h)) : [...items, entry];
  saveHooks(next);
  return next;
}

export function removeHook(id: string): HookRule[] {
  const next = loadHooks().filter((h) => h.id !== id);
  saveHooks(next);
  return next;
}

export function toggleHook(id: string, enabled?: boolean): HookRule[] {
  const next = loadHooks().map((h) =>
    h.id === id ? { ...h, enabled: enabled ?? !h.enabled } : h,
  );
  saveHooks(next);
  return next;
}

export function loadHookLogs(): HookRunLog[] {
  const parsed = readJson<unknown>(HOOK_LOGS_KEY, []);
  return Array.isArray(parsed) ? (parsed as HookRunLog[]) : [];
}

export function clearHookLogs(): void {
  writeRaw(HOOK_LOGS_KEY, "[]");
}

function appendHookLog(entry: HookRunLog): void {
  const next = [entry, ...loadHookLogs()].slice(0, MAX_HOOK_LOGS);
  writeRaw(HOOK_LOGS_KEY, JSON.stringify(next));
}

function matchesHookPattern(matcher: string, target: string): boolean {
  const pattern = matcher.trim();
  if (!pattern || pattern === "*") return true;
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const last = pattern.lastIndexOf("/");
    const body = pattern.slice(1, last);
    const flags = pattern.slice(last + 1) || "i";
    try {
      return new RegExp(body, flags).test(target);
    } catch {
      return target.toLowerCase().includes(pattern.toLowerCase());
    }
  }
  if (/[|^$()[\].*+?\\]/.test(pattern)) {
    try {
      return new RegExp(pattern, "i").test(target);
    } catch {
      return target.toLowerCase().includes(pattern.toLowerCase());
    }
  }
  return target.toLowerCase().includes(pattern.toLowerCase());
}

export function matchingHooks(event: HookEvent, target: string, projectPath?: string): HookRule[] {
  return loadHooks().filter(
    (hook) =>
      hook.enabled &&
      hook.event === event &&
      hook.command.trim().length > 0 &&
      matchesScope(hook.scope, projectPath) &&
      matchesHookPattern(hook.matcher, target),
  );
}

export async function executeHookCommand(
  cwd: string | undefined,
  hook: HookRule,
  target: string,
): Promise<HookRunLog> {
  let ok = true;
  let output = "";
  if (inTauri) {
    try {
      output = await invoke<string>("run_hook_command", {
        cwd: cwd && cwd !== NO_PROJECT ? cwd : null,
        command: hook.command,
      });
    } catch (error) {
      ok = false;
      output = String(error);
    }
  } else {
    output = `[simulé] ${hook.command}`;
  }
  const log: HookRunLog = {
    id: nextId("log"),
    hookId: hook.id,
    event: hook.event,
    target,
    command: hook.command,
    ok,
    output,
    at: Date.now(),
  };
  appendHookLog(log);
  return log;
}

export async function runMatchingHooks(
  event: HookEvent,
  target: string,
  cwd?: string,
  projectPath?: string,
): Promise<HookRunLog[]> {
  const hooks = matchingHooks(event, target, projectPath ?? cwd);
  const logs: HookRunLog[] = [];
  for (const hook of hooks) {
    logs.push(await executeHookCommand(cwd ?? projectPath, hook, target));
  }
  return logs;
}

// ---------------------------------------------------------------------------
// 5. Plugins & Packs partageables
// ---------------------------------------------------------------------------

export const BUILTIN_PLUGIN_PACKS: KanaPluginPack[] = [
  {
    format: "kana-plugin-pack",
    version: 1,
    id: "pack-qa-guardrails",
    name: "Qualité & Garde-fous Rust/TS",
    description: "Ajoute le skill /qa-check, un hook PostToolUse de vérification et des règles .kana/rules.md.",
    author: "Kana",
    mcpServers: [],
    skills: [
      {
        name: "Contrôle Qualité Complet",
        slash: "qa-check",
        description: "Vérifier types, lint, tests unitaires et absence de régression",
        content:
          "Vérifie les types, exécute les tests unitaires pertinents, contrôle les cas limites et résume tout risque résiduel.",
        enabled: true,
      },
    ],
    rules: [
      {
        path: ".kana/rules.md",
        content:
          "# Conventions du projet\n- Toujours exécuter les tests pertinents après modification.\n- Préserver les contrats publics existants et documenter les cas limites.\n",
      },
    ],
    hooks: [
      {
        event: "PostToolUse",
        matcher: "write|edit",
        command: "git diff --stat",
        enabled: true,
      },
    ],
  },
  {
    format: "kana-plugin-pack",
    version: 1,
    id: "pack-docs-context7",
    name: "Documentation & Context7 MCP",
    description: "Connecte le serveur MCP Context7 (stdio), le skill /doc-sync, un hook Stop et AGENTS.md.",
    author: "Kana",
    mcpServers: [
      {
        name: "context7",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        enabled: true,
      },
    ],
    skills: [
      {
        name: "Synchroniser la documentation",
        slash: "doc-sync",
        description: "Mettre à jour docstrings et README d'après le diff courant",
        content:
          "Inspecte les changements récents et mets à jour les docstrings, commentaires utiles et README sans toucher au comportement.",
        enabled: true,
      },
    ],
    rules: [
      {
        path: "AGENTS.md",
        content:
          "# Guide Agent\n- Privilégier des modifications minimales et lisibles.\n- Vérifier la documentation officielle via Context7 en cas de doute d'API.\n",
      },
    ],
    hooks: [
      {
        event: "Stop",
        matcher: "*",
        command: "git status -s",
        enabled: true,
      },
    ],
  },
];

export function exportPluginPack(options: {
  name: string;
  description?: string;
  author?: string;
  projectPath?: string;
  ruleFiles?: RuleFile[];
}): KanaPluginPack {
  const scope = options.projectPath;
  const mcpServers = loadMcpServers()
    .filter((s) => matchesScope(s.scope, scope))
    .map(({ id: _id, scope: _scope, ...rest }) => rest);
  const skills = loadSkills()
    .filter((s) => matchesScope(s.scope, scope))
    .map(({ id: _id, scope: _scope, ...rest }) => rest);
  const hooks = loadHooks()
    .filter((h) => matchesScope(h.scope, scope))
    .map(({ id: _id, scope: _scope, ...rest }) => rest);
  const rules = (options.ruleFiles ?? readLocalRules(scope))
    .filter((r) => r.exists && r.content.trim().length > 0 && isRuleFilePath(r.path))
    .map((r) => ({ path: r.path as RuleFilePath, content: r.content }));

  return {
    format: "kana-plugin-pack",
    version: 1,
    id: normalizeSlash(options.name) || nextId("pack"),
    name: options.name.trim() || "Pack Kana",
    description: options.description?.trim() || "Pack de configuration Kana exporté",
    ...(options.author?.trim() ? { author: options.author.trim() } : {}),
    mcpServers,
    skills,
    rules,
    hooks,
  };
}

export async function importPluginPack(
  rawOrPack: string | KanaPluginPack,
  scope: "global" | string = "global",
  projectPath?: string,
): Promise<{ mcpCount: number; skillCount: number; ruleCount: number; hookCount: number }> {
  let pack: unknown = rawOrPack;
  if (typeof rawOrPack === "string") {
    try {
      pack = JSON.parse(rawOrPack);
    } catch {
      throw new Error("JSON du pack invalide.");
    }
  }
  if (!pack || typeof pack !== "object") {
    throw new Error("Format de pack invalide.");
  }
  const candidate = pack as Partial<KanaPluginPack>;
  if (candidate.format && candidate.format !== "kana-plugin-pack") {
    throw new Error(`Format non reconnu : ${String(candidate.format)}`);
  }

  const targetScope = normalizeScope(scope);
  const targetProject = projectPath ?? (targetScope !== "global" ? targetScope : undefined);
  let mcpCount = 0;
  let skillCount = 0;
  let ruleCount = 0;
  let hookCount = 0;

  if (Array.isArray(candidate.mcpServers)) {
    const current = loadMcpServers();
    for (const srv of candidate.mcpServers) {
      if (!srv?.name) continue;
      const existing = current.find(
        (c) => c.name.toLowerCase() === srv.name.toLowerCase() && normalizeScope(c.scope) === targetScope,
      );
      upsertMcpServer({
        id: existing?.id,
        name: srv.name,
        transport: srv.transport ?? "http",
        url: srv.url,
        command: srv.command,
        args: srv.args,
        env: srv.env,
        oauthToken: srv.oauthToken,
        headers: srv.headers,
        enabled: srv.enabled ?? true,
        scope: targetScope,
      });
      mcpCount += 1;
    }
  }

  if (Array.isArray(candidate.skills)) {
    const current = loadSkills();
    for (const skill of candidate.skills) {
      if (!skill?.slash && !skill?.name) continue;
      const slash = normalizeSlash(skill.slash || skill.name);
      const existing = current.find(
        (c) => c.slash.toLowerCase() === slash && normalizeScope(c.scope) === targetScope,
      );
      upsertSkill({
        id: existing?.id,
        name: skill.name || slash,
        slash,
        description: skill.description ?? "",
        content: skill.content ?? "",
        enabled: skill.enabled ?? true,
        scope: targetScope,
      });
      skillCount += 1;
    }
  }

  if (Array.isArray(candidate.hooks)) {
    const current = loadHooks();
    for (const hook of candidate.hooks) {
      if (!hook?.command || !hook?.event) continue;
      const existing = current.find(
        (c) =>
          c.event === hook.event &&
          c.matcher === (hook.matcher || "*") &&
          c.command === hook.command &&
          normalizeScope(c.scope) === targetScope,
      );
      upsertHook({
        id: existing?.id,
        event: hook.event,
        matcher: hook.matcher || "*",
        command: hook.command,
        enabled: hook.enabled ?? true,
        scope: targetScope,
      });
      hookCount += 1;
    }
  }

  if (Array.isArray(candidate.rules)) {
    for (const rule of candidate.rules) {
      if (!rule?.path || typeof rule.content !== "string" || !isRuleFilePath(rule.path)) continue;
      await writeRuleFile(rule.path, rule.content, targetProject);
      ruleCount += 1;
    }
  }

  return { mcpCount, skillCount, ruleCount, hookCount };
}
