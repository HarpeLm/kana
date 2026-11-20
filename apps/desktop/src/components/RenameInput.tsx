import { useRef, useState } from "react";

interface RenameInputProps {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}

/** Champ de renommage : Entrée ou perte du focus valide, Échap annule. */
export default function RenameInput({ initial, onCommit, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      aria-label="Nom de la conversation"
      className="h-8 w-full rounded-lg border border-[#4a4a44] bg-[#1d1d1b] px-2 text-[14px] text-[#ecebe4] outline-none select-text"
    />
  );
}
