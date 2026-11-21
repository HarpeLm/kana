import { useContext, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { linkifyArtifacts, OpenArtifactContext } from "../lib/artifactRefs";
import { linkifyFiles, OpenFileContext } from "../lib/fileRefs";
import { useFaviconVersion } from "../lib/favicons";
import { linkifyGithubRefs } from "../lib/githubRefs";
import { addLinkIcons, globeIcon } from "../lib/linkIcons";
import { renderMarkdown } from "../lib/markdown";

/**
 * Réponse d'un agent mise en forme. Un clic sur un lien web l'ouvre dans le Globe de Kana ;
 * les adresses qui ne sont pas du web (mailto:, file:…) ne sont jamais suivies.
 */
export default function ChatMarkdown({ source, onOpenLink }: { source: string; onOpenLink: (url: string) => void }) {
  // Les icônes se redessinent quand le Globe découvre le favicon d'un site.
  const icons = useFaviconVersion();
  const html = useMemo(() => addLinkIcons(renderMarkdown(linkifyGithubRefs(linkifyFiles(linkifyArtifacts(source))))), [source, icons]);
  const root = useRef<HTMLDivElement>(null);
  const openArtifact = useContext(OpenArtifactContext);
  const openLocalFile = useContext(OpenFileContext);

  // Un lien d'artéfact reçoit la petite icône de document, devant son titre.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLAnchorElement>('a[href^="#artifact/"]').forEach((link) => {
      if (link.querySelector(".artifact-icon")) return;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("class", "artifact-icon");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "1.8");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.innerHTML = '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
      link.prepend(icon);
    });
  }, [html]);

  // Un lien de fichier local reçoit une icône de fichier.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLAnchorElement>('a[href^="#file/"]').forEach((link) => {
      if (link.querySelector(".file-icon")) return;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("class", "artifact-icon file-icon");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "1.8");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.innerHTML = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
      link.prepend(icon);
    });
  }, [html]);

  // Un favicon introuvable est remplacé par le globe.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLImageElement>("img[data-favicon]").forEach((image) => {
      image.addEventListener("error", () => image.replaceWith(globeIcon(document)), { once: true });
    });
  }, [html]);

  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#artifact/")) return openArtifact(decodeURI(href.slice("#artifact/".length)));
    if (href.startsWith("#file/")) return openLocalFile(decodeURI(href.slice("#file/".length)).replace(/\?line=\d+$/, ""));
    if (/^https?:\/\//i.test(href)) onOpenLink(href);
  };

  return (
    // Le HTML a été nettoyé par DOMPurify dans renderMarkdown.
    <div ref={root} onClick={onClick} className="markdown-body chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
