import type { PermissionRequest } from "../lib/chatState";

interface PermissionPromptProps {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
}

export default function PermissionPrompt({ request, onAnswer }: PermissionPromptProps) {
  return (
    <div className="rounded-xl border border-[#d97757]/40 bg-[#d97757]/5 px-3.5 py-3 text-[13px]">
      <p className="mb-2 text-[#e6e5df]">
        L'agent demande l'autorisation : <span className="font-medium">{request.title}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {request.options.map((option) => (
          <button
            key={option.id}
            onClick={() => onAnswer(request.requestId, option.id)}
            className={`rounded-lg px-3 py-1 text-[12px] font-medium transition ${
              option.kind.startsWith("allow")
                ? "bg-[#d97757] text-[#181817] hover:bg-[#e38768]"
                : "bg-[#2e2e2b] text-[#e6e5df] hover:bg-[#383835]"
            }`}
          >
            {option.name}
          </button>
        ))}
        <button
          onClick={() => onAnswer(request.requestId, null)}
          className="rounded-lg px-3 py-1 text-[12px] text-[#9a9992] hover:text-[#e6e5df]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
