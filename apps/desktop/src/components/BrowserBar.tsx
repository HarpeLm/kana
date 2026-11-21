import { ArrowLeft, ArrowRight, Bug, CircleDot, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import ToolbarButton from "./ToolbarButton";

export type GlobeViewportPreset = "desktop" | "tablet" | "mobile";

interface BrowserBarProps {
  address: string;
  loading: boolean;
  onAddressChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  viewport?: GlobeViewportPreset;
  onViewportChange?: (preset: GlobeViewportPreset) => void;
  devToolsOpen?: boolean;
  errorCount?: number;
  onToggleDevTools?: () => void;
  traceRecording?: boolean;
  traceOpen?: boolean;
  traceCount?: number;
  onToggleTrace?: () => void;
}

/** Barre sous les onglets : précédent, suivant, actualiser, barre d'adresse, viewport, DevTools et Trace. */
export default function BrowserBar(p: BrowserBarProps) {
  const viewport = p.viewport ?? "desktop";
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
      {p.onViewportChange && (
        <div
          role="group"
          aria-label="Viewport responsive"
          className="ml-1 flex items-center rounded-lg border border-[#2f2f2b] bg-[#1d1d1b] p-0.5"
        >
          <button
            type="button"
            title="Viewport Bureau"
            aria-label="Viewport Bureau"
            aria-pressed={viewport === "desktop"}
            onClick={() => p.onViewportChange?.("desktop")}
            className={`flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors ${
              viewport === "desktop" ? "bg-[#30302c] text-[#ecebe4]" : "text-[#8c8b83] hover:text-[#cfcec6]"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Bureau</span>
          </button>
          <button
            type="button"
            title="Viewport Tablette 768px"
            aria-label="Viewport Tablette 768px"
            aria-pressed={viewport === "tablet"}
            onClick={() => p.onViewportChange?.("tablet")}
            className={`flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors ${
              viewport === "tablet" ? "bg-[#30302c] text-[#ecebe4]" : "text-[#8c8b83] hover:text-[#cfcec6]"
            }`}
          >
            <Tablet className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Tablette 768px</span>
          </button>
          <button
            type="button"
            title="Viewport Mobile 390px"
            aria-label="Viewport Mobile 390px"
            aria-pressed={viewport === "mobile"}
            onClick={() => p.onViewportChange?.("mobile")}
            className={`flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors ${
              viewport === "mobile" ? "bg-[#30302c] text-[#ecebe4]" : "text-[#8c8b83] hover:text-[#cfcec6]"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Mobile 390px</span>
          </button>
        </div>
      )}
      {p.onToggleDevTools && (
        <button
          type="button"
          title="DevTools (Console & Réseau)"
          aria-label="DevTools (Console & Réseau)"
          aria-pressed={!!p.devToolsOpen}
          onClick={p.onToggleDevTools}
          className={`relative flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors ${
            p.devToolsOpen
              ? "border-[#4b4b44] bg-[#2c2c28] text-[#ecebe4]"
              : "border-[#2f2f2b] bg-[#1d1d1b] text-[#a5a49c] hover:text-[#ecebe4]"
          }`}
        >
          <Bug className="h-3.5 w-3.5" strokeWidth={1.7} />
          <span>DevTools</span>
          {!!p.errorCount && p.errorCount > 0 && (
            <span className="rounded-full bg-[#6e2b2b] px-1.5 py-0.2 text-[10px] font-medium text-[#fca5a5]">
              {p.errorCount}
            </span>
          )}
        </button>
      )}
      {p.onToggleTrace && (
        <button
          type="button"
          title="Trace de session Globe"
          aria-label="Trace de session Globe"
          aria-pressed={!!p.traceOpen}
          onClick={p.onToggleTrace}
          className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors ${
            p.traceRecording
              ? "border-[#7c2d12] bg-[#3b1d16] text-[#fdba74]"
              : p.traceOpen
                ? "border-[#4b4b44] bg-[#2c2c28] text-[#ecebe4]"
                : "border-[#2f2f2b] bg-[#1d1d1b] text-[#a5a49c] hover:text-[#ecebe4]"
          }`}
        >
          <CircleDot className={`h-3.5 w-3.5 ${p.traceRecording ? "text-[#f97316]" : ""}`} strokeWidth={1.7} />
          <span>Trace</span>
          {!!p.traceCount && p.traceCount > 0 && (
            <span className="rounded-full bg-[#2e2e2a] px-1.5 text-[10px] text-[#d5d4cc]">{p.traceCount}</span>
          )}
        </button>
      )}
    </div>
  );
}
