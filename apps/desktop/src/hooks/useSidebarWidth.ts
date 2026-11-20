import { useCallback, useState, type PointerEvent } from "react";

const KEY = "kana-sidebar-width";
const MIN = 200;
const MAX = 480;
const DEFAULT = 260;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

function loadWidth(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (saved) return clamp(saved);
  } catch {
    // stockage indisponible
  }
  return DEFAULT;
}

/** Largeur de la barre latérale, réglable en tirant son bord droit. */
export function useSidebarWidth() {
  const [width, setWidth] = useState(loadWidth);
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback((event: PointerEvent) => {
    event.preventDefault();
    setDragging(true);
    let latest = 0;

    const move = (e: globalThis.PointerEvent) => {
      latest = clamp(e.clientX);
      setWidth(latest);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      setDragging(false);
      if (latest) {
        try {
          localStorage.setItem(KEY, String(latest));
        } catch {
          // la largeur ne sera pas conservée
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }, []);

  return { width, dragging, startDrag };
}
