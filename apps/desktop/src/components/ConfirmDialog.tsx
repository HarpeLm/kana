import { useEffect, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Boîte de confirmation modale : Échap ou un clic à côté annule, Entrée valide le bouton rouge. */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-[400px] rounded-2xl border border-[#3a3a37] bg-[#2b2b29] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      >
        <h2 id="confirm-title" className="text-[15px] font-medium text-[#f0efe9]">
          {title}
        </h2>
        <div className="mt-2 text-[14px] leading-[1.5] text-[#b3b2aa]">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg bg-[#41413d] px-3 py-1.5 text-[14px] text-[#e6e5df] transition hover:bg-[#4a4a46]"
          >
            Annuler
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className="rounded-lg border border-[#c9594a] bg-[#4a2622] px-3 py-1.5 text-[14px] text-[#f4a99b] outline-none transition hover:bg-[#5a2e29] focus-visible:ring-2 focus-visible:ring-[#c9594a]/60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
