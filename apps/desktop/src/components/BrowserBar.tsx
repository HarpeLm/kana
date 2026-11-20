import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import ToolbarButton from "./ToolbarButton";

interface BrowserBarProps {
  address: string;
  loading: boolean;
  onAddressChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
}

/** Barre sous les onglets : précédent, suivant, actualiser et barre d'adresse. */
export default function BrowserBar(p: BrowserBarProps) {
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-1 border-b border-[#262623] px-3">
      <ToolbarButton title="Page précédente" onClick={p.onBack}>
        <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>
      <ToolbarButton title="Page suivante" onClick={p.onForward}>
        <ArrowRight className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>
      <ToolbarButton title="Actualiser" onClick={p.onReload}>
        <RotateCw className={`h-[16px] w-[16px] ${p.loading ? "animate-spin" : ""}`} strokeWidth={1.6} />
      </ToolbarButton>
      <input
        value={p.address}
        onChange={(e) => p.onAddressChange(e.target.value)}
        onFocus={(e) => {
          e.target.select();
          p.onFocusChange(true);
        }}
        onBlur={() => p.onFocusChange(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            p.onSubmit();
            e.currentTarget.blur();
          }
        }}
        placeholder="Rechercher ou saisir une adresse"
        aria-label="Adresse"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="ml-1 h-8 min-w-0 flex-1 rounded-lg border border-[#343430] bg-[#1d1d1b] px-3 text-[13px] text-[#ecebe4] placeholder-[#6c6b65] outline-none focus:border-[#4a4a44] select-text"
      />
    </div>
  );
}
