import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Code2, CornerDownRight, FileText, Folder, ListPlus, Loader2, Mic, MicOff, Sparkles, Square, Terminal, X } from "lucide-react";
import { useDroppedFiles } from "../hooks/useDroppedFiles";
import type { AvailableCommand } from "../lib/acp";
import { pickFiles, readClipboardImages, withAttachments } from "../lib/attachments";
import { applyTrigger, detectTrigger, mergeCommands } from "../lib/chatState";
import { inTauri } from "../lib/env";
import { buildMentionItems, loadFileList, type FileList, type MentionItem, type MentionKind } from "../lib/files";
import { tr, useLocale } from "../lib/i18n";
import type { PermissionMode } from "../lib/permissionMode";
import {
  formatRecordingDuration,
  getSpeechRecognitionCtor,
  getVoiceCapabilities,
  mergeTranscript,
  transcribeAudioWithWhisper,
  triggerMacosDictation,
  type SpeechRecognitionLike,
  type VoiceCapabilities,
  type VoiceStatus,
} from "../lib/voice";
import AttachmentList from "./AttachmentList";
import ModeMenu from "./ModeMenu";
import PlusMenu from "./PlusMenu";

interface ComposerProps {
  agentLabel: string;
  busy: boolean;
  commands?: AvailableCommand[];
  queued?: string[];
  onSend: (text: string) => void;
  onStop: () => void;
  onRemoveQueued?: (index: number) => void;
  onSteerQueued?: (index: number) => void;
  workPath?: string;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  /** Remplace le mode, à gauche sous la ligne ; le mode passe alors à droite. */
  footerLeft?: ReactNode;
  /** Choix du fournisseur et du modèle, à droite sous la ligne ; sinon le nom de l'agent. */
  modelPicker?: ReactNode;
  placeholder?: string;
  onOpenExtensibility?: (tab: "mcp" | "plugins") => void;
}

const MENTION_FILTERS: Array<{ id: MentionKind | "all"; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "file", label: "Fichiers" },
  { id: "folder", label: "Dossiers" },
  { id: "symbol", label: "Symboles" },
  { id: "artifact", label: "Artéfacts" },
];

function MentionIcon({ kind }: { kind: MentionKind }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (kind === "folder") return <Folder className={`${cls} text-[#e0b25f]`} strokeWidth={1.7} />;
  if (kind === "symbol") return <Code2 className={`${cls} text-[#a371f7]`} strokeWidth={1.7} />;
  if (kind === "artifact") return <Sparkles className={`${cls} text-[#8ab4f8]`} strokeWidth={1.7} />;
  return <FileText className={`${cls} text-[#9a9992]`} strokeWidth={1.7} />;
}

const MENTION_KIND_LABEL: Record<MentionKind, string> = {
  file: "Fichier",
  folder: "Dossier",
  symbol: "Symbole",
  artifact: "Artéfact",
};

