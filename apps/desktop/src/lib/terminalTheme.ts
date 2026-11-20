import type { ITheme } from "@xterm/xterm";

export const TERMINAL_FONT =
  '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/** Couleurs du terminal, accordées au reste de l'application. */
export const TERMINAL_THEME: ITheme = {
  background: "#181817",
  foreground: "#d4d3cb",
  cursor: "#d97757",
  cursorAccent: "#181817",
  selectionBackground: "#3d3d39",
  black: "#2b2b29",
  red: "#e5786d",
  green: "#7fc08c",
  yellow: "#e0b25f",
  blue: "#6aa6e8",
  magenta: "#c792ea",
  cyan: "#6fc3c9",
  white: "#d4d3cb",
  brightBlack: "#6c6b65",
  brightRed: "#f0968c",
  brightGreen: "#9bd4a6",
  brightYellow: "#ecc87f",
  brightBlue: "#8ab9f0",
  brightMagenta: "#d6aaf2",
  brightCyan: "#8fd2d7",
  brightWhite: "#f0efe9",
};
