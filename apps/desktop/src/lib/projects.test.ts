import { beforeEach, describe, expect, it } from "vitest";
import {
  NO_PROJECT,
  addProjectMemory,
  buildProjectMemoryPreface,
  getProjectMemory,
  removeProjectMemory,
} from "./projects";

describe("project memory", () => {
  const project = "/tmp/kana-mem-test";

  beforeEach(() => {
    while (getProjectMemory(project).length > 0) {
      removeProjectMemory(project, 0);
    }
  });

  it("ajoute, lit, déduplique et supprime les notes d'un projet", () => {
    expect(getProjectMemory(project)).toEqual([]);
    addProjectMemory(project, "  Toujours lancer cargo test  ");
    addProjectMemory(project, "Toujours lancer cargo test");
    addProjectMemory(project, "UI uniquement en français");
    addProjectMemory(project, "   ");

    expect(getProjectMemory(project)).toEqual([
      "Toujours lancer cargo test",
      "UI uniquement en français",
    ]);

    removeProjectMemory(project, 0);
    expect(getProjectMemory(project)).toEqual(["UI uniquement en français"]);
  });

  it("génère un préambule partagé et ignore les projets absents ou NO_PROJECT", () => {
    expect(buildProjectMemoryPreface()).toBe("");
    expect(buildProjectMemoryPreface(NO_PROJECT)).toBe("");
    expect(buildProjectMemoryPreface(project)).toBe("");

    addProjectMemory(project, "Respecter les conventions TypeScript strictes");
    const preface = buildProjectMemoryPreface(project);
    expect(preface).toContain("Mémoire partagée du projet");
    expect(preface).toContain("- Respecter les conventions TypeScript strictes");
    expect(preface.endsWith("\n\n")).toBe(true);
  });
});
