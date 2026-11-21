import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_PLUGIN_PACKS,
  activeMcpServersFor,
  buildRulesPreface,
  clearHookLogs,
  expandSkillCommand,
  exportPluginPack,
  exportSkillMarkdown,
  importPluginPack,
  loadHookLogs,
  loadHooks,
  loadMcpServers,
  loadSkills,
  matchingHooks,
  parseSkillMarkdown,
  readRuleFiles,
  runMatchingHooks,
  saveHooks,
  saveMcpServers,
  saveSkills,
  skillsAsCommands,
  syncRuleFiles,
  upsertHook,
  upsertMcpServer,
  upsertSkill,
} from "./extensibility";

describe("extensibility", () => {
  beforeEach(() => {
    saveMcpServers([]);
    saveSkills([]);
    saveHooks([]);
    clearHookLogs();
  });

  it("filtre les serveurs MCP actifs par portée globale et par projet", () => {
    upsertMcpServer({
      name: "global-http",
      transport: "http",
      url: "https://mcp.example/http",
      oauthToken: "tok-1",
      enabled: true,
      scope: "global",
    });
    upsertMcpServer({
      name: "proj-stdio",
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server"],
      enabled: true,
      scope: "/tmp/proj-a/",
    });
    upsertMcpServer({
      name: "other-proj",
      transport: "sse",
      url: "https://other.example/sse",
      enabled: true,
      scope: "/tmp/proj-b",
    });
    upsertMcpServer({
      name: "disabled-global",
      transport: "http",
      url: "https://off.example",
      enabled: false,
      scope: "global",
    });

    expect(loadMcpServers()).toHaveLength(4);
    expect(activeMcpServersFor("/tmp/proj-a").map((s) => s.name)).toEqual(["global-http", "proj-stdio"]);
    expect(activeMcpServersFor("/tmp/proj-b").map((s) => s.name)).toEqual(["global-http", "other-proj"]);
    expect(activeMcpServersFor().map((s) => s.name)).toEqual(["global-http"]);
  });

  it("synchronise les fichiers de règles en mode navigateur et déduplique le préambule", async () => {
    const synced = await syncRuleFiles(
      "Toujours écrire des tests unitaires.",
      ["CLAUDE.md", ".kana/rules.md"],
      "/tmp/repo-rules",
    );
    expect(synced).toHaveLength(2);
    const files = await readRuleFiles("/tmp/repo-rules");
    expect(files.find((f) => f.path === "CLAUDE.md")?.exists).toBe(true);
    expect(files.find((f) => f.path === ".kana/rules.md")?.exists).toBe(true);
    expect(files.find((f) => f.path === "AGENTS.md")?.exists).toBe(false);

    const preface = buildRulesPreface(files);
    expect(preface).toContain("CLAUDE.md, .kana/rules.md");
    expect(preface).toContain("Toujours écrire des tests unitaires.");
  });

  it("parse et exporte un SKILL.md et étend les commandes slash personnalisées", () => {
    const parsed = parseSkillMarkdown(`---
name: "Audit Sécurité"
slash: /audit-sec
description: Vérifie les entrées utilisateur et secrets
---

Analyse le diff pour détecter toute fuite de secret ou injection : $ARGUMENTS`);

    expect(parsed.name).toBe("Audit Sécurité");
    expect(parsed.slash).toBe("audit-sec");
    expect(parsed.description).toBe("Vérifie les entrées utilisateur et secrets");

    upsertSkill(parsed);
    const md = exportSkillMarkdown(loadSkills()[0]);
    expect(md).toContain("slash: audit-sec");

    const cmds = skillsAsCommands();
    expect(cmds.map((c) => c.name)).toContain("audit-sec");

    expect(expandSkillCommand("/audit-sec src/auth.ts")).toBe(
      "Analyse le diff pour détecter toute fuite de secret ou injection : src/auth.ts",
    );
    expect(expandSkillCommand("/inconnu test")).toBe("/inconnu test");
  });

  it("sélectionne les hooks par motif (*, sous-chaîne, regex) et journalise l'exécution", async () => {
    upsertHook({ event: "PreToolUse", matcher: "*", command: "echo pre", enabled: true, scope: "global" });
    upsertHook({ event: "PostToolUse", matcher: "write|edit", command: "npm test", enabled: true, scope: "/tmp/p" });
    upsertHook({ event: "Stop", matcher: "/done|end_turn/", command: "git status", enabled: true, scope: "global" });

    expect(matchingHooks("PreToolUse", "bash", "/tmp/p")).toHaveLength(1);
    expect(matchingHooks("PostToolUse", "edit_file", "/tmp/p")).toHaveLength(1);
    expect(matchingHooks("PostToolUse", "read_file", "/tmp/p")).toHaveLength(0);
    expect(matchingHooks("Stop", "end_turn")).toHaveLength(1);

    const logs = await runMatchingHooks("PostToolUse", "write_file", "/tmp/p", "/tmp/p");
    expect(logs).toHaveLength(1);
    expect(logs[0].ok).toBe(true);
    expect(loadHookLogs()[0].command).toBe("npm test");
  });

  it("exporte et importe un pack de plugins complet", async () => {
    const pack = BUILTIN_PLUGIN_PACKS[1];
    const stats = await importPluginPack(pack, "/tmp/pack-proj", "/tmp/pack-proj");
    expect(stats).toEqual({ mcpCount: 1, skillCount: 1, ruleCount: 1, hookCount: 1 });
    expect(activeMcpServersFor("/tmp/pack-proj").some((s) => s.name === "context7")).toBe(true);
    expect(skillsAsCommands("/tmp/pack-proj").some((c) => c.name === "doc-sync")).toBe(true);
    expect(loadHooks().some((h) => h.event === "Stop" && h.scope === "/tmp/pack-proj")).toBe(true);

    const rules = await readRuleFiles("/tmp/pack-proj");
    const exported = exportPluginPack({ name: "Mon Export", projectPath: "/tmp/pack-proj", ruleFiles: rules });
    expect(exported.format).toBe("kana-plugin-pack");
    expect(exported.mcpServers).toHaveLength(1);
    expect(exported.skills).toHaveLength(1);
    expect(exported.rules).toHaveLength(1);
    expect(exported.hooks).toHaveLength(1);
  });
});
