import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Check, ClipboardCheck, HelpCircle } from "lucide-react";
import { extractStructuredQuestion, type ChatState, type StructuredQuestion } from "../lib/chatState";
import { skillsAsCommands, useExtensibilityVersion } from "../lib/extensibility";
import type { PermissionMode } from "../lib/permissionMode";
import ChatMessages from "./ChatMessages";
import Composer from "./Composer";
import { EnvironmentRow, NewSessionCenter, NewSessionQuickActions, type NewSessionProps } from "./NewSession";
import PermissionPrompt from "./PermissionPrompt";
import RelayBanner, { type RelayBannerProps } from "./RelayBanner";

const PLAN_APPROVAL_PROMPT = "Le plan est approuvé : passe en exécution et applique les modifications.";
const EXECUTION_MODES: { id: PermissionMode; label: string }[] = [
  { id: "auto", label: "Approuver à ma place" },
  { id: "ask", label: "Demander l'approbation" },
  { id: "full", label: "Accès complet" },
];

function StructuredQuestionCard({
  question,
  onSubmit,
  onDismiss,
}: {
  question: StructuredQuestion;
  onSubmit: (answer: string) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const multi = !!question.multiSelect;

  const toggleOption = (option: string) => {
    if (multi) {
      setSelected((prev) =>
        prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option],
      );
      return;
    }
    setSelected((prev) => (prev.includes(option) ? [] : [option]));
    setCustom("");
  };

  const customTrimmed = custom.trim();
  const chosen = multi
    ? [...selected, ...(customTrimmed ? [customTrimmed] : [])]
    : customTrimmed
      ? [customTrimmed]
      : selected;

  const submit = () => {
    if (chosen.length === 0) return;
    onSubmit(chosen.join(", "));
  };

  const handleCustomKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (!customTrimmed) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="px-6 pb-2">
      <div
        role="region"
        aria-label="Question de l'agent"
        className="mx-auto max-w-[740px] space-y-2.5 rounded-2xl border border-[#3a3a35] bg-[#222220] px-4 py-3 text-[13px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8ab4f8]" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="font-medium text-[#ecebe4]">{question.question}</p>
              {multi && <p className="mt-0.5 text-[11.5px] text-[#8c8b83]">Plusieurs choix possibles</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-[#9a9992] transition hover:bg-[#2e2e2b] hover:text-[#e6e5df]"
          >
            Ignorer
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => toggleOption(option)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition ${
                  active
                    ? "border-[#d97757] bg-[#d97757]/15 text-[#f0efe9]"
                    : "border-[#343431] bg-[#1a1a18] text-[#dcdbd3] hover:border-[#4a4a46] hover:bg-[#2a2a28]"
                }`}
              >
                {multi && (
                  <Check
                    className={`h-3.5 w-3.5 ${active ? "text-[#d97757] opacity-100" : "opacity-30"}`}
                    strokeWidth={2}
                  />
                )}
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <input
            type="text"
            value={custom}
            onChange={(e) => {
              const next = e.target.value;
              setCustom(next);
              if (!multi && next.trim()) setSelected([]);
            }}
            onKeyDown={handleCustomKeyDown}
            placeholder="Autre réponse…"
            aria-label="Autre réponse"
            className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#181817] px-3 py-1.5 text-[12.5px] text-[#ecebe4] placeholder-[#7e7d76] outline-none transition focus:border-[#555550] select-text"
          />
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={submit}
            className="shrink-0 rounded-lg bg-[#d97757] px-3 py-1.5 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Valider la réponse
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatViewProps {
  agentLabel: string;
  chat: ChatState;
  onSend: (text: string) => void;
  onStop: () => void;
  onRemoveQueued?: (index: number) => void;
  onSteerQueued?: (index: number) => void;
  workPath?: string;
  projectPath?: string;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onOpenLink: (url: string) => void;
  onFork: (messageId: string) => void;
  onRewind?: (messageId: string) => void;
  onOpenExtensibility?: (tab: "mcp" | "plugins") => void;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  onApprovePlan?: (targetMode: PermissionMode) => void;
  /** Ce qu'affiche l'écran d'une conversation vide (projet, dossier de travail). */
  newSession: NewSessionProps;
  /** Choix du fournisseur et du modèle (le fournisseur ne change que dans une conversation vide). */
  modelPicker: ReactNode;
  /** Le fournisseur ne répond plus : proposition de relais. */
  relayBanner: RelayBannerProps | null;
}

export default function ChatView({
  agentLabel,
  chat,
  onSend,
  onStop,
  onRemoveQueued,
  onSteerQueued,
  workPath,
  projectPath,
  onAnswer,
  onOpenLink,
  onFork,
  onRewind,
  onOpenExtensibility,
  mode,
  onModeChange,
  onApprovePlan,
  newSession,
  modelPicker,
  relayBanner,
}: ChatViewProps) {
  const [targetMode, setTargetMode] = useState<PermissionMode>("auto");
  const [dismissedQuestions, setDismissedQuestions] = useState<Set<string>>(() => new Set());
  useExtensibilityVersion();
  const mergedCommands = [...chat.commands, ...skillsAsCommands(projectPath)];

  const dismissQuestion = (messageId: string) => {
    setDismissedQuestions((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  };

  const approvePlan = () => {
    if (onApprovePlan) {
      onApprovePlan(targetMode);
      return;
    }
    onModeChange(targetMode);
    onSend(PLAN_APPROVAL_PROMPT);
  };

  // Une conversation vide centre l'accroche et le Composer au milieu de l'écran (style Codex / Antigravity).
  if (chat.messages.length === 0 && !chat.busy) {
    return (
      <main className="flex flex-1 flex-col justify-center overflow-y-auto pb-14">
        <NewSessionCenter />
        {relayBanner && <RelayBanner {...relayBanner} />}
        <Composer
          agentLabel={agentLabel}
          busy={chat.busy}
          commands={mergedCommands}
          queued={chat.queued}
          onSend={onSend}
          onStop={onStop}
          onRemoveQueued={onRemoveQueued}
          onSteerQueued={onSteerQueued}
          workPath={workPath}
          mode={mode}
          onModeChange={onModeChange}
          footerLeft={<EnvironmentRow session={newSession} />}
          modelPicker={modelPicker}
          placeholder="Décrivez une tâche ou posez une question."
          onOpenExtensibility={onOpenExtensibility}
        />
        <NewSessionQuickActions session={newSession} onSend={onSend} />
      </main>
    );
  }

  const canApprovePlan = mode === "plan" && !chat.busy && chat.messages.some((m) => m.role === "agent");
  const detectedQuestion = extractStructuredQuestion(chat.messages, chat.busy);
  const activeQuestion =
    detectedQuestion && !dismissedQuestions.has(detectedQuestion.messageId) ? detectedQuestion : null;

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ChatMessages
        messages={chat.messages}
        agentLabel={agentLabel}
        onOpenLink={onOpenLink}
        busy={chat.busy}
        onSend={onSend}
        onFork={onFork}
        onRewind={onRewind}
      />

      {chat.permissions.length > 0 && (
        <div className="px-6 pb-2">
          <div className="mx-auto max-w-[740px] space-y-2">
            {chat.permissions.map((request) => (
              <PermissionPrompt key={request.requestId} request={request} onAnswer={onAnswer} />
            ))}
          </div>
        </div>
      )}

      {activeQuestion && (
        <StructuredQuestionCard
          key={activeQuestion.messageId}
          question={activeQuestion}
          onSubmit={(answer) => {
            dismissQuestion(activeQuestion.messageId);
            onSend(answer);
          }}
          onDismiss={() => dismissQuestion(activeQuestion.messageId)}
        />
      )}

      {canApprovePlan && (
        <div className="px-6 pb-2">
          <div
            role="region"
            aria-label="Validation du plan"
            className="mx-auto flex max-w-[740px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#3a3a35] bg-[#222220] px-4 py-2.5 text-[13px]"
          >
            <div className="flex items-center gap-2 text-[#ecebe4]">
              <ClipboardCheck className="h-4 w-4 shrink-0 text-[#d97757]" strokeWidth={1.8} />
              <span className="font-medium">Plan prêt pour exécution</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Mode d'approbation pour l'exécution"
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as PermissionMode)}
                className="rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12px] text-[#e6e5df] outline-none transition hover:border-[#4a4a46]"
              >
                {EXECUTION_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={approvePlan}
                className="rounded-lg bg-[#d97757] px-3 py-1 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768]"
              >
                Approuver le plan et passer en exécution
              </button>
            </div>
          </div>
        </div>
      )}

      {relayBanner && <RelayBanner {...relayBanner} />}
      <Composer
        agentLabel={agentLabel}
        busy={chat.busy}
        commands={mergedCommands}
        queued={chat.queued}
        onSend={onSend}
        onStop={onStop}
        onRemoveQueued={onRemoveQueued}
        onSteerQueued={onSteerQueued}
        workPath={workPath}
        mode={mode}
        onModeChange={onModeChange}
        modelPicker={modelPicker}
        onOpenExtensibility={onOpenExtensibility}
      />
    </main>
  );
}
