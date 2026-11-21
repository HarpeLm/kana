// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyOp, cleanHtml, parse, serialize, type Op } from "./htmlEdit";

const PAGE = `<!DOCTYPE html><html><head><title>T</title></head><body><h1>Titre</h1><ol><li>Un</li><li>Deux</li><li>Trois</li></ol><script>alert(1)</script></body></html>`;
// <html> → [head, body] ; body = [h1, ol, script] ; ol = [li, li, li]
const OL = [1, 1];

const items = (doc: Document) => [...doc.querySelectorAll("li")].map((li) => li.textContent);

describe("htmlEdit", () => {
  it("modifie un texte et sait l'annuler", () => {
    const doc = parse(PAGE);
    const inverse = applyOp(doc, { kind: "set", path: [...OL, 0], html: "Un <b>modifié</b>" })!;
    expect(doc.querySelector("li")!.innerHTML).toBe("Un <b>modifié</b>");
    applyOp(doc, inverse);
    expect(doc.querySelector("li")!.innerHTML).toBe("Un");
  });

  it("supprime une ligne et la remet à sa place", () => {
    const doc = parse(PAGE);
    const inverse = applyOp(doc, { kind: "remove", path: [...OL, 1] })!;
    expect(items(doc)).toEqual(["Un", "Trois"]);
    applyOp(doc, inverse);
    expect(items(doc)).toEqual(["Un", "Deux", "Trois"]);
  });

  it("ajoute une ligne à l'endroit voulu", () => {
    const doc = parse(PAGE);
    const inverse = applyOp(doc, { kind: "insert", parent: OL, index: 1, html: "<li>Nouveau</li>" })!;
    expect(items(doc)).toEqual(["Un", "Nouveau", "Deux", "Trois"]);
    applyOp(doc, inverse);
    expect(items(doc)).toEqual(["Un", "Deux", "Trois"]);
  });

  it("déplace une ligne parmi ses voisines et le déplacement s'annule", () => {
    const doc = parse(PAGE);
    const inverse = applyOp(doc, { kind: "move", from: [...OL, 0], to: 2 })!;
    expect(items(doc)).toEqual(["Deux", "Trois", "Un"]);
    applyOp(doc, inverse);
    expect(items(doc)).toEqual(["Un", "Deux", "Trois"]);
    const down: Op = { kind: "move", from: [...OL, 2], to: 0 };
    applyOp(doc, down);
    expect(items(doc)).toEqual(["Trois", "Un", "Deux"]);
  });

  it("refuse un élément qui n'existe pas", () => {
    expect(applyOp(parse(PAGE), { kind: "remove", path: [9, 9] })).toBeNull();
  });

  it("nettoie ce qui s'exécuterait", () => {
    const html = cleanHtml('<a href="javascript:x()" onclick="y()">lien</a><script>z()</script>');
    expect(html).not.toMatch(/javascript:|onclick|script/);
    expect(html).toContain("lien");
  });

  it("réécrit la page en gardant le reste intact, scripts compris", () => {
    const doc = parse(PAGE);
    applyOp(doc, { kind: "set", path: [1, 0], html: "Autre titre" });
    const out = serialize(doc);
    expect(out).toContain("<h1>Autre titre</h1>");
    expect(out).toContain("<script>alert(1)</script>");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
