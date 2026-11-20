import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  closeTerminal,
  onTerminalData,
  onTerminalExit,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from "../lib/terminal";
import { TERMINAL_FONT, TERMINAL_THEME } from "../lib/terminalTheme";

export interface TerminalHandle {
  clear: () => void;
  restart: () => void;
}

interface TerminalViewProps {
  /** Identifiant du shell côté Rust. */
  id: string;
  /** Affiché ou masqué (un onglet masqué garde son shell et son historique). */
  active: boolean;
  ref?: Ref<TerminalHandle>;
}

type Status = "starting" | "running" | "exited" | "error";

/** Un terminal : un shell, affiché avec xterm.js. */
export default function TerminalView({ id, active, ref }: TerminalViewProps) {
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

  useImperativeHandle(
    ref,
    () => ({
      clear: () => terminal.current?.clear(),
      restart: () => {
        terminal.current?.clear();
        void start();
      },
    }),
    [start],
  );

  useEffect(() => {
    if (!host.current) return;
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
    // On écoute avant d'ouvrir le shell, sinon le début de sa sortie serait perdu.
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
    const resized = term.onResize(
      ({ rows, cols }) => void resizeTerminal(id, rows, cols).catch(() => {}),
    );

    // Un terminal masqué a une taille nulle : on n'ajuste que lorsqu'il est affiché.
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
    if (!active) return;
    fit.current?.fit();
    terminal.current?.focus();
  }, [active]);

  return (
    <div className={`relative h-full w-full px-4 py-3 ${active ? "" : "hidden"}`}>
      <div ref={host} className="h-full w-full" />
      {status === "exited" && (
        <button
          onClick={() => {
            terminal.current?.clear();
            void start();
          }}
          className="absolute right-4 top-3 rounded-md bg-[#2b2b29] px-2 py-1 text-[12px] text-[#e69b80] transition hover:bg-[#383835]"
        >
          Relancer
        </button>
      )}
      {status === "error" && (
        <p className="absolute inset-x-4 top-3 text-[13px] text-red-300">{error}</p>
      )}
    </div>
  );
}
