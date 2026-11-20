import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { inTauri } from "../lib/env";
import {
  closeTerminal,
  onTerminalData,
  onTerminalExit,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from "../lib/terminal";
import { TERMINAL_FONT, TERMINAL_THEME } from "../lib/terminalTheme";

interface TerminalPanelProps {
  id: string;
  visible: boolean;
  onClose: () => void;
}

type Status = "starting" | "running" | "exited" | "error";

/**
 * Terminal en bas de la fenêtre. Une fois ouvert, le shell continue de tourner quand le panneau
 * est masqué : on retrouve la session et son historique en le rouvrant.
 */
export default function TerminalPanel({ id, visible, onClose }: TerminalPanelProps) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    const term = terminal.current;
    if (!term) return;
    setStatus("starting");
    try {
      await openTerminal(id, term.rows, term.cols);
      setStatus("running");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    if (!inTauri || !host.current) return;
    const term = new Terminal({
      fontFamily: TERMINAL_FONT,
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host.current);
    terminal.current = term;
    fit.current = fitAddon;

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    (async () => {
      unlisteners.push(await onTerminalData(id, (bytes) => term.write(bytes)));
      unlisteners.push(
        await onTerminalExit(id, () => {
          term.write("\r\n\x1b[2m[processus terminé]\x1b[0m\r\n");
          setStatus("exited");
        }),
      );
      if (!disposed) {
        fitAddon.fit();
        await start();
      }
    })();

    const input = term.onData((data) => void writeTerminal(id, data).catch(() => {}));
    const resized = term.onResize(({ rows, cols }) => void resizeTerminal(id, rows, cols).catch(() => {}));

    // Le panneau masqué a une taille nulle : on n'ajuste que lorsqu'il est affiché.
    const observer = new ResizeObserver(() => {
      if (host.current && host.current.offsetWidth > 0) fitAddon.fit();
    });
    observer.observe(host.current);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resized.dispose();
      unlisteners.forEach((off) => off());
      term.dispose();
      terminal.current = null;
      void closeTerminal(id).catch(() => {});
    };
  }, [id, start]);

  useEffect(() => {
    if (!visible) return;
    fit.current?.fit();
    terminal.current?.focus();
  }, [visible]);

  const restart = () => {
    terminal.current?.clear();
    void start();
  };

  return (
    <section
      aria-label="Terminal"
      className={`flex shrink-0 flex-col border-t border-[#2b2b28] bg-[#161614] ${
        visible ? "h-[300px]" : "hidden"
      }`}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#262623] pl-4 pr-1.5 text-[12px] text-[#9a9992]">
        <span>
          Terminal
          {status === "exited" && " · terminé"}
          {inTauri && status === "starting" && " · démarrage…"}
        </span>
        <div className="flex items-center gap-1">
          {status === "exited" && (
            <button
              onClick={restart}
              className="rounded-md px-2 py-0.5 text-[#e69b80] transition hover:bg-[#262624]"
            >
              Relancer
            </button>
          )}
          <button
            onClick={onClose}
            title="Fermer le terminal"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#c4c3bc] transition hover:bg-[#262624] hover:text-[#f0efe9]"
          >
            <X className="h-[15px] w-[15px]" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {inTauri ? (
        <div className="relative min-h-0 flex-1 px-3 py-2">
          <div ref={host} className="h-full w-full" />
          {status === "error" && (
            <p className="absolute inset-x-4 top-3 text-[13px] text-red-300">{error}</p>
          )}
        </div>
      ) : (
        <p className="p-4 text-[13px] text-[#8c8b83]">
          Le terminal fonctionne dans la fenêtre de l'app Kana, pas dans un navigateur.
        </p>
      )}
    </section>
  );
}
