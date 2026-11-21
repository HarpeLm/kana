import { describe, expect, it } from "vitest";
import { EDITOR_SCRIPT } from "./htmlEditorScript";

describe("script de l'éditeur visuel", () => {
  it("est du JavaScript valide (il est envoyé tel quel dans le cadre isolé)", () => {
    expect(() => new Function(EDITOR_SCRIPT)).not.toThrow();
  });
});
