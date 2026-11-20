import { faviconFor } from "./favicons";
import { siteIconPath } from "./siteIcons";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Petit globe, pour les sites dont on ne connaît pas l'icône. */
export function globeIcon(doc: Document): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "link-icon link-icon-svg");
  const circle = doc.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "10");
  const meridian = doc.createElementNS(SVG_NS, "path");
  meridian.setAttribute("d", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20");
  const equator = doc.createElementNS(SVG_NS, "path");
  equator.setAttribute("d", "M2 12h20");
  svg.append(circle, meridian, equator);
  return svg;
}

function brandIcon(doc: Document, path: string): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "link-icon link-icon-svg");
  const shape = doc.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

/** L'icône d'un lien : celle du site si on la connaît, sinon son favicon, sinon un globe. */
function iconFor(doc: Document, href: string): Element | null {
  let host: string;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.host;
  } catch {
    return null;
  }
  const path = siteIconPath(host);
  if (path) return brandIcon(doc, path);
  const favicon = faviconFor(host);
  if (favicon) {
    const image = doc.createElement("img");
    image.className = "link-icon";
    image.src = favicon;
    image.alt = "";
    image.setAttribute("data-favicon", "");
    return image;
  }
  return globeIcon(doc);
}

/** Ajoute une icône devant chaque lien web du HTML (déjà nettoyé). */
export function addLinkIcons(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a[href]").forEach((link) => {
    const icon = iconFor(doc, link.getAttribute("href") ?? "");
    if (icon) link.prepend(icon);
  });
  return doc.body.innerHTML;
}
