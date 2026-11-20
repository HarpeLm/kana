import { useFilePreview } from "../hooks/useFilePreview";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Contenu d'un fichier : texte numéroté, ou un message pour un fichier binaire. */
export default function FilePreview({ path }: { path: string }) {
  const { preview, error, loading } = useFilePreview(path);

  if (loading) return <p className="p-4 text-[13px] text-[#8c8b83]">Chargement…</p>;
  if (error || !preview) {
    return <p className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>;
  }

  if (preview.binary) {
    return (
      <p className="p-4 text-[13px] text-[#8c8b83]">
        Fichier binaire ({formatSize(preview.size)}) : pas d'aperçu.
      </p>
    );
  }

  // Un saut de ligne final ne fait pas une ligne de plus.
  const lines = preview.text.replace(/\n$/, "").split("\n");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[#262623] px-4 py-1.5 text-[12px] text-[#8a8982]">
        <span>
          {lines.length} ligne{lines.length > 1 ? "s" : ""} · {formatSize(preview.size)}
        </span>
        {preview.truncated && <span className="text-[#e0b25f]">Aperçu coupé</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12.5px] leading-[1.6] select-text">
        <div className="flex min-w-max py-2">
          <pre className="sticky left-0 shrink-0 select-none bg-[#181817] pl-3 pr-3 text-right text-[#6c6b65]">
            {lines.map((_, i) => i + 1).join("\n")}
          </pre>
          <pre className="pr-6 text-[#d4d3cb]">{lines.join("\n")}</pre>
        </div>
      </div>
    </div>
  );
}
