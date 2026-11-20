import { useEffect, useRef, useState } from "react";

/** Historique « précédent / suivant » des conversations ouvertes. */
export function useNavHistory(currentId: string, open: (id: string) => void) {
  const [nav, setNav] = useState({ stack: [currentId], index: 0 });
  // Vrai juste après un précédent/suivant, pour ne pas ajouter cette étape à l'historique.
  const navigating = useRef(false);

  useEffect(() => {
    if (navigating.current) {
      navigating.current = false;
      return;
    }
    setNav((n) =>
      n.stack[n.index] === currentId
        ? n
        : { stack: [...n.stack.slice(0, n.index + 1), currentId], index: n.index + 1 },
    );
  }, [currentId]);

  const go = (delta: number) => {
    const target = nav.stack[nav.index + delta];
    if (target === undefined) return;
    navigating.current = target !== currentId;
    setNav({ ...nav, index: nav.index + delta });
    open(target);
  };

  return {
    canBack: nav.index > 0,
    canForward: nav.index < nav.stack.length - 1,
    back: () => go(-1),
    forward: () => go(1),
  };
}
