import { useSyncExternalStore } from "react";
import type { PermissionRequest } from "./chatState";
import { getLocale, type Locale } from "./i18n";
import { persistSharedSetting } from "./store";

/** Comment les demandes d'autorisation des agents sont traitées. */
export type PermissionMode = "ask" | "plan" | "auto" | "full";
export type PermissionPolicy = "allow" | "ask" | "deny";
export type PermissionRuleScope = "tool" | "command" | "path" | "any";

export interface PermissionRule {
  id: string;
  scope: PermissionRuleScope;
  pattern: string;
  policy: PermissionPolicy;
  enabled: boolean;
}

export interface PermissionAuditEntry {
  id: string;
  title: string;
  decision: PermissionPolicy;
  mode: PermissionMode;
  ruleId?: string;
  source: "rule" | "default_rule" | "mode" | "user";
  at: number;
}

export interface PermissionEvaluation {
  policy: PermissionPolicy;
  ruleId?: string;
  source: "rule" | "default_rule" | "mode";
  reason: string;
}

export const REDACTED_SECRET = "[SECRET MASQUÉ]";

const MODES_FR: { id: PermissionMode; label: string; description: string }[] = [
  {
    id: "ask",
    label: "Demander l'approbation",
    description: "Toujours demander avant de modifier les fichiers ou d'utiliser Internet",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Créer un plan avant d'apporter des modifications",
  },
  {
    id: "auto",
    label: "Approuver à ma place",
    description: "Demander l'autorisation uniquement pour les actions détectées comme potentiellement dangereuses",
  },
  {
    id: "full",
    label: "Accès complet",
    description: "Accès non restreint à Internet et aux fichiers de votre ordinateur",
  },
];

const MODES_EN: { id: PermissionMode; label: string; description: string }[] = [
  {
    id: "ask",
    label: "Ask for approval",
    description: "Always ask before modifying files or accessing the internet",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Create a plan before making changes",
  },
  {
    id: "auto",
    label: "Auto-approve safe",
    description: "Only ask permission for actions detected as potentially dangerous",
  },
  {
    id: "full",
    label: "Full access",
    description: "Unrestricted access to the internet and your computer files",
  },
];

export const MODES = MODES_FR;

export function getModes(locale: Locale = getLocale()): { id: PermissionMode; label: string; description: string }[] {
  return locale === "en" ? MODES_EN : MODES_FR;
}

const KEY = "kana-permission-mode";
const RULES_KEY = "kana-permission-rules";
const AUDIT_KEY = "kana-permission-audit";
const MAX_AUDIT_ENTRIES = 200;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

const ruleListeners = new Set<() => void>();
const auditListeners = new Set<() => void>();

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (!hasStorage()) return;
  persistSharedSetting(key, JSON.stringify(value));
}

function parseRules(raw: unknown): PermissionRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PermissionRule =>
      !!item &&
      typeof item === "object" &&
      typeof (item as PermissionRule).id === "string" &&
      typeof (item as PermissionRule).pattern === "string" &&
      ["tool", "command", "path", "any"].includes((item as PermissionRule).scope) &&
      ["allow", "ask", "deny"].includes((item as PermissionRule).policy),
  );
}

let cachedRules: PermissionRule[] = parseRules(readJsonStorage<unknown>(RULES_KEY, []));
let cachedAudit: PermissionAuditEntry[] = (() => {
  const parsed = readJsonStorage<unknown>(AUDIT_KEY, []);
  return Array.isArray(parsed) ? (parsed as PermissionAuditEntry[]).slice(0, MAX_AUDIT_ENTRIES) : [];
})();

export function loadMode(): PermissionMode {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.some((m) => m.id === stored) ? (stored as PermissionMode) : "ask";
  } catch {
    return "ask";
  }
}

export function saveMode(mode: PermissionMode): void {
  persistSharedSetting(KEY, mode);
}

export function loadPermissionRules(): PermissionRule[] {
  if (hasStorage()) {
    const raw = readJsonStorage<unknown>(RULES_KEY, []);
    const parsed = parseRules(raw);
    if (JSON.stringify(parsed) !== JSON.stringify(cachedRules)) {
      cachedRules = parsed;
    }
  }
  return cachedRules;
}

