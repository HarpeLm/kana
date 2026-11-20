import { useEffect, useState } from "react";
import { ArrowUp, FileText, Square, X } from "lucide-react";
import { fileName, pickFiles, withAttachments } from "../lib/attachments";
import type { PermissionMode } from "../lib/permissionMode";
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

  const attach = (directory = false) => {
    pickFiles(directory)
      .then((paths) => setFiles((current) => [...new Set([...current, ...paths])]))
      .catch(() => {});
  };

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
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5 px-1">
            {files.map((path) => (
              <li
                key={path}
                title={path}
                className="flex max-w-[260px] items-center gap-1.5 rounded-full bg-[#232322] py-1 pl-2.5 pr-1.5 text-[12px] text-[#c4c3bc]"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#8c8b83]" strokeWidth={1.6} />
                <span className="truncate">{fileName(path)}</span>
                <button
                  onClick={() => setFiles((current) => current.filter((p) => p !== path))}
                  aria-label={`Retirer ${fileName(path)}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#8c8b83] hover:bg-[#333331] hover:text-[#ecebe4]"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 rounded-full border border-[#2f2f2d] bg-[#232322] py-2 pl-2.5 pr-2.5 transition focus-within:border-[#454542]">
          <PlusMenu onAddFiles={() => attach()} onAddFolder={() => attach(true)} onSlash={() => setText((t) => (t ? t : "/"))} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
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
