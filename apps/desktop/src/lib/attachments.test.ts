import { describe, expect, it } from "vitest";
import { fileName, imagePathsIn, withAttachments } from "./attachments";

describe("attachments", () => {
  it("ajoute la liste des fichiers joints", () => {
    expect(withAttachments("salut", ["/a/b.png", "/c/d.txt"])).toBe("salut\n\nFichiers joints :\n- /a/b.png\n- /c/d.txt");
    expect(withAttachments("salut", [])).toBe("salut");
  });
  it("retrouve les images dans le message pour les envoyer comme de vraies images", () => {
    const text = withAttachments("regarde", ["/a/b.PNG", "/c/d.txt", "/e/f.jpeg"]);
    expect(imagePathsIn(text)).toEqual(["/a/b.PNG", "/e/f.jpeg"]);
    expect(imagePathsIn("pas de pièce jointe")).toEqual([]);
  });
  it("donne le nom du fichier", () => {
    expect(fileName("/a/b/c.txt")).toBe("c.txt");
  });
});
