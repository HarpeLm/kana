import { useEffect, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Texte du bouton d'annulation. */
  cancelLabel?: string;
  /** `danger` : bouton rouge (suppression) ; `accent` : bouton bleu marine (autorisation). */
  confirmTone?: "danger" | "accent";
  /** Bouton qui a le focus à l'ouverture : Entrée le valide. Pour une autorisation, c'est l'annulation. */
  initialFocus?: "confirm" | "cancel";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Boîte de confirmation modale : Échap ou un clic à côté annule, Entrée valide le bouton rouge. */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  confirmTone = "danger",
  initialFocus = "confirm",
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
            autoFocus={initialFocus === "cancel"}
            onClick={onCancel}
            className="rounded-lg bg-[#41413d] px-3 py-1.5 text-[14px] text-[#e6e5df] outline-none transition hover:bg-[#4a4a46] focus-visible:ring-2 focus-visible:ring-[#8a8982]/60"
          >
            {cancelLabel}
          </button>
          <button
            autoFocus={initialFocus === "confirm"}
            onClick={onConfirm}
            className={`rounded-lg border px-3 py-1.5 text-[14px] outline-none transition focus-visible:ring-2 ${
              confirmTone === "danger"
                ? "border-[#c9594a] bg-[#4a2622] text-[#f4a99b] hover:bg-[#5a2e29] focus-visible:ring-[#c9594a]/60"
                : "border-[#1e40af] bg-[#1e40af] font-medium text-[#f8fafc] hover:bg-[#2563eb] focus-visible:ring-[#3b82f6]/60"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
