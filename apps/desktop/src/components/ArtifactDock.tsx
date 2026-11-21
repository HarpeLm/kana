import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Check, Code2, Copy, Download, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { useOpenFiles } from "../hooks/useOpenFiles";
import { artifactTitle } from "../lib/artifactRefs";
import { hasRenderedView, showsRendered } from "../lib/fileKinds";
import { relativeTime } from "../lib/relativeTime";
import FileViewer from "./FileViewer";
import SidePane from "./SidePane";
import ToolbarButton from "./ToolbarButton";

interface ArtifactDockProps {
  /** Un commentaire sur un passage d'un artéfact : l'agent le corrige. */
  onComment?: (path: string, note: { comment: string; html: string; text: string; heading: string }) => void;
  /** Un artéfact à ouvrir ; `id` change à chaque demande. */
  openRequest?: { id: number; path: string } | null;
  /** Les artéfacts connus de la conversation, pour passer de l'un à l'autre. */
  known: string[];
  root?: string;
  visible: boolean;
  maximized: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

function MenuItem({ icon, children, onClick, trailing }: { icon: ReactNode; children: ReactNode; onClick: () => void; trailing?: ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] text-[#e8e7e1] transition hover:bg-[#3a3a37]">
      <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center text-[#c4c3bb]">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

/**
 * Volet Artéfacts : le titre de l'artéfact ouvert en haut, avec un menu (changer d'artéfact, afficher le code,
 * exporter…), et en dessous la page, modifiable à même le texte et enregistrée toute seule.
 */
export default function ArtifactDock({ openRequest, known, root, visible, maximized, width, dragging, onResizeStart, onToggleMaximize, onClose, onComment }: ArtifactDockProps) {
  const files = useOpenFiles(root);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handled.current === openRequest.id) return;
    handled.current = openRequest.id;
    files.open(openRequest.path, true);
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const [menu, setMenu] = useState(false);
  const [submenu, setSubmenu] = useState(false);
  const [sourcePaths, setSourcePaths] = useState<Set<string>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, menu, () => {
    setMenu(false);
    setSubmenu(false);
  });

  const path = files.activePath;
  const doc = path ? files.docs[path] : undefined;
  const choices = [...new Set([...known, ...files.tabs.map((t) => t.path)])];
  const sourceMode = !!path && hasRenderedView(path) && !showsRendered(path, sourcePaths.has(path));

  // « Mise à jour » : l'ouverture, puis chaque enregistrement.
  useEffect(() => {
    if (!doc || doc.status !== "ready") return;
    setUpdatedAt(doc.modified > 0 ? (doc.modified < 1e12 ? doc.modified * 1000 : doc.modified) : Date.now());
  }, [path, doc?.modified, doc?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeMenu = () => {
    setMenu(false);
    setSubmenu(false);
  };

  const exportFile = () => {
    if (!path || !doc) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([doc.text], { type: "text/html" }));
    link.download = path.split("/").pop() ?? "artefact.html";
    link.click();
    URL.revokeObjectURL(link.href);
    closeMenu();
  };

  return (
    <SidePane
      label="Artéfacts"
      visible={visible}
      maximized={maximized}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <div className="relative min-w-0" ref={menuRef}>
            <button
              onClick={() => setMenu((v) => !v)}
              className="flex h-8 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-[14px] text-[#ecebe5] transition hover:bg-[#2b2b29]"
            >
              <span className="truncate">{path ? artifactTitle(path) : "Artéfacts"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#8c8b83]" strokeWidth={1.8} />
            </button>

            {menu && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-[250px] rounded-xl border border-[#3a3a37] bg-[#2d2d2b] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
                <div className="relative">
                  <MenuItem
                    icon={<Copy className="h-[16px] w-[16px]" strokeWidth={1.6} />}
                    onClick={() => setSubmenu((v) => !v)}
                    trailing={
                      <>
                        <span className="text-[14px] text-[#9a9992]">{choices.length}</span>
                        <ChevronRight className="h-4 w-4 text-[#9a9992]" strokeWidth={1.8} />
                      </>
                    }
                  >
                    Changer d'artéfact
                  </MenuItem>
                  {submenu && (
                    <div className="mt-1 max-h-[240px] overflow-y-auto rounded-xl bg-[#262624] p-1">
                      {choices.map((choice) => (
                        <button
                          key={choice}
                          onClick={() => {
                            files.open(choice, true);
                            closeMenu();
                          }}
                          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] text-[#e8e7e1] hover:bg-[#3a3a37]"
                        >
                          <span className="flex-1 truncate">{artifactTitle(choice)}</span>
                          {choice === path && <Check className="h-4 w-4 text-[#8ab4f8]" strokeWidth={2} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mx-2 my-1.5 h-px bg-[#41413d]" />
                {updatedAt && <p className="px-2.5 py-1 text-[13px] text-[#8c8b83]">Mise à jour : {relativeTime(updatedAt).toLowerCase()}</p>}
                <MenuItem icon={<Download className="h-[16px] w-[16px]" strokeWidth={1.6} />} onClick={exportFile}>
                  Exporter
                </MenuItem>
                {path && hasRenderedView(path) && (
                  <MenuItem
                    icon={<Code2 className="h-[16px] w-[16px]" strokeWidth={1.6} />}
                    onClick={() => {
                      setSourcePaths((current) => {
                        const next = new Set(current);
                        if (!next.delete(path)) next.add(path);
                        return next;
                      });
                      closeMenu();
                    }}
                  >
                    {sourceMode ? "Revenir à la page" : "Afficher le code"}
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Copy className="h-[16px] w-[16px]" strokeWidth={1.6} />}
                  onClick={() => {
                    if (path) void navigator.clipboard?.writeText(path).catch(() => {});
                    closeMenu();
                  }}
                >
                  Copier le chemin
                </MenuItem>
                <MenuItem
                  icon={<RefreshCw className="h-[16px] w-[16px]" strokeWidth={1.6} />}
                  onClick={() => {
                    if (path) void files.reload(path);
                    closeMenu();
                  }}
                >
                  Actualiser
                </MenuItem>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ToolbarButton title={maximized ? "Réduire" : "Agrandir"} onClick={onToggleMaximize}>
              {maximized ? <Minimize2 className="h-[17px] w-[17px]" strokeWidth={1.6} /> : <Maximize2 className="h-[17px] w-[17px]" strokeWidth={1.6} />}
            </ToolbarButton>
            <ToolbarButton title="Fermer" onClick={onClose}>
              <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </ToolbarButton>
          </div>
        </>
      }
    >
      <FileViewer
        tabs={files.tabs}
        activePath={path}
        docs={files.docs}
        sourcePaths={sourcePaths}
        onChange={files.setText}
        onSave={(target) => void files.save(target)}
        onOverwrite={(target) => void files.save(target, true)}
        onReload={(target) => void files.reload(target)}
        onComment={onComment}
      />
    </SidePane>
  );
}
