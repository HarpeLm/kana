/**
 * Édition visuelle d'une page HTML sans toucher au code : la page est lue dans un document « mort »
 * (rien ne s'y exécute), les changements de l'utilisateur sont appliqués à ce document, puis il est
 * réécrit en texte. Seuls le texte, les lignes supprimées et les lignes ajoutées changent ; le reste de la
 * page (styles, scripts, structure) est conservé tel quel.
 *
 * Un élément est désigné par son chemin : la suite des positions parmi les enfants, depuis `<html>`.
 */

export type Path = number[];

/** Un changement. Chaque changement a son inverse, pour annuler et rétablir. */
export type Op =
  | { kind: "set"; path: Path; html: string }
  | { kind: "remove"; path: Path }
  | { kind: "insert"; parent: Path; index: number; html: string };

export function nodeAt(doc: Document, path: Path): Element | null {
  let node: Element | undefined = doc.documentElement;
  for (const index of path) {
    node = node?.children[index];
    if (!node) return null;
  }
  return node ?? null;
}

/** Retire de ce HTML ce qui s'exécuterait : scripts, gestionnaires d'événements, adresses javascript:. */
export function cleanHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script").forEach((s) => s.remove());
  template.content.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const value = attr.value.trim().toLowerCase();
      if (attr.name.startsWith("on") || value.startsWith("javascript:")) el.removeAttribute(attr.name);
    }
  });
  return template.innerHTML;
}

/**
 * Applique un changement au document et renvoie son inverse (ou `null` si l'élément visé n'existe pas).
 * Le HTML reçu est nettoyé avant d'entrer dans la page.
 */
export function applyOp(doc: Document, op: Op): Op | null {
  if (op.kind === "set") {
    const el = nodeAt(doc, op.path);
    if (!el) return null;
    const previous = el.innerHTML;
    el.innerHTML = cleanHtml(op.html);
    return { kind: "set", path: op.path, html: previous };
  }
  if (op.kind === "remove") {
    const el = nodeAt(doc, op.path);
    const parent = el?.parentElement;
    if (!el || !parent) return null;
    const index = Array.prototype.indexOf.call(parent.children, el) as number;
    const html = el.outerHTML;
    el.remove();
    return { kind: "insert", parent: op.path.slice(0, -1), index, html };
  }
  const parent = nodeAt(doc, op.parent);
  if (!parent) return null;
  const template = doc.createElement("template");
  template.innerHTML = cleanHtml(op.html);
  const added = template.content.firstElementChild;
  if (!added) return null;
  parent.insertBefore(added, parent.children[op.index] ?? null);
  return { kind: "remove", path: [...op.parent, op.index] };
}

/** Le document réécrit en texte : doctype puis page. */
export function serialize(doc: Document): string {
  const doctype = doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : "<!DOCTYPE html>";
  return `${doctype}\n${doc.documentElement.outerHTML}\n`;
}

export function parse(source: string): Document {
  return new DOMParser().parseFromString(source, "text/html");
}

/**
 * La page telle qu'on l'affiche pendant l'édition : une copie où rien ne s'exécute (scripts, cadres, gestionnaires
 * d'événements et redirections sont neutralisés, chacun remplacé par un élément vide pour que les chemins restent
 * les mêmes que dans l'original), à laquelle s'ajoute le script d'édition.
 */
export function editorPage(original: Document, editorScript: string): string {
  const copy = original.documentElement.cloneNode(true) as HTMLElement;
  const neutral = original.createElement("template");
  neutral.setAttribute("data-kana-neutralized", "");
  copy.querySelectorAll("script, iframe, object, embed, noscript").forEach((el) => el.replaceWith(neutral.cloneNode()));
  copy.querySelectorAll("meta[http-equiv]").forEach((el) => el.replaceWith(neutral.cloneNode()));
  copy.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("on") || attr.value.trim().toLowerCase().startsWith("javascript:")) el.removeAttribute(attr.name);
    }
  });
  const script = original.createElement("script");
  script.setAttribute("data-kana-editor", "");
  script.textContent = editorScript;
  // Ajouté en dernier : les chemins des éléments de la page ne changent pas.
  (copy.querySelector("body") ?? copy).appendChild(script);
  return `<!DOCTYPE html>\n${copy.outerHTML}`;
}
