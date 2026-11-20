import { useEffect, useRef, type RefObject } from "react";
import type { Bounds } from "../lib/browser";

/**
 * Suit la position et la taille d'un élément de la page pour y poser une vue native.
 * Une vue native ne suit pas la mise en page : on relit la position à chaque image (ce qui couvre
 * les animations d'ouverture, le redimensionnement et le déplacement par d'autres volets) et on
 * ne prévient que quand elle a changé.
 */
export function useNativeBounds(
  target: RefObject<HTMLElement | null>,
  active: boolean,
  onChange: (bounds: Bounds) => void,
) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      const element = target.current;
      if (element) {
        const r = element.getBoundingClientRect();
        const key = [r.left, r.top, r.width, r.height].map(Math.round).join(",");
        if (key !== last && r.width > 0 && r.height > 0) {
          last = key;
          callback.current({ x: r.left, y: r.top, width: r.width, height: r.height });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);
}
