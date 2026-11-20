import { useCallback, useState, type PointerEvent } from "react";

interface ResizableWidthOptions {
  storageKey: string;
  min: number;
  max: number;
  fallback: number;
  /** Bord de la fenêtre contre lequel le volet est collé. */
  from: "left" | "right";
}

/** Largeur d'un volet réglable en tirant son bord, mémorisée entre deux lancements. */
export function useResizableWidth({ storageKey, min, max, fallback, from }: ResizableWidthOptions) {
  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved) return Math.min(max, Math.max(min, saved));
    } catch {
      // stockage indisponible
    }
    return fallback;
  });
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      setDragging(true);
      let latest = 0;

      const move = (e: globalThis.PointerEvent) => {
        latest = clamp(from === "left" ? e.clientX : window.innerWidth - e.clientX);
        setWidth(latest);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        setDragging(false);
        if (latest) {
          try {
            localStorage.setItem(storageKey, String(latest));
          } catch {
            // la largeur ne sera pas conservée
          }
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [clamp, from, storageKey],
  );

  return { width, dragging, startDrag };
}
