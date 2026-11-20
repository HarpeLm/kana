import type { ChatState } from "../lib/chatState";
import type { PermissionMode } from "../lib/permissionMode";
import ChatMessages from "./ChatMessages";
import Composer from "./Composer";
import { EnvironmentRow, NewSessionCenter, type NewSessionProps } from "./NewSession";
import PermissionPrompt from "./PermissionPrompt";

interface ChatViewProps {
  agentLabel: string;
  chat: ChatState;
  onSend: (text: string) => void;
  onStop: () => void;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onOpenLink: (url: string) => void;
  onFork: (messageId: string) => void;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  /** Ce qu'affiche l'écran d'une conversation vide (projet, dossier de travail). */
  newSession: NewSessionProps;
}

export default function ChatView({
  agentLabel,
  chat,
  onSend,
  onStop,
  onAnswer,
  onOpenLink,
  onFork,
  mode,
  onModeChange,
  newSession,
}: ChatViewProps) {
  // Une conversation vide s'ouvre sur l'écran de nouvelle session : les projets au centre,
  // et sous la saisie, l'endroit où l'agent travaillera.
  if (chat.messages.length === 0 && !chat.busy) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <NewSessionCenter session={newSession} />
        <Composer
          agentLabel={agentLabel}
          busy={chat.busy}
          onSend={onSend}
          onStop={onStop}
          mode={mode}
          onModeChange={onModeChange}
          footerLeft={<EnvironmentRow session={newSession} />}
          placeholder="Décrivez une tâche ou posez une question."
        />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ChatMessages
        messages={chat.messages}
        agentLabel={agentLabel}
        onOpenLink={onOpenLink}
        busy={chat.busy}
        onSend={onSend}
        onFork={onFork}
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

      <Composer agentLabel={agentLabel} busy={chat.busy} onSend={onSend} onStop={onStop} mode={mode} onModeChange={onModeChange} />
    </main>
  );
}
