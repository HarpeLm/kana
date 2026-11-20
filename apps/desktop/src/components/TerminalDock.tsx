import { createRef, useRef, type PointerEvent, type RefObject } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useTerminalTabs } from "../hooks/useTerminalTabs";
import { inTauri } from "../lib/env";
import SidePane from "./SidePane";
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

/** Volet Terminal : des onglets, un shell par onglet. Masqué, il garde ses shells. */
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

  return (
    <SidePane
      label="Terminal"
      visible={visible}
      maximized={maximized}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <TerminalTabs tabs={tabs} activeId={activeId} onSelect={select} onClose={closeTab} onAdd={add} />
          <div className="flex items-center gap-1">
            <TerminalMenu onClear={() => active()?.clear()} onRestart={() => active()?.restart()} />
            <ToolbarButton title={maximized ? "Réduire" : "Agrandir"} onClick={onToggleMaximize}>
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
        </>
      }
    >
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
    </SidePane>
  );
}
