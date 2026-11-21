import { useCallback, useEffect, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { applyOp, editorPage, parse, serialize, type Op } from "../lib/htmlEdit";
import { EDITOR_SCRIPT } from "../lib/htmlEditorScript";

interface HtmlVisualEditorProps {
  /** Le texte HTML du fichier. */
  text: string;
  /** Fichier trop long ou verrouillé : on l'affiche sans pouvoir le modifier. */
  readOnly: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
}

interface Entry {
  undo: Op;
  redo: Op;
  at: number;
  /** Frappe dans un même texte : les changements rapprochés comptent pour un seul pas en arrière. */
  mergeable: boolean;
}

const MERGE_MS = 1500;
const SAVE_MS = 900;

/**
 * Une page HTML qu'on corrige directement dessus : on clique un texte pour le modifier (ajouter un mot au milieu d'une
 * phrase, retirer un mot), on survole une ligne pour la supprimer, Entrée en ajoute une. Le code n'apparaît jamais ;
 * le fichier est réécrit tout seul, avec seulement ces changements.
 */
export default function HtmlVisualEditor({ text, readOnly, onChange, onSave }: HtmlVisualEditorProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const original = useRef<Document | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callbacks = useRef({ onChange, onSave });
  const [srcDoc, setSrcDoc] = useState("");
  /** Chaque nouvelle page crée un nouveau cadre : changer le contenu d'un cadre déjà chargé le laisse parfois vide. */
  const [pageId, setPageId] = useState(0);
  const [, refresh] = useState(0);

  useEffect(() => {
    callbacks.current = { onChange, onSave };
  });

  // La page est lue au premier affichage, et de nouveau si le fichier change ailleurs (rechargement).
  useEffect(() => {
    if (text === lastEmitted.current) return;
    const doc = parse(text);
    original.current = doc;
    undoStack.current = [];
    redoStack.current = [];
    lastEmitted.current = text;
    setSrcDoc(editorPage(doc, readOnly ? "" : EDITOR_SCRIPT));
    setPageId((n) => n + 1);
  }, [text, readOnly]);

  const emit = useCallback(() => {
    const doc = original.current;
    if (!doc) return;
    const out = serialize(doc);
    lastEmitted.current = out;
    callbacks.current.onChange(out);
    // Enregistré tout seul un instant après la dernière modification.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => callbacks.current.onSave(), SAVE_MS);
    refresh((n) => n + 1);
  }, []);

  /** Applique un changement fait dans le cadre (le cadre l'a déjà appliqué chez lui). */
  const record = useCallback(
    (op: Op, mergeable: boolean) => {
      const doc = original.current;
      if (!doc) return;
      const inverse = applyOp(doc, op);
      if (!inverse) return;
      const last = undoStack.current[undoStack.current.length - 1];
      const now = Date.now();
      if (mergeable && last?.mergeable && now - last.at < MERGE_MS && last.redo.kind === "set" && op.kind === "set" && JSON.stringify(last.redo.path) === JSON.stringify(op.path)) {
        last.redo = op;
        last.at = now;
      } else {
        undoStack.current.push({ undo: inverse, redo: op, at: now, mergeable });
      }
      redoStack.current = [];
      emit();
    },
    [emit],
  );

  /** Annuler ou rétablir : appliqué à la page et envoyé au cadre. */
  const step = useCallback(
    (direction: "undo" | "redo") => {
      const doc = original.current;
      const from = direction === "undo" ? undoStack.current : redoStack.current;
      const to = direction === "undo" ? redoStack.current : undoStack.current;
      const entry = from.pop();
      if (!doc || !entry) return;
      const op = direction === "undo" ? entry.undo : entry.redo;
      if (!applyOp(doc, op)) return;
      frame.current?.contentWindow?.postMessage({ kana: 1, cmd: op.kind, ...op }, "*");
      entry.mergeable = false;
      to.push(entry);
      emit();
    },
    [emit],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data?.kana) return;
      const m = event.data;
      if (m.kind === "text") record({ kind: "set", path: m.path, html: m.html }, true);
      else if (m.kind === "remove") record({ kind: "remove", path: m.path }, false);
      else if (m.kind === "insert") record({ kind: "insert", parent: m.parent, index: m.index, html: m.html }, false);
      else if (m.kind === "undo") step("undo");
      else if (m.kind === "redo") step("redo");
      else if (m.kind === "save") callbacks.current.onSave();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(saveTimer.current);
    };
  }, [record, step]);

  return (
    <div className="relative h-full bg-white">
      {!readOnly && (
        <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-xl border border-[#3a3a37] bg-[#232321]/95 px-1.5 py-1 text-[#c4c3bc] shadow-lg">
          <button
            onClick={() => step("undo")}
            disabled={undoStack.current.length === 0}
            title="Annuler (⌘Z)"
            aria-label="Annuler"
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-[#333331] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <button
            onClick={() => step("redo")}
            disabled={redoStack.current.length === 0}
            title="Rétablir (⇧⌘Z)"
            aria-label="Rétablir"
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-[#333331] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <span className="px-1.5 text-[11.5px] text-[#8c8b83]">Clique un texte pour le modifier</span>
        </div>
      )}
      {/* Aucun accès à Kana ni à l'ordinateur : le cadre est isolé, et la page y a été neutralisée. */}
      {srcDoc && (
        <iframe key={pageId} ref={frame} title="Page" srcDoc={srcDoc} sandbox="allow-scripts" className="h-full w-full border-0 bg-white" />
      )}
    </div>
  );
}
