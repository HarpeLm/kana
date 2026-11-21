import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem, { MenuDivider } from "./ConversationMenuItem";

interface ArtifactMenuProps {
  /** Le point du clic droit (ou du clic à deux doigts). */
  x: number;
  y: number;
  onOpen: () => void;
  onCopyPath: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Le menu d'un artéfact au clic droit : l'ouvrir, copier son chemin, le supprimer (corbeille). */
export default function ArtifactMenu({ x, y, onOpen, onCopyPath, onDelete, onClose }: ArtifactMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useClickOutside(ref, true, onClose);

  // Toujours dans la fenêtre.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={ref}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] w-[210px] rounded-xl border border-[#41413d] bg-[#2b2b29] p-1 shadow-2xl"
    >
      <ConversationMenuItem label="Ouvrir" onClick={run(onOpen)} />
      <ConversationMenuItem label="Copier le chemin" onClick={run(onCopyPath)} />
      <MenuDivider />
      <ConversationMenuItem label="Supprimer" danger onClick={run(onDelete)} />
    </div>
  );
}
