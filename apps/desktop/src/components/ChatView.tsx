import type { ReactNode } from "react";
import type { ChatState } from "../lib/chatState";
import type { PermissionMode } from "../lib/permissionMode";
import ChatMessages from "./ChatMessages";
import Composer from "./Composer";
import { EnvironmentRow, NewSessionCenter, type NewSessionProps } from "./NewSession";
import PermissionPrompt from "./PermissionPrompt";
import RelayBanner, { type RelayBannerProps } from "./RelayBanner";

interface ChatViewProps {
  agentLabel: string;
  chat: ChatState;
  onSend: (text: string) => void;
  onStop: () => void;
  onRemoveQueued?: (index: number) => void;
  onSteerQueued?: (index: number) => void;
  workPath?: string;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onOpenLink: (url: string) => void;
  onFork: (messageId: string) => void;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
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
  onAnswer,
  onOpenLink,
  onFork,
  mode,
  onModeChange,
  newSession,
  modelPicker,
  relayBanner,
}: ChatViewProps) {
  // Une conversation vide s'ouvre sur l'écran de nouvelle session : les projets au centre,
  // et sous la saisie, l'endroit où l'agent travaillera.
  if (chat.messages.length === 0 && !chat.busy) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden">
        <NewSessionCenter session={newSession} />
        {relayBanner && <RelayBanner {...relayBanner} />}
        <Composer
          agentLabel={agentLabel}
          busy={chat.busy}
          commands={chat.commands}
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

      {relayBanner && <RelayBanner {...relayBanner} />}
      <Composer
        agentLabel={agentLabel}
        busy={chat.busy}
        commands={chat.commands}
        queued={chat.queued}
        onSend={onSend}
        onStop={onStop}
        onRemoveQueued={onRemoveQueued}
        onSteerQueued={onSteerQueued}
        workPath={workPath}
        mode={mode}
        onModeChange={onModeChange}
        modelPicker={modelPicker}
      />
    </main>
  );
}
