import { createRef, useRef, type PointerEvent, type RefObject } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useTerminalTabs } from "../hooks/useTerminalTabs";
import { inTauri } from "../lib/env";
import SidebarResizer from "./SidebarResizer";
import TerminalMenu from "./TerminalMenu";
import TerminalTabs from "./TerminalTabs";
import TerminalView, { type TerminalHandle } from "./TerminalView";
import ToolbarButton from "./ToolbarButton";

interface TerminalDockProps {
  visible: boolean;
  maximized: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

/**
 * Volet Terminal sur le côté, sur toute la hauteur, avec son propre en-tête. Il s'ouvre en
 * glissant, comme la barre latérale. Masqué, il garde ses shells.
 */
export default function TerminalDock({
  visible,
  maximized,
  width,
  dragging,
  onResizeStart,
  onToggleMaximize,
  onClose,
}: TerminalDockProps) {
  const { tabs, activeId, add, select, close } = useTerminalTabs();
  const handles = useRef(new Map<string, RefObject<TerminalHandle | null>>());

  const handleOf = (id: string) => {
    if (!handles.current.has(id)) handles.current.set(id, createRef<TerminalHandle>());
    return handles.current.get(id)!;
  };
  const active = () => handleOf(activeId).current;

  const closeTab = (id: string) => {
    close(id);
    handles.current.delete(id);
  };

  // Le conteneur change de largeur ; le volet garde la sienne : le terminal ne se
  // redimensionne pas pendant l'animation. Pas d'animation pendant le glissement.
  return (
    <div
      style={maximized && visible ? undefined : { width: visible ? width : 0 }}
      inert={!visible}
      className={`relative overflow-hidden bg-[#181817] motion-reduce:transition-none ${
        maximized && visible ? "min-w-0 flex-1" : "shrink-0"
      } ${dragging ? "" : "transition-[width] duration-200 ease-out"}`}
    >
      <section
        aria-label="Terminal"
        style={maximized ? undefined : { width }}
        className={`flex h-full flex-col border-l border-[#2b2b28] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          maximized ? "w-full" : ""
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <header className="flex h-[44px] shrink-0 items-center justify-between gap-2 border-b border-[#262623] px-3">
          <TerminalTabs tabs={tabs} activeId={activeId} onSelect={select} onClose={closeTab} onAdd={add} />
          <div className="flex items-center gap-1">
            <TerminalMenu onClear={() => active()?.clear()} onRestart={() => active()?.restart()} />
            <ToolbarButton
              title={maximized ? "Réduire" : "Agrandir"}
              onClick={onToggleMaximize}
            >
              {maximized ? (
                <Minimize2 className="h-[17px] w-[17px]" strokeWidth={1.6} />
              ) : (
                <Maximize2 className="h-[17px] w-[17px]" strokeWidth={1.6} />
              )}
            </ToolbarButton>
            <ToolbarButton title="Fermer le terminal" onClick={onClose}>
              <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </ToolbarButton>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {inTauri ? (
            tabs.map((tab) => (
              <TerminalView
                key={tab.id}
                id={tab.id}
                ref={handleOf(tab.id)}
                active={visible && tab.id === activeId}
              />
            ))
          ) : (
            <p className="p-4 text-[13px] text-[#8c8b83]">
              Le terminal fonctionne dans la fenêtre de l'app Kana, pas dans un navigateur.
            </p>
          )}
        </div>

        {!maximized && <SidebarResizer edge="left" dragging={dragging} onPointerDown={onResizeStart} />}
      </section>
    </div>
  );
}