export function savePermissionRules(rules: PermissionRule[]): void {
  cachedRules = rules;
  writeJsonStorage(RULES_KEY, rules);
  ruleListeners.forEach((notify) => notify());
}

export function addPermissionRule(
  rule: Omit<PermissionRule, "id" | "enabled"> & { id?: string; enabled?: boolean },
): PermissionRule[] {
  const pattern = rule.pattern.trim();
  if (!pattern) return loadPermissionRules();
  const current = loadPermissionRules();
  const existingIdx = current.findIndex(
    (r) => r.scope === rule.scope && r.pattern.toLowerCase() === pattern.toLowerCase(),
  );
  const entry: PermissionRule = {
    id: rule.id?.trim() || (existingIdx >= 0 ? current[existingIdx].id : nextId("perm")),
    scope: rule.scope,
    pattern,
    policy: rule.policy,
    enabled: rule.enabled ?? true,
  };
  const next =
    existingIdx >= 0
      ? current.map((r, i) => (i === existingIdx ? entry : r))
      : [entry, ...current];
  savePermissionRules(next);
  return next;
}

export function togglePermissionRule(id: string, enabled?: boolean): PermissionRule[] {
  const next = loadPermissionRules().map((r) =>
    r.id === id ? { ...r, enabled: enabled ?? !r.enabled } : r,
  );
  savePermissionRules(next);
  return next;
}

export function removePermissionRule(id: string): PermissionRule[] {
  const next = loadPermissionRules().filter((r) => r.id !== id);
  savePermissionRules(next);
  return next;
}

export function usePermissionRules(): PermissionRule[] {
  return useSyncExternalStore(
    (notify) => {
      ruleListeners.add(notify);
      return () => ruleListeners.delete(notify);
    },
    () => cachedRules,
  );
}

export function loadPermissionAudit(): PermissionAuditEntry[] {
  if (hasStorage()) {
    const parsed = readJsonStorage<unknown>(AUDIT_KEY, []);
    const valid = Array.isArray(parsed)
      ? (parsed as PermissionAuditEntry[]).slice(0, MAX_AUDIT_ENTRIES)
      : [];
    if (JSON.stringify(valid) !== JSON.stringify(cachedAudit)) {
      cachedAudit = valid;
    }
  }
  return cachedAudit;
}

export function recordPermissionAudit(
  entry: Omit<PermissionAuditEntry, "id" | "at"> & { id?: string; at?: number },
): PermissionAuditEntry[] {
  const full: PermissionAuditEntry = {
    ...entry,
    id: entry.id ?? nextId("audit"),
    title: redactSecrets(entry.title),
    at: entry.at ?? Date.now(),
  };
  const next = [full, ...loadPermissionAudit()].slice(0, MAX_AUDIT_ENTRIES);
  cachedAudit = next;
  writeJsonStorage(AUDIT_KEY, next);
  auditListeners.forEach((notify) => notify());
  return next;
}

export function clearPermissionAudit(): void {
  cachedAudit = [];
  writeJsonStorage(AUDIT_KEY, []);
  auditListeners.forEach((notify) => notify());
}

export function usePermissionAudit(): PermissionAuditEntry[] {
  return useSyncExternalStore(
    (notify) => {
      auditListeners.add(notify);
      return () => auditListeners.delete(notify);
    },
    () => cachedAudit,
  );
}

// ---------------------------------------------------------------------------
// Protection des fichiers sensibles & masquage des secrets
// ---------------------------------------------------------------------------

const ENV_SAFE_EXAMPLES = new Set([".env.example", ".env.sample", ".env.template"]);

