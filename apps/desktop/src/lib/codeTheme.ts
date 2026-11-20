import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { TERMINAL_FONT } from "./terminalTheme";

const ACTIVE = "#1f1f1d";

const view = EditorView.theme(
  {
    "&": { height: "100%", color: "#d4d4d4", backgroundColor: "#181817", fontSize: "13px" },
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

// Palette de VS Code (thème « Dark+ ») : des couleurs franches, reconnaissables.
const highlight = HighlightStyle.define([
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#c586c0" },
  { tag: [t.keyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.self], color: "#569cd6" },
  { tag: [t.string, t.special(t.string)], color: "#ce9178" },
  { tag: [t.escape], color: "#d7ba7d" },
  { tag: [t.regexp], color: "#d16969" },
  { tag: [t.number, t.integer, t.float], color: "#b5cea8" },
  { tag: [t.bool, t.null, t.atom], color: "#569cd6" },
  { tag: [t.typeName, t.className, t.namespace], color: "#4ec9b0" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#dcdcaa" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#9cdcfe" },
  { tag: [t.propertyName, t.attributeName], color: "#9cdcfe" },
  { tag: [t.tagName], color: "#569cd6" },
  { tag: [t.heading], color: "#569cd6", fontWeight: "bold" },
  { tag: [t.strong], fontWeight: "bold" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#3794ff", textDecoration: "underline" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6a9955" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#d4d4d4" },
  { tag: [t.meta, t.processingInstruction], color: "#569cd6" },
]);

/** Thème de l'éditeur : couleurs de l'app et coloration syntaxique. */
export const codeTheme = [view, syntaxHighlighting(highlight)];
