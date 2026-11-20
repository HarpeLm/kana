import { useMemo, type MouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "../lib/env";
import { renderMarkdown } from "../lib/markdown";

/** Markdown mis en forme. Un clic sur un lien l'ouvre dans le navigateur, jamais dans l'app. */
export default function MarkdownView({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href) && inTauri) void openUrl(href);
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Le HTML a été nettoyé par DOMPurify dans renderMarkdown. */}
      <article
        onClick={onClick}
        className="markdown-body mx-auto max-w-[720px] px-8 py-6 select-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
