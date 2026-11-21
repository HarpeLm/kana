import type { OpenDoc } from "../hooks/useOpenFiles";
import { isHtml, isMarkdown, showsRendered } from "../lib/fileKinds";
import HtmlVisualEditor from "./HtmlVisualEditor";
import CodeEditor from "./CodeEditor";
import MarkdownView from "./MarkdownView";

interface DocPaneProps {
  path: string;
  doc: OpenDoc;
  /** Onglet affiché. */
  active: boolean;
  /** Pour un fichier markdown : afficher le texte source plutôt que le rendu. */
  source: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onOverwrite: () => void;
  onReload: () => void;
  onComment?: (note: { comment: string; html: string; text: string; heading: string }) => void;
}

const BANNER = "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px]";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Contenu d'un onglet : éditeur, rendu markdown ou page HTML modifiable à même la page, ou le message qui explique pourquoi il n'y en a pas. */
export default function DocPane({ path, doc, active, source, onChange, onSave, onOverwrite, onReload, onComment }: DocPaneProps) {
  if (doc.status === "loading") return <p className="p-4 text-[13px] text-[#8c8b83]">Chargement…</p>;
  if (doc.status === "error") {
    return (
      <p className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
        {doc.error}
      </p>
    );
  }
  if (doc.binary) {
    return (
      <p className="p-4 text-[13px] text-[#8c8b83]">
        Fichier binaire ({formatSize(doc.size)}) : pas d'aperçu.
      </p>
    );
  }

  const rendered = showsRendered(path, source);

  return (
    <div className="flex h-full flex-col">
      {doc.truncated && (
        <div className={`${BANNER} border-[#4a3a1f] bg-[#2a2314] text-[#e0b25f]`}>
          Fichier trop long ({formatSize(doc.size)}) : seul le début est affiché, en lecture seule.
        </div>
      )}
      {doc.conflict && (
        <div className={`${BANNER} border-[#4a2622] bg-[#2a1816] text-[#f4a99b]`}>
          <span>Ce fichier a changé sur le disque depuis son ouverture.</span>
          <button onClick={onOverwrite} className="underline underline-offset-2 hover:text-white">
            Écraser avec ma version
          </button>
          <button onClick={onReload} className="underline underline-offset-2 hover:text-white">
            Recharger depuis le disque
          </button>
        </div>
      )}
      {doc.saveError && (
        <div className={`${BANNER} border-[#4a2622] bg-[#2a1816] text-[#f4a99b]`}>{doc.saveError}</div>
      )}

      {/* L'éditeur reste monté sous le rendu markdown : on garde l'historique d'annulation. */}
      <div className="relative min-h-0 flex-1">
        {isMarkdown(path) && (
          <div className={rendered ? "h-full" : "hidden"}>
            <MarkdownView source={doc.text} />
          </div>
        )}
        {isHtml(path) && rendered && (
          <HtmlVisualEditor text={doc.text} readOnly={doc.truncated} onChange={onChange} onSave={onSave} onComment={onComment} />
        )}
        <div className={rendered ? "hidden" : "h-full"}>
          <CodeEditor
            path={path}
            value={doc.text}
            readOnly={doc.truncated}
            active={active && !rendered}
            onChange={onChange}
            onSave={onSave}
          />
        </div>
      </div>
    </div>
  );
}
