import { describe, expect, it } from "vitest";
import { autoAnswer, promptFor } from "./permissionMode";

const options = [
  { id: "allow", name: "Autoriser", kind: "allow_once" },
  { id: "deny", name: "Refuser", kind: "reject_once" },
];

describe("autoAnswer", () => {
  it("demande toujours en mode approbation", () => {
    expect(autoAnswer("ask", { title: "edit", options })).toBeNull();
  });
  it("refuse tout d'office en mode plan", () => {
    expect(autoAnswer("plan", { title: "edit", options })).toBe("deny");
    expect(autoAnswer("plan", { title: "edit", options: [options[0]] })).toBeNull();
  });
  it("autorise une fois en mode auto, sauf gestes dangereux", () => {
    expect(autoAnswer("auto", { title: "ls -la", options })).toBe("allow");
    expect(autoAnswer("auto", { title: "rm -rf build", options })).toBeNull();
    expect(autoAnswer("auto", { title: "git push --force", options })).toBeNull();
  });
  it("autorise tout en accès complet", () => {
    expect(autoAnswer("full", { title: "rm -rf build", options })).toBe("allow");
  });
});

describe("promptFor", () => {
  it("ajoute la consigne de plan seulement en mode plan", () => {
    expect(promptFor("plan", "fais x")).toContain("Mode plan");
    expect(promptFor("ask", "fais x")).toBe("fais x");
  });
});
