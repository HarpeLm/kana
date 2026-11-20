import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { TERMINAL_FONT } from "./terminalTheme";

const ACTIVE = "#1f1f1d";

const view = EditorView.theme(
  {
    "&": { height: "100%", color: "#d4d3cb", backgroundColor: "#181817", fontSize: "13px" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: TERMINAL_FONT, lineHeight: "1.6", overflow: "auto" },
    ".cm-content": { caretColor: "#d97757", padding: "8px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#d97757" },
    ".cm-gutters": { backgroundColor: "#181817", color: "#6c6b65", border: "none" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px", minWidth: "44px" },
    ".cm-activeLine": { backgroundColor: ACTIVE },
    ".cm-activeLineGutter": { backgroundColor: ACTIVE, color: "#c4c3bc" },
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

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "#e69b80" },
  { tag: [t.propertyName, t.attributeName], color: "#e69b80" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#9bd4a6" },
  { tag: [t.number, t.integer, t.float], color: "#8ab9f0" },
  { tag: [t.bool, t.null, t.atom], color: "#c792ea" },
  { tag: [t.typeName, t.className, t.namespace], color: "#e0b25f" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#8ab9f0" },
  { tag: [t.tagName], color: "#e69b80" },
  { tag: [t.heading, t.strong], color: "#8ab9f0", fontWeight: "bold" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#6aa6e8" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#787770", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#a3a29a" },
  { tag: [t.meta, t.processingInstruction], color: "#8ab9f0" },
]);

/** Thème de l'éditeur : couleurs de l'app et coloration syntaxique. */
export const codeTheme = [view, syntaxHighlighting(highlight)];
