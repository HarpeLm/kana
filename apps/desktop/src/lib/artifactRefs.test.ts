import { describe, expect, it } from "vitest";
import { artifactTitle, findArtifacts, linkifyArtifacts } from "./artifactRefs";

describe("artifactRefs", () => {
  it("donne le titre seul, avec une majuscule", () => {
    expect(artifactTitle("artefacts/plan-lancement.html")).toBe("Plan lancement");
    expect(artifactTitle("/Users/x/p/artefacts/centrale_hydro.html")).toBe("Centrale hydro");
  });
  it("trouve les artéfacts cités, sans doublon", () => {
    const text = "Voir `artefacts/a.html` et artefacts/a.html puis /tmp/p/artefacts/b.html";
    expect(findArtifacts(text)).toEqual(["artefacts/a.html", "artefacts/b.html"]);
  });
  it("remplace les chemins par des liens avec le titre", () => {
    expect(linkifyArtifacts("Fait : `artefacts/mon-plan.html`.")).toBe("Fait : [Mon plan](#artifact/artefacts/mon-plan.html).");
  });
  it("laisse le reste du texte intact", () => {
    expect(linkifyArtifacts("rien à voir ici")).toBe("rien à voir ici");
  });
});
