import { AlertTriangle, X } from "lucide-react";

export interface RelayBannerProps {
  /** Ce qui ne va pas, en une phrase : « Limite atteinte sur Claude Code · reprise à 14:30 ». */
  message: string;
  /** Le fournisseur vers lequel on peut continuer, ou `null` s'il n'y en a aucun. */
  targetName: string | null;
  onSwitch: () => void;
  onDismiss: () => void;
  onOpenRelay: () => void;
}

/** Bandeau au-dessus de la saisie : le fournisseur de la conversation ne répond plus, voici comment continuer. */
export default function RelayBanner({ message, targetName, onSwitch, onDismiss, onOpenRelay }: RelayBannerProps) {
  return (
    <div className="px-6 pb-2">
      <div role="status" className="mx-auto flex max-w-[740px] items-center gap-3 rounded-2xl border border-[#d97757]/35 bg-[#d97757]/8 px-4 py-2.5 text-[13px]">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[#e69b80]" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 text-[#e6e5df]">{message}</span>
        {targetName ? (
          <button onClick={onSwitch} className="shrink-0 rounded-lg bg-[#d97757] px-3 py-1 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768]">
            Continuer avec {targetName}
          </button>
        ) : (
          <button onClick={onOpenRelay} className="shrink-0 rounded-lg bg-[#2e2e2b] px-3 py-1 text-[12px] text-[#e6e5df] transition hover:bg-[#383835]">
            Réglages du relais
          </button>
        )}
        <button onClick={onDismiss} aria-label="Ignorer" className="shrink-0 rounded-md p-1 text-[#9a9992] transition hover:bg-[#2e2e2b] hover:text-[#ecebe4]">
          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
