import { tr, useLocale } from "../lib/i18n";

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-[#4a4a46] bg-[#333330] px-1.5 text-[12px] leading-5 text-[#c4c3bc]">
      {children}
    </kbd>
  );
}

function Hint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {keys.map((key) => (
        <Key key={key}>{key}</Key>
      ))}
    </span>
  );
}

/** Rappel des touches utiles en bas de la recherche. */
export default function SearchFooter() {
  const locale = useLocale();
  return (
    <div className="flex items-center gap-6 border-t border-[#343430] px-6 py-3 text-[13px] text-[#9a9992]">
      <Hint label={tr("Fermer", "Close", locale)} keys={["Esc"]} />
      <Hint label={tr("Changer de type", "Switch tab", locale)} keys={["←", "→"]} />
      <Hint label={tr("Ouvrir", "Open", locale)} keys={["↵"]} />
    </div>
  );
}
