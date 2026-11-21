import { describe, expect, it } from "vitest";
import { autoTitle } from "./autoTitle";

describe("autoTitle", () => {
  it("retire les formules de politesse et met une majuscule", () => {
    expect(autoTitle("Salut, tu peux me dire ceque l'on a fait pour l'instant ?")).toBe("Dire ceque l'on a fait pour l'instant");
    expect(autoTitle("On peut renommer automatiquement les titres des conversations ?")).toMatch(/^Renommer automatiquement/);
  });
  it("coupe entre deux mots avec des points de suspension", () => {
    const title = autoTitle("Corrige le bug de login dans auth.rs qui plante quand le token est vide et aussi le reste");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(46);
    expect(title).not.toMatch(/\s…$/);
  });
  it("ignore les commandes et les listes de fichiers joints", () => {
    expect(autoTitle("/compact\nRésume la session")).toBe("Résume la session");
    expect(autoTitle("")).toBe("Nouvelle conversation");
  });
});
