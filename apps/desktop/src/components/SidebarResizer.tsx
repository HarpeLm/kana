import type { PointerEvent } from "react";

interface SidebarResizerProps {
  dragging: boolean;
  onPointerDown: (event: PointerEvent) => void;
}

/** Poignée sur le bord droit de la barre latérale : la tirer change sa largeur. */
export default function SidebarResizer({ dragging, onPointerDown }: SidebarResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner la barre latérale"
      onPointerDown={onPointerDown}
      className="group absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize"
    >
      <div
        className={`mx-auto h-full w-[2px] transition-colors ${
          dragging ? "bg-[#3d8bfd]" : "bg-transparent group-hover:bg-[#3d8bfd]"
        }`}
      />
    </div>
  );
}
