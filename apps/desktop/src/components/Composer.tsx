import { useEffect, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useDroppedFiles } from "../hooks/useDroppedFiles";
import { pickFiles, withAttachments } from "../lib/attachments";
import type { PermissionMode } from "../lib/permissionMode";
import AttachmentList from "./AttachmentList";
import ModeMenu from "./ModeMenu";
import PlusMenu from "./PlusMenu";

interface ComposerProps {
  agentLabel: string;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

export default function Composer({ agentLabel, busy, onSend, onStop, mode, onModeChange }: ComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);

  const addFiles = (paths: string[]) => setFiles((current) => [...new Set([...current, ...paths])]);
  const attach = (directory = false) => {
    pickFiles(directory).then(addFiles).catch(() => {});
  };
  // Un fichier déposé sur la fenêtre depuis le Finder rejoint les pièces jointes.
  const dragging = useDroppedFiles(addFiles);

  // Cmd+U ouvre le sélecteur de fichiers, comme dans Claude.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        attach();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSend(withAttachments(value, files));
    setText("");
    setFiles([]);
  };

  return (
    <div className="px-6 pb-3 pt-2">
      <div className="mx-auto max-w-[740px]">
        <AttachmentList paths={files} onRemove={(path) => setFiles((current) => current.filter((p) => p !== path))} />
        <div
          className={`flex items-center gap-2 rounded-full border bg-[#232322] py-2 pl-2.5 pr-2.5 transition focus-within:border-[#454542] ${
            dragging ? "border-dashed border-[#2f6bd8] bg-[#232a38]" : "border-[#2f2f2d]"
          }`}
        >
          <PlusMenu onAddFiles={() => attach()} onAddFolder={() => attach(true)} onSlash={() => setText((t) => (t ? t : "/"))} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder={dragging ? "Dépose les fichiers ici" : "Demander à Kana d'écrire, refactorer ou déboguer..."}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
          />
          {busy ? (
            <button
              onClick={onStop}
              aria-label="Arrêter"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecebe4] transition hover:bg-white"
            >
              <Square className="h-3 w-3 fill-[#181817] text-[#181817]" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Envoyer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f6bd8] text-white transition hover:bg-[#4079e0] disabled:opacity-35"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <ModeMenu mode={mode} onChange={onModeChange} />
          <span className="pr-3 text-[12px] text-[#8c8b83]">{agentLabel} · ACP</span>
        </div>
      </div>
    </div>
  );
}
