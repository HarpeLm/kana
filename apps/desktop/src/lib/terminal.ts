import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Unlisten = () => void;

export function openTerminal(id: string, rows: number, cols: number, cwd?: string): Promise<void> {
  return invoke("terminal_open", { id, cwd: cwd ?? null, rows, cols });
}

export function writeTerminal(id: string, data: string): Promise<void> {
  return invoke("terminal_write", { id, data });
}

export function resizeTerminal(id: string, rows: number, cols: number): Promise<void> {
  return invoke("terminal_resize", { id, rows, cols });
}

export function closeTerminal(id: string): Promise<void> {
  return invoke("terminal_close", { id });
}

/** La sortie arrive en base64 : une séquence UTF-8 peut être coupée entre deux morceaux. */
function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** À brancher avant d'ouvrir le terminal, sinon le début de la sortie est perdu. */
export function onTerminalData(id: string, handler: (bytes: Uint8Array) => void): Promise<Unlisten> {
  return listen<{ id: string; data: string }>("terminal-data", (event) => {
    if (event.payload.id === id) handler(decode(event.payload.data));
  });
}

export function onTerminalExit(id: string, handler: () => void): Promise<Unlisten> {
  return listen<{ id: string }>("terminal-exit", (event) => {
    if (event.payload.id === id) handler();
  });
}
