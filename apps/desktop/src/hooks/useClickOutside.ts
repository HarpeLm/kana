import { useEffect, type RefObject } from "react";

/** Appelle `onOutside` quand on clique en dehors de `ref`, tant que `active` est vrai. */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, active, onOutside]);
}
