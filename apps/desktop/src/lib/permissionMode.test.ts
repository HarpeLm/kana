// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  REDACTED_SECRET,
  addPermissionRule,
  autoAnswer,
  clearPermissionAudit,
  evaluatePermission,
  isSensitivePath,
  loadPermissionAudit,
  loadPermissionRules,
  promptFor,
  recordPermissionAudit,
  redactSecrets,
  redactUnknown,
  removePermissionRule,
  togglePermissionRule,
  type PermissionRule,
} from "./permissionMode";

const options = [
  { id: "allow", name: "Autoriser", kind: "allow_once" },
  { id: "deny", name: "Refuser", kind: "reject_once" },
];

describe("autoAnswer & evaluatePermission", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("demande toujours en mode approbation", () => {
    expect(autoAnswer("ask", { title: "edit", options })).toBeNull();
  });

  it("refuse tout d'office en mode plan", () => {
    expect(autoAnswer("plan", { title: "edit", options })).toBe("deny");
    expect(autoAnswer("plan", { title: "edit", options: [options[0]] })).toBeNull();
  });

  it("autorise une fois en mode auto, sauf gestes dangereux et fichiers sensibles", () => {
    expect(autoAnswer("auto", { title: "ls -la", options })).toBe("allow");
    expect(autoAnswer("auto", { title: "read .environment", options })).toBe("allow");
    expect(autoAnswer("auto", { title: "rm -rf build", options })).toBeNull();
    expect(autoAnswer("auto", { title: "git push --force", options })).toBeNull();
    expect(autoAnswer("auto", { title: "cat .env.local", options })).toBeNull();
  });

  it("autorise tout en accès complet sauf fichiers sensibles", () => {
    expect(autoAnswer("full", { title: "rm -rf build", options })).toBe("allow");
    expect(autoAnswer("full", { title: "cat .env", options })).toBeNull();
    expect(autoAnswer("full", { title: "read ~/.ssh/id_rsa", options })).toBeNull();
  });

  it("applique les règles personnalisées persistantes (allow/ask/deny)", () => {
    addPermissionRule({ scope: "command", pattern: "npm test", policy: "allow" });
    addPermissionRule({ scope: "path", pattern: "*.pem", policy: "deny" });
    const rules = loadPermissionRules();
    expect(rules).toHaveLength(2);
    const pemRule = rules.find((r) => r.pattern === "*.pem")!;
    const npmRule = rules.find((r) => r.pattern === "npm test")!;

    expect(evaluatePermission("ask", { title: "run npm test" }, rules).policy).toBe("allow");
    expect(autoAnswer("ask", { title: "run npm test", options })).toBe("allow");

    expect(evaluatePermission("full", { title: "read certs/prod.pem" }, rules).policy).toBe("deny");
    expect(autoAnswer("full", { title: "read certs/prod.pem", options })).toBe("deny");

    // Désactive la règle *.pem : le chemin sensible reste protégé en `ask` au lieu de `deny`.
    const toggledPem = togglePermissionRule(pemRule.id, false);
    expect(toggledPem.find((r) => r.id === pemRule.id)?.enabled).toBe(false);
    expect(evaluatePermission("full", { title: "read certs/prod.pem" }, toggledPem).policy).toBe("ask");

    // Désactive la règle npm test : le mode `ask` reprend la main.
    const toggledNpm = togglePermissionRule(npmRule.id, false);
    expect(evaluatePermission("ask", { title: "run npm test" }, toggledNpm).policy).toBe("ask");

    const remaining = removePermissionRule(pemRule.id);
    expect(remaining).toHaveLength(1);
  });

  it("enregistre et borne le journal d'audit à 200 entrées", () => {
    for (let i = 0; i < 205; i++) {
      recordPermissionAudit({
        title: `action ${i} token=secret-${i}`,
        decision: "allow",
        mode: "auto",
        source: "mode",
      });
    }
    const entries = loadPermissionAudit();
    expect(entries).toHaveLength(200);
    expect(entries[0].title).toContain(REDACTED_SECRET);
    expect(entries[0].title).not.toContain("secret-204");
    clearPermissionAudit();
    expect(loadPermissionAudit()).toEqual([]);
  });
});

describe("isSensitivePath & redactSecrets", () => {
  it("protège .env, clés SSH, certificats et credentials tout en autorisant les exemples", () => {
    for (const p of [".env", "/app/.env.production", "~/.ssh/id_rsa", ".ssh/id_ed25519", "server.pem", "dev.key", "credentials.json"]) {
      expect(isSensitivePath(p)).toBe(true);
    }
    for (const p of [".env.example", ".env.sample", ".env.template", ".environment", "src/App.tsx"]) {
      expect(isSensitivePath(p)).toBe(false);
    }
  });

  it("masque les tokens, Bearer, clés privées et affectations sensibles", () => {
    const raw = [
      "sk-proj-abc1234567890",
      "ghp_1234567890abcdef",
      "github_pat_11ABCDEF123456",
      "AIzaSyTest1234567890",
      "xoxb-123456-abcdef",
      "AKIAIOSFODNN7EXAMPLE",
      "Authorization: Bearer super_jwt_token_123",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc123\n-----END OPENSSH PRIVATE KEY-----",
      '{"api_key":"k123","password":"pw1","total_tokens":500}',
      "CLIENT_SECRET=mysecret",
    ].join("\n");

    const masked = redactSecrets(raw);
    for (const secret of [
      "sk-proj-abc1234567890",
      "ghp_1234567890abcdef",
      "github_pat_11ABCDEF123456",
      "AIzaSyTest1234567890",
      "xoxb-123456-abcdef",
      "AKIAIOSFODNN7EXAMPLE",
      "super_jwt_token_123",
      "abc123",
      "k123",
      "pw1",
      "mysecret",
    ]) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain('"total_tokens":500');
    expect(masked).toContain(`Bearer ${REDACTED_SECRET}`);

    const obj = redactUnknown({ cmd: "echo ok", token: "tok_plain", nested: { authorization: "Bearer abc_12345" } });
    expect(obj).toEqual({
      cmd: "echo ok",
      token: REDACTED_SECRET,
      nested: { authorization: `Bearer ${REDACTED_SECRET}` },
    });
  });

  it("préfixe correctement la consigne plan en FR et EN", () => {
    expect(promptFor("plan", "fais x", "fr")).toContain("Mode plan");
    expect(promptFor("plan", "do x", "en")).toContain("Plan mode:");
    expect(promptFor("ask", "fais x", "en")).toBe("fais x");
  });
});

// Vérification de type exporté
export type _CheckRuleType = PermissionRule;