function isSensitiveToken(token: string): boolean {
  const clean = token
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/^["'`,;()[\]<>]+|["'`,;()[\]<>]+$/g, "");
  if (!clean) return false;
  if (clean === ".ssh" || clean.endsWith("/.ssh") || clean.includes("/.ssh/") || clean.startsWith(".ssh/")) {
    return true;
  }
  const base = clean.split("/").pop() ?? clean;
  if (base === ".env") return true;
  if (base.startsWith(".env.")) return !ENV_SAFE_EXAMPLES.has(base);
  if (
    base === "id_rsa" ||
    base === "id_ed25519" ||
    (base.startsWith("id_rsa.") && !base.endsWith(".pub")) ||
    (base.startsWith("id_ed25519.") && !base.endsWith(".pub"))
  ) {
    return true;
  }
  if ((base.endsWith(".pem") && base.length > 4) || (base.endsWith(".key") && base.length > 4)) {
    return true;
  }
  return base === "credentials.json";
}

/** Détecte l'accès à un fichier sensible (`.env`, clés SSH, `.pem`, `.key`, `credentials.json`). */
export function isSensitivePath(path: string): boolean {
  if (isSensitiveToken(path)) return true;
  return path
    .split(/[\s"'`,;=()]+/)
    .some((part) => part.length > 0 && isSensitiveToken(part));
}

const SENSITIVE_KEY_SUFFIXES = [
  "api_key",
  "apikey",
  "client_secret",
  "private_key",
  "secret",
  "token",
  "password",
  "passwd",
];

export function isSensitiveKeyName(rawKey: string): boolean {
  const lower = rawKey.toLowerCase();
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => {
    if (lower === suffix) return true;
    if (!lower.endsWith(suffix)) return false;
    const head = lower.slice(0, lower.length - suffix.length);
    return head.endsWith("_") || (head.length > 0 && !suffix.includes("_"));
  });
}

/** Masque automatiquement les tokens API, en-têtes `Bearer`, clés privées et valeurs sensibles. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;

  // 1. Blocs de clés privées PEM / OpenSSH
  out = out.replace(
    /-----BEGIN [A-Z0-9 -]{0,48}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 -]{0,48}PRIVATE KEY-----|$)/g,
    REDACTED_SECRET,
  );

  // 2. En-têtes Authorization: Bearer <token>
  out = out.replace(/\b(Bearer[ \t]+)([^\s"'`,;\])}>]{3,})/gi, (full, prefix: string, tok: string) => {
    if (tok.startsWith("[SECRET")) return full;
    if (tok.length >= 6 || /[\d_\-./+=]/.test(tok)) {
      return `${prefix}${REDACTED_SECRET}`;
    }
    return full;
  });

  // 3. Affectations / JSON avec valeur entre guillemets
  out = out.replace(
    /(?<![A-Za-z0-9_])(["']?)([A-Za-z0-9_]*(?:api_?key|client_secret|private_key|secret|token|password|passwd))\1([ \t]*[:=][ \t]*)(["'])((?:\\.|[^"'\\\r\n])+)\4/gi,
    (full, q1: string, key: string, sep: string, q2: string, val: string) => {
      if (!isSensitiveKeyName(key) || !val || val === REDACTED_SECRET) return full;
      return `${q1}${key}${q1}${sep}${q2}${REDACTED_SECRET}${q2}`;
    },
  );

  // 4. Affectations non quotées (KEY=secret / key: secret)
  out = out.replace(
    /(?<![A-Za-z0-9_])([A-Za-z0-9_]*(?:api_?key|client_secret|private_key|secret|token|password|passwd))([ \t]*[:=][ \t]*)(\[SECRET MASQUÉ\]|[^\s,;}\])"']+)/gi,
    (full, key: string, sep: string, val: string) => {
      if (!isSensitiveKeyName(key)) return full;
      if (!val || val === REDACTED_SECRET || val.startsWith("[SECRET")) return full;
      if (/^(?:null|true|false|undefined|none)$/i.test(val)) return full;
      return `${key}${sep}${REDACTED_SECRET}`;
    },
  );

  // 5. Tokens API connus (OpenAI, Anthropic, GitHub, Google, Slack, AWS)
  out = out.replace(
    /(?<![A-Za-z0-9_-])(github_pat_[A-Za-z0-9_]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9-]{6,}|AKIA[A-Z0-9]{10,})(?![A-Za-z0-9])/g,
    REDACTED_SECRET,
  );

  return out;
}

/** Applique `redactSecrets` récursivement aux chaînes contenues dans `raw_input` / JSON. */
export function redactUnknown(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") {
    if (parentKey && isSensitiveKeyName(parentKey) && value.length > 0 && value !== REDACTED_SECRET) {
      return REDACTED_SECRET;
    }
    return redactSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactUnknown(v, k);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Évaluateur structuré des règles de permissions
// ---------------------------------------------------------------------------

interface DefaultSecurityRule {
  id: string;
  scope: PermissionRuleScope;
  kind: "word" | "phrase" | "substring" | "sensitive_path";
  pattern: string;
  policy: PermissionPolicy;
  reason: string;
}

export const DEFAULT_PERMISSION_RULES: DefaultSecurityRule[] = [
  { id: "default-sensitive-path", scope: "path", kind: "sensitive_path", pattern: "sensitive_path", policy: "ask", reason: "accès à un fichier sensible (.env, clé SSH, certificat ou credentials)" },
  { id: "default-cmd-rm", scope: "command", kind: "word", pattern: "rm", policy: "ask", reason: "commande destructive (rm)" },
  { id: "default-cmd-sudo", scope: "command", kind: "word", pattern: "sudo", policy: "ask", reason: "élévation de privilèges (sudo)" },
  { id: "default-cmd-chmod", scope: "command", kind: "word", pattern: "chmod", policy: "ask", reason: "modification des droits (chmod)" },
  { id: "default-cmd-chown", scope: "command", kind: "word", pattern: "chown", policy: "ask", reason: "modification du propriétaire (chown)" },
  { id: "default-cmd-mkfs", scope: "command", kind: "word", pattern: "mkfs", policy: "ask", reason: "formatage disque (mkfs)" },
  { id: "default-cmd-dd", scope: "command", kind: "word", pattern: "dd", policy: "ask", reason: "écriture disque bas niveau (dd)" },
  { id: "default-cmd-curl", scope: "command", kind: "word", pattern: "curl", policy: "ask", reason: "requête réseau externe (curl)" },
  { id: "default-cmd-wget", scope: "command", kind: "word", pattern: "wget", policy: "ask", reason: "téléchargement réseau (wget)" },
  { id: "default-cmd-ssh", scope: "command", kind: "word", pattern: "ssh", policy: "ask", reason: "connexion distante (ssh)" },
  { id: "default-cmd-scp", scope: "command", kind: "word", pattern: "scp", policy: "ask", reason: "transfert distant (scp)" },
  { id: "default-cmd-kill", scope: "command", kind: "word", pattern: "kill", policy: "ask", reason: "arrêt de processus (kill)" },
  { id: "default-cmd-killall", scope: "command", kind: "word", pattern: "killall", policy: "ask", reason: "arrêt de processus (killall)" },
  { id: "default-cmd-force", scope: "command", kind: "word", pattern: "force", policy: "ask", reason: "option de forçage (force)" },
  { id: "default-cmd-flag-force", scope: "command", kind: "substring", pattern: "--force", policy: "ask", reason: "drapeau --force" },
  { id: "default-cmd-git-push", scope: "command", kind: "phrase", pattern: "git push", policy: "ask", reason: "publication git push" },
  { id: "default-cmd-git-reset", scope: "command", kind: "phrase", pattern: "git reset", policy: "ask", reason: "réinitialisation git reset" },
  { id: "default-cmd-git-clean", scope: "command", kind: "phrase", pattern: "git clean", policy: "ask", reason: "nettoyage git clean" },
  { id: "default-cmd-drop-table", scope: "command", kind: "phrase", pattern: "drop table", policy: "ask", reason: "suppression SQL DROP TABLE" },
  { id: "default-any-supprim", scope: "any", kind: "substring", pattern: "supprim", policy: "ask", reason: "action de suppression" },
  { id: "default-any-delete", scope: "any", kind: "substring", pattern: "delete", policy: "ask", reason: "action de suppression (delete)" },
  { id: "default-any-password", scope: "any", kind: "substring", pattern: "password", policy: "ask", reason: "accès à un mot de passe" },
  { id: "default-any-mdp", scope: "any", kind: "substring", pattern: "mot de passe", policy: "ask", reason: "accès à un mot de passe" },
  { id: "default-any-secret", scope: "any", kind: "substring", pattern: "secret", policy: "ask", reason: "accès à un secret" },
  { id: "default-any-token", scope: "any", kind: "substring", pattern: "token", policy: "ask", reason: "accès à un jeton" },
];

const isWordChar = (ch: string) => /[a-z0-9_]/i.test(ch);

function containsWordCi(lower: string, word: string): boolean {
  let idx = lower.indexOf(word);
  while (idx >= 0) {
    const leftOk = idx === 0 || !isWordChar(lower[idx - 1]);
    const end = idx + word.length;
    const rightOk = end === lower.length || !isWordChar(lower[end]);
    if (leftOk && rightOk) return true;
    idx = lower.indexOf(word, idx + 1);
  }
  return false;
}

function hasPhraseWs(lower: string, phrase: string): boolean {
  const parts = phrase.split(/\s+/);
  if (parts.length < 2) return containsWordCi(lower, phrase);
  const re = new RegExp(`\\b${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\b`, "i");
  return re.test(lower);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export interface PermissionTargetContext {
  title: string;
  tool?: string;
  command?: string;
  path?: string;
}

function customRuleMatches(rule: PermissionRule, ctx: PermissionTargetContext): boolean {
  if (!rule.enabled) return false;
  const pattern = rule.pattern.trim();
  if (!pattern) return false;

  const haystack =
    rule.scope === "tool" && ctx.tool
      ? ctx.tool
      : rule.scope === "command" && ctx.command
        ? ctx.command
        : rule.scope === "path" && ctx.path
          ? ctx.path
          : ctx.title;
  const candidates = [haystack, ctx.title].filter(Boolean);
  const lowerPat = pattern.toLowerCase();

  if (pattern.includes("*") || pattern.includes("?")) {
    const re = globToRegex(pattern);
    return candidates.some((c) => {
      if (re.test(c)) return true;
      return c.split(/[\s"'`,;]+/).some((tok) => tok.length > 0 && re.test(tok));
    });
  }

  return candidates.some((text) => {
    const lowerText = text.toLowerCase();
    if (rule.scope === "path") {
      const normPat = lowerPat.replace(/\\/g, "/");
      return text.split(/[\s"'`,;]+/).some((tok) => {
        const norm = tok.replace(/\\/g, "/").toLowerCase();
        const base = norm.split("/").pop() ?? norm;
        return (
          norm === normPat ||
          base === normPat ||
          norm.endsWith(`/${normPat}`) ||
          (normPat.endsWith("/") && (norm.includes(normPat) || norm.startsWith(normPat)))
        );
      }) || lowerText.replace(/\\/g, "/").includes(`/${normPat}`);
    }
    if (rule.scope === "tool" || rule.scope === "command") {
      if (!lowerPat.includes(" ") && /^[a-z0-9_]+$/i.test(lowerPat)) {
        return containsWordCi(lowerText, lowerPat);
      }
      return lowerText.includes(lowerPat);
    }
    if (!lowerPat.includes(" ") && lowerPat.length <= 4 && /^[a-z0-9_]+$/i.test(lowerPat)) {
      return containsWordCi(lowerText, lowerPat);
    }
    return lowerText.includes(lowerPat);
  });
}

function defaultRuleMatches(rule: DefaultSecurityRule, text: string, lower: string): boolean {
  switch (rule.kind) {
    case "sensitive_path":
      return isSensitivePath(text);
    case "word":
      return containsWordCi(lower, rule.pattern);
    case "phrase":
      return hasPhraseWs(lower, rule.pattern);
    case "substring":
      return lower.includes(rule.pattern);
  }
}

/**
 * Évalue une demande de permission en combinant règles utilisateur (`deny` > `ask` > `allow`),
 * mode actif, protection automatique des chemins sensibles et règles de danger par défaut.
 */
export function evaluatePermission(
  mode: PermissionMode,
  request: Pick<PermissionRequest, "title"> & { tool?: string; command?: string; path?: string },
  customRules: PermissionRule[] = loadPermissionRules(),
): PermissionEvaluation {
  const ctx: PermissionTargetContext = {
    title: request.title,
    tool: request.tool,
    command: request.command,
    path: request.path,
  };

  let matchedAsk: PermissionRule | undefined;
  let matchedAllow: PermissionRule | undefined;
  for (const rule of customRules) {
    if (!customRuleMatches(rule, ctx)) continue;
    if (rule.policy === "deny") {
      return {
        policy: "deny",
        ruleId: rule.id,
        source: "rule",
        reason: `règle personnalisée « ${rule.pattern} »`,
      };
    }
    if (rule.policy === "ask" && !matchedAsk) matchedAsk = rule;
    if (rule.policy === "allow" && !matchedAllow) matchedAllow = rule;
  }
  if (matchedAsk) {
    return {
      policy: "ask",
      ruleId: matchedAsk.id,
      source: "rule",
      reason: `règle personnalisée « ${matchedAsk.pattern} »`,
    };
  }
  if (matchedAllow) {
    return {
      policy: "allow",
      ruleId: matchedAllow.id,
      source: "rule",
      reason: `règle personnalisée « ${matchedAllow.pattern} »`,
    };
  }

  // En plan, Kana refuse lui-même toute demande de modifier quelque chose.
  if (mode === "plan") {
    return { policy: "deny", source: "mode", reason: "mode plan en lecture seule" };
  }

  // Protection des chemins sensibles même en mode `auto` ou `full`.
  const combined = [request.path, request.command, request.title].filter(Boolean).join(" ");
  if (isSensitivePath(combined)) {
    return {
      policy: "ask",
      ruleId: "default-sensitive-path",
      source: "default_rule",
      reason: "accès à un fichier sensible (.env, clé SSH, certificat ou credentials)",
    };
  }

  if (mode === "ask") {
    return { policy: "ask", source: "mode", reason: "mode approbation manuelle" };
  }

  if (mode === "auto") {
    const lower = combined.toLowerCase();
    for (const rule of DEFAULT_PERMISSION_RULES) {
      if (defaultRuleMatches(rule, combined, lower)) {
        return {
          policy: rule.policy,
          ruleId: rule.id,
          source: "default_rule",
          reason: rule.reason,
        };
      }
    }
  }

  return {
    policy: "allow",
    source: "mode",
    reason: mode === "full" ? "accès complet" : "action autorisée automatiquement",
  };
}

/**
 * L'option à choisir d'office pour cette demande, ou `null` s'il faut demander à l'utilisateur.
 */
export function autoAnswer(
  mode: PermissionMode,
  request: Pick<PermissionRequest, "title" | "options"> & { tool?: string; command?: string; path?: string },
  customRules?: PermissionRule[],
): string | null {
  const evaluation = evaluatePermission(mode, request, customRules);
  if (evaluation.policy === "ask") return null;
  if (evaluation.policy === "deny") {
    return (
      request.options.find((o) => o.kind === "reject_once")?.id ??
      request.options.find((o) => o.kind.startsWith("reject"))?.id ??
      null
    );
  }
  return (
    request.options.find((o) => o.kind === "allow_once")?.id ??
    request.options.find((o) => o.kind.startsWith("allow"))?.id ??
    null
  );
}

const PLAN_INSTRUCTION =
  "Mode plan : ne modifie aucun fichier et ne lance aucune commande qui change quoi que ce soit. " +
  "Étudie d'abord le sujet, propose un plan détaillé, puis attends mon accord avant d'agir.\n\n";

const PLAN_INSTRUCTION_EN =
  "Plan mode: do not modify any files and do not run any commands that change anything. " +
  "Study the topic first, propose a detailed plan, and wait for my approval before acting.\n\n";

/** Le texte réellement envoyé à l'agent : en mode plan, il reçoit la consigne de planifier d'abord. */
export function promptFor(mode: PermissionMode, text: string, locale: Locale = getLocale()): string {
  if (mode !== "plan") return text;
  return (locale === "en" ? PLAN_INSTRUCTION_EN : PLAN_INSTRUCTION) + text;
}
