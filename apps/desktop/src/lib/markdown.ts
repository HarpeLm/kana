import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Transforme du markdown en HTML sûr. Le contenu vient de fichiers du dépôt, donc on ne lui fait
 * pas confiance : le HTML est nettoyé (pas de script, de formulaire ni de style), et les images,
 * qui chargeraient des adresses externes ou introuvables, sont remplacées par leur texte.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true }) as string;
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });

  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("img").forEach((image) => {
    const stand = doc.createElement("span");
    stand.className = "md-image";
    stand.textContent = `[image : ${image.getAttribute("alt") || "sans description"}]`;
    image.replaceWith(stand);
  });
  return doc.body.innerHTML;
}
