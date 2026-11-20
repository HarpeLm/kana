import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { languageExtension } from "../lib/codeLanguages";
import { codeTheme } from "../lib/codeTheme";
import { languageOf } from "../lib/fileKinds";

interface CodeEditorProps {
  path: string;
  value: string;
  readOnly: boolean;
  /** Affiché : l'éditeur prend le focus à l'affichage. */
  active: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
}

/**
 * Éditeur de code : coloration, numéros de ligne, retour à la ligne, annuler/rétablir,
 * recherche (⌘F) et enregistrement (⌘S).
 */
export default function CodeEditor({ path, value, readOnly, active, onChange, onSave }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  });

  // Un éditeur par fichier. `value` et `readOnly` sont suivis par les effets suivants, pas ici.
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          EditorView.lineWrapping,
          languageExtension(languageOf(path)),
          codeTheme,
          editable.current.of(EditorState.readOnly.of(readOnly)),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Le texte change depuis l'extérieur (rechargement du fichier) : on remplace le contenu.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    if (active) view.current?.focus();
  }, [active]);

  return <div ref={host} className="h-full" />;
}
