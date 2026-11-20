import { useEffect, useMemo, useRef, type MouseEvent } from "react";
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
  const html = useMemo(() => addLinkIcons(renderMarkdown(linkifyGithubRefs(source))), [source, icons]);
  const root = useRef<HTMLDivElement>(null);

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
    if (/^https?:\/\//i.test(href)) onOpenLink(href);
  };

  return (
    // Le HTML a été nettoyé par DOMPurify dans renderMarkdown.
    <div ref={root} onClick={onClick} className="markdown-body chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
