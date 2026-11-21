import { describe, expect, it } from "vitest";
import type { ArtifactEntry } from "./artifactIndex";
import type { Conversation } from "./conversations";
import type { ScheduledTask } from "./schedule";
import {
  ACTION_CYCLE_MODE,
  ACTION_NEW,
  ACTION_OPEN_RELAY,
  ACTION_SETTINGS,
  ACTION_TOGGLE_ARTIFACTS,
  ACTION_TOGGLE_BROWSER,
  ACTION_TOGGLE_DIFF,
  ACTION_TOGGLE_FILES,
  ACTION_TOGGLE_SESSION,
  ACTION_TOGGLE_TERMINAL,
  buildSections,
} from "./searchItems";

const conv = (id: string, title: string, project = "kana", extra: Partial<Conversation> = {}): Conversation => ({
  id,
  title,
  project,
  agentId: "opencode",
  pinned: false,
  ...extra,
});
const artifact = (title: string, modified: number): ArtifactEntry => ({
  key: `/r::artefacts/${title}.html`,
  root: "/r",
  path: `artefacts/${title}.html`,
  title,
  modified,
  conversationId: "c1",
  project: "kana",
  html: "<p>x</p>",
});

const conversations = [conv("c1", "Plan de lancement", "kana", { openedAt: 3 }), conv("c2", "Bug login", "aquapp", { openedAt: 2 }), conv("c3", "Vieille", "kana", { archived: true })];

describe("buildSections", () => {
  it("sans saisie : récents (sans les archivées), artéfacts, actions", () => {
    const names = buildSections(conversations, "", "all", [artifact("Plan", 1)]).map((s) => s.name);
    expect(names).toEqual(["Récents", "Artéfacts", "Actions"]);
    const recent = buildSections(conversations, "", "all")[0];
    expect(recent.items.map((i) => i.title)).toEqual(["Plan de lancement", "Bug login"]);
  });
  it("filtre les sessions par le texte saisi", () => {
    const sections = buildSections(conversations, "bug", "all");
    expect(sections.find((s) => s.name === "Sessions")?.items.map((i) => i.title)).toEqual(["Bug login"]);
  });
  it("l'onglet Artéfacts liste les artéfacts et les filtre", () => {
    const list = [artifact("Plan", 2), artifact("Budget", 1)];
    expect(buildSections(conversations, "", "artifacts", list)[0].items).toHaveLength(2);
    const found = buildSections(conversations, "bud", "artifacts", list)[0].items;
    expect(found.map((i) => i.title)).toEqual(["Budget"]);
    expect(found[0].kind).toBe("artifact");
    expect(buildSections(conversations, "zzz", "artifacts", list)).toEqual([]);
  });
  it("l'onglet Projets regroupe par projet", () => {
    const items = buildSections(conversations, "", "projects")[0].items;
    expect(items.map((i) => i.title)).toEqual(["kana", "aquapp"]);
  });
  it("expose les actions rapides avec leurs raccourcis et les filtre à la saisie", () => {
    const actions = buildSections(conversations, "", "all").find((s) => s.name === "Actions")?.items ?? [];
    expect(actions.map((a) => [a.id, a.hint])).toEqual([
      [ACTION_NEW, "⌘N"],
      [ACTION_SETTINGS, "⌘,"],
      [ACTION_TOGGLE_TERMINAL, "⌘J"],
      [ACTION_TOGGLE_DIFF, "⇧⌘D"],
      [ACTION_TOGGLE_FILES, "⇧⌘E"],
      [ACTION_TOGGLE_ARTIFACTS, "⇧⌘A"],
      [ACTION_TOGGLE_BROWSER, "⇧⌘G"],
      [ACTION_TOGGLE_SESSION, "⇧⌘P"],
      [ACTION_CYCLE_MODE, "⇧⌘M"],
      [ACTION_OPEN_RELAY, undefined],
    ]);
    const filtered = buildSections(conversations, "terminal", "all").find((s) => s.name === "Actions")?.items ?? [];
    expect(filtered.map((a) => a.id)).toEqual([ACTION_TOGGLE_TERMINAL]);
    const byHint = buildSections(conversations, "⇧⌘M", "all").find((s) => s.name === "Actions")?.items ?? [];
    expect(byHint.map((a) => a.id)).toEqual([ACTION_CYCLE_MODE]);
  });
  it("l'onglet Tâches planifiées recherche les tâches planifiées", () => {
    const tasks: ScheduledTask[] = [
      {
        id: "t1",
        title: "Audit sécurité",
        prompt: "Vérifie les dépendances",
        projectPath: "/tmp/kana",
        agentId: "claude",
        interval: "24h",
        maxTokensBudget: 50_000,
        enabled: true,
        lastRunAt: null,
        lastStatus: null,
      },
      {
        id: "t2",
        title: "Tests nocturnes",
        prompt: "Lance cargo test",
        projectPath: "/tmp/kana",
        agentId: "codex",
        interval: "6h",
        maxTokensBudget: 25_000,
        enabled: false,
        lastRunAt: null,
        lastStatus: null,
      },
    ];
    expect(buildSections(conversations, "", "scheduled", [], tasks)[0].items).toHaveLength(2);
    const filtered = buildSections(conversations, "audit", "scheduled", [], tasks)[0].items;
    expect(filtered.map((i) => i.title)).toEqual(["Audit sécurité"]);
    expect(filtered[0].kind).toBe("scheduled");
    expect(buildSections(conversations, "inconnu", "scheduled", [], tasks)).toEqual([]);
  });
});
