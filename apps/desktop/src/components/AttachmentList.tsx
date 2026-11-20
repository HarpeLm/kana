import { useEffect, useState } from "react";
import { FileText, Folder, X } from "lucide-react";
import { fileName, imagePreview, isImage } from "../lib/attachments";

function RemoveButton({ path, onRemove, className }: { path: string; onRemove: () => void; className: string }) {
  return (
    <button
      onClick={onRemove}
      aria-label={`Retirer ${fileName(path)}`}
      className={`flex items-center justify-center rounded-full text-[#c4c3bc] hover:text-white ${className}`}
    >
      <X className="h-3 w-3" strokeWidth={2.2} />
    </button>
  );
}

/** Une image jointe, montrée en miniature. */
function Thumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    imagePreview(path).then((url) => current && setSrc(url));
    return () => {
      current = false;
    };
  }, [path]);

  if (!src) return <Chip path={path} onRemove={onRemove} />;
  return (
    <li title={path} className="group relative h-[72px] w-[72px] overflow-hidden rounded-2xl border border-[#343432] bg-[#232322]">
      <img src={src} alt={fileName(path)} className="h-full w-full object-cover" draggable={false} />
      <RemoveButton
        path={path}
        onRemove={onRemove}
        className="absolute right-1 top-1 h-5 w-5 bg-black/60 opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
      />
    </li>
  );
}

/** Un fichier ou un dossier joint, en pastille. */
function Chip({ path, onRemove }: { path: string; onRemove: () => void }) {
  const Icon = /\.[A-Za-z0-9]{1,8}$/.test(path) ? FileText : Folder;
  return (
    <li
      title={path}
      className="flex max-w-[260px] items-center gap-1.5 self-end rounded-full bg-[#232322] py-1 pl-2.5 pr-1.5 text-[12px] text-[#c4c3bc]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#8c8b83]" strokeWidth={1.6} />
      <span className="truncate">{fileName(path)}</span>
      <RemoveButton path={path} onRemove={onRemove} className="h-4 w-4 hover:bg-[#333331]" />
    </li>
  );
}

/** Les pièces jointes au-dessus de la zone de saisie : miniatures pour les images, pastilles sinon. */
export default function AttachmentList({ paths, onRemove }: { paths: string[]; onRemove: (path: string) => void }) {
  if (paths.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap items-end gap-2 px-1">
      {paths.map((path) =>
        isImage(path) ? (
          <Thumb key={path} path={path} onRemove={() => onRemove(path)} />
        ) : (
          <Chip key={path} path={path} onRemove={() => onRemove(path)} />
        ),
      )}
    </ul>
  );
}
