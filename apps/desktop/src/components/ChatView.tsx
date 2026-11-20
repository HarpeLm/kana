import type { ChatState } from "../lib/chatState";
import type { PermissionMode } from "../lib/permissionMode";
import ChatMessages from "./ChatMessages";
import Composer from "./Composer";
import PermissionPrompt from "./PermissionPrompt";

interface ChatViewProps {
  agentLabel: string;
  chat: ChatState;
  onSend: (text: string) => void;
  onStop: () => void;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onOpenLink: (url: string) => void;
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

export default function ChatView({ agentLabel, chat, onSend, onStop, onAnswer, onOpenLink, mode, onModeChange }: ChatViewProps) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ChatMessages messages={chat.messages} agentLabel={agentLabel} onOpenLink={onOpenLink} />

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
