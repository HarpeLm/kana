import { describe, expect, it } from "vitest";
import { linkifyFiles } from "./fileRefs";

describe("linkifyFiles", () => {
  it("transforme un chemin entre accents graves, avec sa ligne", () => {
    expect(linkifyFiles("Voir `apps/desktop/src/App.tsx:42`.")).toBe("Voir [App.tsx:42](#file/apps/desktop/src/App.tsx?line=42).");
  });
  it("accepte un nom seul entre accents graves et un chemin avec barres dans le texte", () => {
    expect(linkifyFiles("`README.md`")).toBe("[README.md](#file/README.md)");
    expect(linkifyFiles("dans src/lib/foo.rs, puis")).toBe("dans [foo.rs](#file/src/lib/foo.rs), puis");
  });
  it("garde les chemins absolus", () => {
    expect(linkifyFiles("/Users/me/proj/src/main.rs")).toBe("[main.rs](#file//Users/me/proj/src/main.rs)");
  });
  it("laisse intacts les blocs de code, les liens, les adresses web et les faux positifs", () => {
    const text = "```\nsrc/x.ts\n```\n[lien](a/b.ts) https://x.com/a/b.html e.g. v1.2";
    expect(linkifyFiles(text)).toBe(text);
  });
  it("ne touche pas aux artéfacts", () => {
    expect(linkifyFiles("`artefacts/plan.html`")).toBe("`artefacts/plan.html`");
    expect(linkifyFiles("[Plan](#artifact/artefacts/plan.html)")).toBe("[Plan](#artifact/artefacts/plan.html)");
  });
});
