import type { PointerEvent, ReactNode } from "react";
import SidebarResizer from "./SidebarResizer";

interface SidePaneProps {
  label: string;
  visible: boolean;
  /** Occupe toute la place restante au lieu de sa largeur. */
  maximized?: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  /** Contenu de l'en-tête de 44 px (titre à gauche, boutons à droite). */
  header: ReactNode;
  children: ReactNode;
}

/**
 * Volet latéral sur toute la hauteur, avec son propre en-tête, une poignée pour changer sa
 * largeur et une ouverture animée. Le conteneur change de largeur et le volet garde la sienne :
 * son contenu ne se redessine pas pendant l'animation. Masqué, il reste monté.
 */
export default function SidePane({
  label,
  visible,
  maximized = false,
  width,
  dragging,
  onResizeStart,
  header,
  children,
}: SidePaneProps) {
  const fill = maximized && visible;

  return (
    <div
      style={fill ? undefined : { width: visible ? width : 0 }}
      inert={!visible}
      className={`relative overflow-hidden bg-[#181817] motion-reduce:transition-none ${
        fill ? "min-w-0 flex-1" : "shrink-0"
      } ${dragging ? "" : "transition-[width] duration-200 ease-out"}`}
    >
      <section
        aria-label={label}
        style={maximized ? undefined : { width }}
        className={`flex h-full flex-col border-l border-[#2b2b28] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          maximized ? "w-full" : ""
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <header className="flex h-[44px] shrink-0 items-center justify-between gap-2 border-b border-[#262623] px-3">
          {header}
        </header>
        <div className="relative min-h-0 flex-1">{children}</div>
        {!maximized && <SidebarResizer edge="left" dragging={dragging} onPointerDown={onResizeStart} />}
      </section>
    </div>
  );
}
