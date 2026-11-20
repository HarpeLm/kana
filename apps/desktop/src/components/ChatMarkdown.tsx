import { useMemo, type MouseEvent } from "react";
import { linkifyGithubRefs } from "../lib/githubRefs";
import { renderMarkdown } from "../lib/markdown";

/**
 * Réponse d'un agent mise en forme. Un clic sur un lien web l'ouvre dans le Globe de Kana ;
 * les adresses qui ne sont pas du web (mailto:, file:…) ne sont jamais suivies.
 */
export default function ChatMarkdown({ source, onOpenLink }: { source: string; onOpenLink: (url: string) => void }) {
  const html = useMemo(() => renderMarkdown(linkifyGithubRefs(source)), [source]);

  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) onOpenLink(href);
  };

  return (
    // Le HTML a été nettoyé par DOMPurify dans renderMarkdown.
    <div onClick={onClick} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