export default function Composer({
  agentLabel,
  busy,
  commands = [],
  queued = [],
  onSend,
  onStop,
  onRemoveQueued,
  onSteerQueued,
  workPath,
  mode,
  onModeChange,
  footerLeft,
  modelPicker,
  placeholder,
  onOpenExtensibility,
}: ComposerProps) {
  const locale = useLocale();
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [paletteClosed, setPaletteClosed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionFilter, setMentionFilter] = useState<MentionKind | "all">("all");
  const [fileList, setFileList] = useState<FileList | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceEngine, setVoiceEngine] = useState<"web-speech" | "whisper">("web-speech");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceCapabilities, setVoiceCapabilities] = useState<VoiceCapabilities | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortVoiceRef = useRef(false);
  const cursorRef = useRef(0);
  const toggleVoiceRef = useRef<() => void>(() => {});

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    let live = true;
    void getVoiceCapabilities().then((caps) => {
      if (live) setVoiceCapabilities(caps);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (voiceStatus !== "listening") return;
    setRecordingSeconds(0);
    const id = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [voiceStatus]);

  const stopVoice = (abort = false) => {
    abortVoiceRef.current = abort;
    const recognition = recognitionRef.current;
    if (recognition) {
      recognitionRef.current = null;
      try {
        if (abort) recognition.abort();
        else recognition.stop();
      } catch {
        // Ignorer si déjà arrêté.
      }
      setInterimTranscript("");
      if (!abort) setVoiceStatus("idle");
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignorer si déjà arrêté.
      }
    } else if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
      if (!abort) setVoiceStatus("idle");
    }
  };

  useEffect(() => {
    return () => {
      stopVoice(true);
    };
  }, []);

  const insertDictatedText = (dictated: string) => {
    if (!dictated.trim()) return;
    setText((prev) => {
      const merged = mergeTranscript(prev, dictated, cursorRef.current);
      cursorRef.current = merged.cursor;
      setCursor(merged.cursor);
      return merged.text;
    });
    setPaletteClosed(false);
  };

  const startVoice = async () => {
    if (voiceStatus === "listening" || voiceStatus === "transcribing") {
      stopVoice(false);
      return;
    }

    abortVoiceRef.current = false;
    setVoiceError(null);
    setInterimTranscript("");

    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const recognition = new SpeechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = locale === "fr" ? "fr-FR" : "en-US";
        recognitionRef.current = recognition;
        setVoiceEngine("web-speech");
        setVoiceStatus("listening");

        recognition.onresult = (event) => {
          let finalChunk = "";
          let interimChunk = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = result?.[0]?.transcript ?? "";
            if (!transcript) continue;
            if (result.isFinal) {
              finalChunk += `${finalChunk ? " " : ""}${transcript.trim()}`;
            } else {
              interimChunk += `${interimChunk ? " " : ""}${transcript.trim()}`;
            }
          }
          setInterimTranscript(interimChunk);
          if (finalChunk) {
            insertDictatedText(finalChunk);
          }
        };

        recognition.onerror = (event) => {
          if (abortVoiceRef.current && event.error === "aborted") return;
          recognitionRef.current = null;
          setInterimTranscript("");
          const msg =
            event.error === "not-allowed" || event.error === "service-not-allowed"
              ? tr("Accès au microphone refusé. Autorise le micro dans les réglages système.", "Microphone access denied. Allow microphone access in system settings.", locale)
              : event.error === "no-speech"
                ? tr("Aucune voix détectée. Réessaie en parlant plus près du micro.", "No speech detected. Try speaking closer to the microphone.", locale)
                : tr("Erreur de dictée vocale.", "Voice dictation error.", locale);
          setVoiceError(msg);
          setVoiceStatus("error");
        };

        recognition.onend = () => {
          if (recognitionRef.current === recognition) {
            recognitionRef.current = null;
            setInterimTranscript("");
            setVoiceStatus((current) => (current === "listening" ? "idle" : current));
          }
        };

        recognition.start();
        textareaRef.current?.focus();
      } catch {
        recognitionRef.current = null;
        setVoiceError(tr("Impossible de démarrer la reconnaissance vocale.", "Unable to start speech recognition.", locale));
        setVoiceStatus("error");
      }
      return;
    }

    const caps = voiceCapabilities ?? (await getVoiceCapabilities());
    setVoiceCapabilities(caps);

    if (
      inTauri &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined" &&
      caps.whisperAvailable
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        setVoiceEngine("whisper");
        setVoiceStatus("listening");

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const streamToClose = mediaStreamRef.current;
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          if (streamToClose) {
            for (const track of streamToClose.getTracks()) {
              track.stop();
            }
          }
          if (abortVoiceRef.current) {
            audioChunksRef.current = [];
            return;
          }
          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];
          if (chunks.length === 0) {
            setVoiceStatus("idle");
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          setVoiceStatus("transcribing");
          void transcribeAudioWithWhisper(blob, locale === "fr" ? "fr" : "en")
            .then((transcript) => {
              if (transcript.trim()) {
                insertDictatedText(transcript);
              }
              setVoiceStatus("idle");
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              setVoiceError(message || tr("Échec de la transcription Whisper locale.", "Local Whisper transcription failed.", locale));
              setVoiceStatus("error");
            });
        };

        recorder.start();
        textareaRef.current?.focus();
      } catch {
        setVoiceError(tr("Impossible d'accéder au microphone pour Whisper local.", "Unable to access the microphone for local Whisper.", locale));
        setVoiceStatus("error");
      }
      return;
    }

    if (inTauri && caps.macosDictationSupported) {
      textareaRef.current?.focus();
      void triggerMacosDictation();
      return;
    }

    setVoiceError(
      tr(
        "Active la dictée native macOS (Fn Fn) ou installe whisper-cpp (brew install whisper-cpp).",
        "Enable native macOS Dictation (Fn Fn) or install whisper-cpp (brew install whisper-cpp).",
        locale,
      ),
    );
    setVoiceStatus("error");
  };

  toggleVoiceRef.current = () => {
    void startVoice();
  };

  const addFiles = (paths: string[]) => setFiles((current) => [...new Set([...current, ...paths])]);
  const attach = (directory = false) => {
    pickFiles(directory).then(addFiles).catch(() => {});
  };
  // Un fichier déposé sur la fenêtre depuis le Finder rejoint les pièces jointes.
  const dragging = useDroppedFiles(addFiles);

  // Cmd+U ouvre le sélecteur de fichiers, Alt+Espace démarre/arrête la dictée vocale.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        attach();
        return;
      }
      if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        toggleVoiceRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Repli de redimensionnement vertical lorsque `field-sizing: content` n'est pas géré.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const trigger = !paletteClosed ? detectTrigger(text, cursor) : null;
  const triggerKind = trigger?.kind ?? null;
  const triggerQuery = trigger?.query ?? "";

  useEffect(() => {
    if (triggerKind !== "mention") return;
    let live = true;
    loadFileList(workPath)
      .then((list) => {
        if (live) setFileList(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [triggerKind, workPath]);

  useEffect(() => {
    setActiveIndex(0);
  }, [triggerKind, triggerQuery, mentionFilter]);

  const slashItems = trigger?.kind === "slash" ? mergeCommands(commands, trigger.query) : [];
  const mentionItems = trigger?.kind === "mention" ? buildMentionItems(fileList, trigger.query, mentionFilter) : [];
  const itemCount = trigger?.kind === "slash" ? slashItems.length : mentionItems.length;
  const safeIndex = itemCount > 0 ? Math.min(activeIndex, itemCount - 1) : 0;
  const paletteOpen = trigger !== null && (trigger.kind === "mention" || slashItems.length > 0);

  const updateCursor = () => {
    const el = textareaRef.current;
    if (el) setCursor(el.selectionStart ?? text.length);
  };

  const insertCompletion = (replacement: string) => {
    if (!trigger) return;
    const applied = applyTrigger(text, trigger, replacement);
    setText(applied.text);
    setCursor(applied.cursor);
    setPaletteClosed(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el || el.value !== applied.text) return;
      el.focus();
      el.setSelectionRange(applied.cursor, applied.cursor);
    });
  };

  const applySlashCommand = (cmd: AvailableCommand) => {
    insertCompletion(`/${cmd.name}`);
  };

  const applyMentionItem = (item: MentionItem) => {
    insertCompletion(`@${item.insert}`);
  };

  const submit = () => {
    if (voiceStatus === "listening") {
      stopVoice(false);
    }
    const value = text.trim();
    if (!value && files.length === 0) return;
    onSend(withAttachments(value || tr("Analyse ces fichiers joints.", "Analyze these attached files.", locale), files));
    setText("");
    setCursor(0);
    cursorRef.current = 0;
    setFiles([]);
    setPaletteClosed(false);
    setMentionFilter("all");
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = event.clipboardData;
    if (!dt) return;
    const hasImage =
      Array.from(dt.items ?? []).some((item) => item.kind === "file" && item.type.startsWith("image/")) ||
      Array.from(dt.files ?? []).some((file) => file.type.startsWith("image/"));
    if (!hasImage) return;
    if (!dt.getData("text/plain")) event.preventDefault();
    void readClipboardImages(dt).then((paths) => {
      if (paths.length > 0) addFiles(paths);
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen) {
      if (event.key === "ArrowDown" && itemCount > 0) {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % itemCount);
        return;
      }
      if (event.key === "ArrowUp" && itemCount > 0) {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + itemCount) % itemCount);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setPaletteClosed(true);
        return;
      }
      if (event.key === "Tab" && itemCount > 0) {
        event.preventDefault();
        if (trigger?.kind === "slash") applySlashCommand(slashItems[safeIndex]);
        else if (trigger?.kind === "mention") applyMentionItem(mentionItems[safeIndex]);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && itemCount > 0) {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        event.preventDefault();
        if (trigger?.kind === "slash") {
          const chosen = slashItems[safeIndex];
          if (text.trim() === `/${chosen.name}`) submit();
          else applySlashCommand(chosen);
        } else if (trigger?.kind === "mention") {
          applyMentionItem(mentionItems[safeIndex]);
        }
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      submit();
    }
  };

  const openSlashMenu = () => {
    const next = text.trim() ? text : "/";
    setText(next);
    setCursor(next.length);
    setPaletteClosed(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  };

  return (
    <div className="px-6 pb-3 pt-2">
      <div className="relative mx-auto max-w-[740px]">
        {queued.length > 0 && (
          <div className="mb-2 space-y-1.5 rounded-2xl border border-[#2f2f2d] bg-[#1e1e1c] p-2">
            {queued.map((item, index) => (
              <div key={`${index}-${item.slice(0, 16)}`} className="flex items-center gap-2 rounded-xl bg-[#252523] px-2.5 py-1.5 text-[12.5px]">
                <span className="shrink-0 rounded-full bg-[#2f6bd8]/20 px-2 py-0.5 text-[11px] font-medium text-[#7db4ff]">
                  {tr("En attente", "Queued", locale)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#dcdbd3]">{item}</span>
                {onSteerQueued && (
                  <button
                    type="button"
                    onClick={() => onSteerQueued(index)}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[11.5px] text-[#e6e5df] transition hover:bg-[#333331]"
                    title={tr("Interrompre le tour actuel et envoyer ce message maintenant", "Interrupt current turn and send this message now", locale)}
                  >
                    <CornerDownRight className="h-3 w-3" strokeWidth={1.8} />
                    {tr("Envoyer maintenant", "Send now", locale)}
                  </button>
                )}
                {onRemoveQueued && (
                  <button
                    type="button"
                    onClick={() => onRemoveQueued(index)}
                    aria-label={tr("Retirer de la file", "Remove from queue", locale)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#8c8b83] transition hover:bg-[#333331] hover:text-[#ecebe4]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <AttachmentList paths={files} onRemove={(path) => setFiles((current) => current.filter((p) => p !== path))} />

        {paletteOpen && (
          <div
            role="listbox"
            aria-label={trigger?.kind === "slash" ? "Commandes slash" : "Mentions"}
            onMouseDown={(e) => e.preventDefault()}
            className="mb-2 overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#252523] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
          >
            {trigger?.kind === "mention" && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1 border-b border-[#32322f] px-1.5 pb-1.5">
                {MENTION_FILTERS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMentionFilter(tab.id)}
                    className={`rounded-lg px-2 py-0.5 text-[11.5px] transition ${
                      mentionFilter === tab.id
                        ? "bg-[#383834] text-[#ecebe4]"
                        : "text-[#8c8b83] hover:bg-[#2f2f2c] hover:text-[#dcdbd3]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[240px] overflow-y-auto">
              {trigger?.kind === "slash" ? (
                slashItems.map((cmd, index) => (
                  <button
                    key={cmd.name}
                    type="button"
                    role="option"
                    aria-selected={index === safeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => applySlashCommand(cmd)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px] transition ${
                      index === safeIndex ? "bg-[#363633] text-[#ecebe4]" : "text-[#d4d3cb] hover:bg-[#2e2e2b]"
                    }`}
                  >
                    <Terminal className="h-3.5 w-3.5 shrink-0 text-[#8ab4f8]" strokeWidth={1.7} />
                    <span className="shrink-0 font-mono text-[12.5px] font-medium text-[#ecebe4]">/{cmd.name}</span>
                    {cmd.hint && (
                      <span className="shrink-0 rounded bg-[#2f2f2c] px-1.5 py-0.5 text-[11px] text-[#9a9992]">{cmd.hint}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#8c8b83]">{cmd.description}</span>
                  </button>
                ))
              ) : mentionItems.length === 0 ? (
                <p className="px-2.5 py-2 text-[12.5px] text-[#7e7d76]">Aucun fichier, dossier, symbole ou artéfact correspondant.</p>
              ) : (
                mentionItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === safeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => applyMentionItem(item)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px] transition ${
                      index === safeIndex ? "bg-[#363633] text-[#ecebe4]" : "text-[#d4d3cb] hover:bg-[#2e2e2b]"
                    }`}
                  >
                    <MentionIcon kind={item.kind} />
                    <span className="shrink-0 font-medium text-[#ecebe4]">{item.label}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#8c8b83]">{item.detail}</span>
                    <span className="shrink-0 rounded-md bg-[#2d2d2a] px-1.5 py-0.5 text-[10.5px] text-[#9a9992]">
                      {MENTION_KIND_LABEL[item.kind]}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {voiceStatus !== "idle" && (
          <div
            role="status"
            aria-live="polite"
            className={`mb-2 flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-[12.5px] ${
              voiceStatus === "error"
                ? "border-[#5a2d2d] bg-[#2a1d1d] text-[#f0b4b0]"
                : "border-[#32322f] bg-[#1e1e1c] text-[#dcdbd3]"
            }`}
          >
            {voiceStatus === "listening" && (
              <>
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#e5534b]" aria-hidden="true" />
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-[#ecebe4]">
                  {formatRecordingDuration(recordingSeconds)}
                </span>
                <span className="min-w-0 flex-1 truncate italic text-[#b5b4ac]">
                  {interimTranscript || tr("Écoute en cours...", "Listening...", locale)}
                </span>
                <span className="shrink-0 rounded-md bg-[#2a2a28] px-1.5 py-0.5 text-[11px] text-[#9a9992]">
                  {voiceEngine === "whisper" ? tr("Whisper local", "Local Whisper", locale) : tr("Dictée vocale", "Voice dictation", locale)}
                </span>
                <button
                  type="button"
                  onClick={() => stopVoice(false)}
                  className="shrink-0 rounded-lg bg-[#2f2f2c] px-2 py-0.5 text-[11.5px] font-medium text-[#ecebe4] transition hover:bg-[#3b3b37]"
                >
                  {tr("Arrêter", "Stop", locale)}
                </button>
              </>
            )}
            {voiceStatus === "transcribing" && (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#8ab4f8]" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-[#dcdbd3]">
                  {tr("Transcription Whisper en cours...", "Transcribing with Whisper...", locale)}
                </span>
                <span className="shrink-0 rounded-md bg-[#2a2a28] px-1.5 py-0.5 text-[11px] text-[#9a9992]">
                  {tr("Whisper local", "Local Whisper", locale)}
                </span>
              </>
            )}
            {voiceStatus === "error" && (
              <>
                <MicOff className="h-3.5 w-3.5 shrink-0 text-[#e5534b]" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 text-[12px] leading-snug">{voiceError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceError(null);
                    setVoiceStatus("idle");
                  }}
                  aria-label={tr("Fermer", "Close", locale)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#c79995] transition hover:bg-[#3a2525] hover:text-[#f8d7d5]"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </>
            )}
          </div>
        )}

        <div
          className={`flex items-end gap-2 rounded-[24px] border py-2 pl-2.5 pr-2.5 backdrop-blur-xl transition ${
            dragging
              ? "border-dashed border-[#3b82f6] bg-[#1e293b]/75"
              : "border-white/[0.09] bg-[#1f2024]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.36)] focus-within:border-[#3b82f6]/55 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(59,130,246,0.18),0_12px_32px_rgba(0,0,0,0.45)]"
          }`}
        >
          <PlusMenu
            onAddFiles={() => attach()}
            onAddFolder={() => attach(true)}
            onSlash={openSlashMenu}
            onOpenConnectors={() => onOpenExtensibility?.("mcp")}
            onOpenPlugins={() => onOpenExtensibility?.("plugins")}
          />
          <textarea
            ref={textareaRef}
            aria-label="Message"
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
              setPaletteClosed(false);
            }}
            onClick={updateCursor}
            onKeyUp={updateCursor}
            onSelect={updateCursor}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={
              dragging
                ? tr("Dépose les fichiers ici", "Drop files here", locale)
                : busy
                  ? tr("Ajouter un message à la file d'attente...", "Add a message to the queue...", locale)
                  : (placeholder ??
                      tr(
                        "Demander à Kana d'écrire, refactorer ou déboguer... (@ pour citer, / pour commander)",
                        "Ask Kana to write, refactor, or debug... (@ to mention, / for commands)",
                        locale,
                      ))
            }
            className="[field-sizing:content] my-1 h-auto min-h-[24px] max-h-[10lh] w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-[15px] leading-[1.45] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
          />
          <button
            type="button"
            onClick={() => void startVoice()}
            disabled={voiceStatus === "transcribing"}
            aria-label={
              voiceStatus === "listening"
                ? tr("Arrêter la dictée vocale", "Stop voice dictation", locale)
                : tr("Dictée vocale", "Voice dictation", locale)
            }
            aria-pressed={voiceStatus === "listening"}
            title={
              locale === "fr"
                ? `Dictée vocale (⌥Espace · ${
                    getSpeechRecognitionCtor()
                      ? "Dictée temps réel"
                      : voiceCapabilities?.whisperAvailable
                        ? "Whisper local"
                        : "Dictée native"
                  })`
                : `Voice dictation (Option+Space · ${
                    getSpeechRecognitionCtor()
                      ? "Live dictation"
                      : voiceCapabilities?.whisperAvailable
                        ? "Local Whisper"
                        : "Native dictation"
                  })`
            }
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
              voiceStatus === "listening"
                ? "bg-[#e5534b]/20 text-[#ff7b72] hover:bg-[#e5534b]/30"
                : "text-[#8c8b83] hover:bg-[#2f2f2c] hover:text-[#ecebe4]"
            }`}
          >
            {voiceStatus === "transcribing" ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Mic className="h-4 w-4" strokeWidth={1.9} />
            )}
          </button>
          {busy ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {(text.trim() || files.length > 0) && (
                <button
                  type="button"
                  onClick={submit}
                  aria-label={tr("Mettre en file d'attente", "Queue message", locale)}
                  title={tr("Mettre en file d'attente (Entrée)", "Queue message (Enter)", locale)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f6bd8] text-white transition hover:bg-[#4079e0]"
                >
                  <ListPlus className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={onStop}
                aria-label={tr("Arrêter", "Stop", locale)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecebe4] transition hover:bg-white"
              >
                <Square className="h-3 w-3 fill-[#181817] text-[#181817]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() && files.length === 0}
              aria-label={tr("Envoyer", "Send", locale)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f6bd8] text-white transition hover:bg-[#4079e0] disabled:opacity-35"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
          {footerLeft ?? <ModeMenu mode={mode} onChange={onModeChange} />}
          <div className="flex min-w-0 shrink items-center gap-1">
            {modelPicker ?? <span className="pr-3 text-[12px] text-[#8c8b83]">{agentLabel} · ACP</span>}
            {footerLeft && <ModeMenu mode={mode} onChange={onModeChange} align="right" />}
          </div>
        </div>
      </div>
    </div>
  );
}
