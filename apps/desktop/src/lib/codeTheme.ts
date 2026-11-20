import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { TERMINAL_FONT } from "./terminalTheme";

const ACTIVE = "#1f1f1d";

const view = EditorView.theme(
  {
    "&": { height: "100%", color: "#ececec", backgroundColor: "#181817", fontSize: "13px" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: TERMINAL_FONT,
      lineHeight: "1.6",
      overflow: "auto",
      // Le lissage « antialiased » de l'app amincit le texte clair sur fond sombre : ici on le rétablit.
      "-webkit-font-smoothing": "subpixel-antialiased",
    },
    ".cm-content": { caretColor: "#d97757", padding: "8px 0", fontWeight: "500" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#d97757" },
    ".cm-gutters": { backgroundColor: "#181817", color: "#8b8a83", border: "none" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px", minWidth: "44px" },
    ".cm-activeLine": { backgroundColor: ACTIVE },
    ".cm-activeLineGutter": { backgroundColor: ACTIVE, color: "#e0dfd8" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#3d3d39",
    },
    ".cm-selectionMatch": { backgroundColor: "#2e2e2b" },
    ".cm-matchingBracket": { backgroundColor: "#3a3a37", outline: "none" },
    ".cm-panels": { backgroundColor: "#21211f", color: "#d4d3cb", borderColor: "#2b2b28" },
    ".cm-search": { fontFamily: "inherit", fontSize: "13px" },
    ".cm-search input, .cm-search button": {
      backgroundColor: "#1d1d1b",
      border: "1px solid #343430",
      borderRadius: "6px",
      color: "#e6e5df",
      padding: "2px 6px",
    },
    ".cm-searchMatch": { backgroundColor: "#4a3a1f" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#6b4f1f" },
  },
  { dark: true },
);

// Palette inspirée de VS Code « Dark+ », avancée en luminosité et en saturation pour le fond sombre de Kana.
const highlight = HighlightStyle.define([
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#e68cf5" },
  { tag: [t.keyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.self], color: "#4fb3ff" },
  { tag: [t.string, t.special(t.string)], color: "#ffa66b" },
  { tag: [t.escape], color: "#ffd27a" },
  { tag: [t.regexp], color: "#ff7a7a" },
  { tag: [t.number, t.integer, t.float], color: "#8ee073" },
  { tag: [t.bool, t.null, t.atom], color: "#4fb3ff" },
  { tag: [t.typeName, t.className, t.namespace], color: "#3de0c0" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#ffe08a" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#85d4ff" },
  { tag: [t.propertyName, t.attributeName], color: "#85d4ff" },
  { tag: [t.tagName], color: "#4fb3ff" },
  { tag: [t.heading], color: "#4fb3ff", fontWeight: "bold" },
  { tag: [t.strong], fontWeight: "bold" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#5aa9ff", textDecoration: "underline" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#7ab55c" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#ececec" },
  { tag: [t.meta, t.processingInstruction], color: "#4fb3ff" },
]);

/** Thème de l'éditeur : couleurs de l'app et coloration syntaxique. */
export const codeTheme = [view, syntaxHighlighting(highlight)];
