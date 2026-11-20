import type { ComponentProps, ReactNode } from "react";
import Toolbar from "./Toolbar";

interface HeaderProps {
  /** Boutons de navigation, affichés ici seulement quand la barre latérale est masquée. */
  leading?: ReactNode;
  /** Titre de la conversation ou de l'écran. */
  children: ReactNode;
  toolbar: ComponentProps<typeof Toolbar>;
}

export default function Header({ leading, children, toolbar }: HeaderProps) {
  return (
    <header className="flex h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[#262623] px-3">
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        {children}
      </div>
      <Toolbar {...toolbar} />
    </header>
  );
}
