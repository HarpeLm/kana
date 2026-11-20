import type { PointerEvent } from "react";

interface SidebarResizerProps {
  dragging: boolean;
  onPointerDown: (event: PointerEvent) => void;
  /** Bord du volet où se trouve la poignée. */
  edge?: "left" | "right";
}

/** Poignée sur le bord d'un volet : la tirer change sa largeur. */
export default function SidebarResizer({ dragging, onPointerDown, edge = "right" }: SidebarResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner le volet"
      onPointerDown={onPointerDown}
      className={`group absolute top-0 z-10 h-full w-2 cursor-col-resize ${
        edge === "right" ? "right-0" : "left-0"
      }`}
    >
      <div
        className={`mx-auto h-full w-[2px] transition-colors ${
          dragging ? "bg-[#3d8bfd]" : "bg-transparent group-hover:bg-[#3d8bfd]"
        }`}
      />
    </div>
  );
}
