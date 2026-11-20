import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

/** Distance minimale avant qu'un appui devienne un glissement (sinon c'est un simple clic). */
const THRESHOLD = 5;
/** Marge entre deux dossiers (mt-6). */
const GAP = 24;

interface Drag {
  name: string;
  dy: number;
  from: number;
  target: number;
  height: number;
}

/**
 * Glisser-déposer des dossiers de la barre latérale, à la souris : le dossier saisi se soulève et suit
 * le curseur, les autres s'écartent en glissant pour lui faire de la place, et il se pose où on le lâche.
 * `names` : les dossiers déplaçables, dans l'ordre affiché.
 */
export function useSectionDrag(names: string[], onMove: (from: string, to: string) => void) {
  const elements = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  // La même valeur que `drag`, lisible sans attendre le rendu : le relâchement s'en sert.
  const current = useRef<Drag | null>(null);
  const pressed = useRef<{ name: string; y: number } | null>(null);
  const dragged = useRef(false);
  const latest = useRef({ names, onMove });
  useEffect(() => {
    latest.current = { names, onMove };
  });

  const register = useCallback(
    (name: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(name, element);
      else elements.current.delete(name);
    },
    [],
  );

  const compute = (name: string, dy: number): Drag | null => {
    const order = latest.current.names;
    const from = order.indexOf(name);
    const rects = order.map((n) => elements.current.get(n)?.getBoundingClientRect());
    if (from < 0 || rects.some((r) => !r)) return null;
    const own = rects[from]!;
    const center = own.top + own.height / 2 + dy;
    // La place d'arrivée : combien d'autres dossiers ont leur milieu au-dessus du dossier saisi.
    const target = rects.filter((r, i) => i !== from && r!.top + r!.height / 2 < center).length;
    return { name, dy, from, target, height: own.height + GAP };
  };

  useEffect(() => {
    const onMoveEvent = (event: globalThis.PointerEvent) => {
      const press = pressed.current;
      if (!press) return;
      const dy = event.clientY - press.y;
      if (!dragged.current && Math.abs(dy) < THRESHOLD) return;
      dragged.current = true;
      const next = compute(press.name, dy);
      if (next) {
        current.current = next;
        setDrag(next);
      }
    };
    const onUp = () => {
      const press = pressed.current;
      pressed.current = null;
      if (!press || !dragged.current) return;
      const last = current.current;
      current.current = null;
      setDrag(null);
      if (last) {
        const { names: order, onMove: move } = latest.current;
        const to = order[last.target];
        if (to && to !== last.name) move(last.name, to);
      }
      // Le clic qui suit le relâchement ne doit pas replier le dossier.
      setTimeout(() => (dragged.current = false), 0);
    };
    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /** À poser sur l'en-tête du dossier : un appui hors des boutons prépare un glissement. */
  const headerProps = (name: string) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("[data-nodrag]")) return;
      pressed.current = { name, y: event.clientY };
      dragged.current = false;
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (dragged.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  });

  /** Le style d'un dossier pendant le glissement : soulevé s'il est saisi, décalé s'il doit s'écarter. */
  const styleOf = (name: string): { style: CSSProperties; lifted: boolean } => {
    if (!drag) return { style: {}, lifted: false };
    if (drag.name === name) return { style: { transform: `translateY(${drag.dy}px)`, transition: "none" }, lifted: true };
    const index = latest.current.names.indexOf(name);
    let shift = 0;
    if (drag.from < drag.target && index > drag.from && index <= drag.target) shift = -drag.height;
    if (drag.from > drag.target && index >= drag.target && index < drag.from) shift = drag.height;
    return { style: { transform: `translateY(${shift}px)` }, lifted: false };
  };

  return { register, headerProps, styleOf, dragging: drag !== null };
}
