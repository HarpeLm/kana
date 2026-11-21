import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";

/** Distance minimale avant qu'un appui devienne un glissement (sinon c'est un simple clic). */
const THRESHOLD = 5;
/** Marge entre deux dossiers (mt-6). */
const GAP = 24;
/** Espace laissé entre le dossier saisi et le haut / le bas de la liste, pour qu'il ne colle jamais aux boutons fixes. */
const INSET_TOP = 10;
const INSET_BOTTOM = 16;
/** Durée de l'animation de pose (doit correspondre à `duration-200` des dossiers). */
const SETTLE_MS = 200;

interface Drag {
  name: string;
  dy: number;
  from: number;
  target: number;
  height: number;
  /** Le dossier est lâché : il glisse vers sa place avant que l'ordre change vraiment. */
  settling: boolean;
}

/**
 * Glisser-déposer des dossiers de la barre latérale, à la souris : le dossier saisi se soulève et suit
 * le curseur, les autres s'écartent en glissant pour lui faire de la place, et il glisse jusqu'à sa
 * place quand on le lâche. Toutes les positions sont lues dans la mise en page (`offsetTop`), pas à
 * l'écran : ce que les décalages en cours déplacent ne fausse donc jamais le calcul (sinon ça sautille).
 * `names` : les dossiers déplaçables, dans l'ordre affiché.
 */
export function useSectionDrag(
  names: string[],
  onMove: (from: string, to: string) => void,
  /** La zone qui défile (positionnée) : le dossier saisi ne peut pas en sortir. */
  bounds?: RefObject<HTMLElement | null>,
) {
  const elements = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Un instant après la pose : plus aucune animation, le temps que l'ordre change sans que rien ne bouge. */
  const [resetting, setResetting] = useState(false);
  const current = useRef<Drag | null>(null);
  const pressed = useRef<{ name: string; y: number } | null>(null);
  const dragged = useRef(false);
  const latest = useRef({ names, onMove });
  useEffect(() => {
    latest.current = { names, onMove };
  });

  // Pendant le glissement, le curseur reste une main fermée partout et le texte ne se sélectionne pas.
  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    document.body.classList.add("kana-grabbing");
    return () => document.body.classList.remove("kana-grabbing");
  }, [active]);

  const register = useCallback(
    (name: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(name, element);
      else elements.current.delete(name);
    },
    [],
  );

  /** Positions et hauteurs de mise en page de tous les dossiers, ou `null` s'il en manque. */
  const layout = () => {
    const els = latest.current.names.map((n) => elements.current.get(n));
    if (els.some((e) => !e)) return null;
    return { tops: els.map((e) => e!.offsetTop), heights: els.map((e) => e!.offsetHeight) };
  };

  const compute = (name: string, rawDy: number): Drag | null => {
    const from = latest.current.names.indexOf(name);
    const spots = layout();
    if (from < 0 || !spots) return null;
    const { tops, heights } = spots;
    let dy = rawDy;
    // Le dossier saisi reste dans la zone de la liste : jamais par-dessus la navigation ni les réglages.
    const area = bounds?.current;
    if (area) {
      const min = area.scrollTop - tops[from] + INSET_TOP;
      const max = area.scrollTop + area.clientHeight - (tops[from] + heights[from]) - INSET_BOTTOM;
      dy = Math.min(Math.max(dy, min), Math.max(min, max));
    }
    const center = tops[from] + heights[from] / 2 + dy;
    // La place d'arrivée : combien d'autres dossiers ont leur milieu au-dessus du dossier saisi.
    const target = tops.filter((top, i) => i !== from && top + heights[i] / 2 < center).length;
    return { name, dy, from, target, height: heights[from] + GAP, settling: false };
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
      // Le clic qui suit le relâchement ne doit pas replier le dossier.
      setTimeout(() => (dragged.current = false), 0);

      const last = current.current;
      current.current = null;
      if (!last) return;
      const spots = layout();
      if (!spots) {
        setDrag(null);
        return;
      }
      // Le dossier glisse jusqu'à sa place : en bas de l'ancienne place de celui qu'il dépasse, ou en haut de la sienne.
      const { tops, heights } = spots;
      const finalDy =
        last.target > last.from
          ? tops[last.target] + heights[last.target] - heights[last.from] - tops[last.from]
          : tops[last.target] - tops[last.from];
      setDrag({ ...last, dy: finalDy, settling: true });
      window.setTimeout(() => {
        const { names: order, onMove: move } = latest.current;
        const to = order[last.target];
        // L'ordre change et les décalages disparaissent dans le même rendu, sans animation : rien ne saute.
        setResetting(true);
        setDrag(null);
        if (to && to !== last.name) move(last.name, to);
        // Un court instant sans animation (une minuterie, car un affichage en arrière-plan n'appelle pas requestAnimationFrame).
        window.setTimeout(() => setResetting(false), 60);
      }, SETTLE_MS);
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
      if (drag?.settling) return;
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
    if (resetting) return { style: { transition: "none" }, lifted: false };
    if (!drag) return { style: {}, lifted: false };
    if (drag.name === name) {
      return {
        style: {
          transform: `translateY(${drag.dy}px)`,
          // Suit le curseur sans retard ; une fois lâché, glisse jusqu'à sa place.
          transition: drag.settling ? `transform ${SETTLE_MS}ms ease-out` : "none",
        },
        lifted: true,
      };
    }
    const index = latest.current.names.indexOf(name);
    let shift = 0;
    if (drag.from < drag.target && index > drag.from && index <= drag.target) shift = -drag.height;
    if (drag.from > drag.target && index >= drag.target && index < drag.from) shift = drag.height;
    return { style: { transform: `translateY(${shift}px)` }, lifted: false };
  };

  return { register, headerProps, styleOf, dragging: drag !== null };
}
