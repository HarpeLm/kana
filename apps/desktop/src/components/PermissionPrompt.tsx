import type { PermissionRequest } from "../lib/chatState";
import { tr, useLocale } from "../lib/i18n";
import { addPermissionRule } from "../lib/permissionMode";

interface PermissionPromptProps {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
}

export default function PermissionPrompt({ request, onAnswer }: PermissionPromptProps) {
  const locale = useLocale();

  const allowOption =
    request.options.find((o) => o.kind === "allow_always") ??
    request.options.find((o) => o.kind.startsWith("allow"));
  const rejectOption =
    request.options.find((o) => o.kind === "reject_always") ??
    request.options.find((o) => o.kind.startsWith("reject"));

  const alwaysAllow = () => {
    addPermissionRule({ scope: "any", pattern: request.title, policy: "allow" });
    onAnswer(request.requestId, allowOption?.id ?? request.options[0]?.id ?? null);
  };

  const alwaysDeny = () => {
    addPermissionRule({ scope: "any", pattern: request.title, policy: "deny" });
    onAnswer(request.requestId, rejectOption?.id ?? null);
  };

  return (
    <div className="rounded-xl border border-[#d97757]/40 bg-[#d97757]/5 px-3.5 py-3 text-[13px]">
      <p className="mb-2 text-[#e6e5df]">
        {tr("L'agent demande l'autorisation :", "Agent requests permission:", locale)}{" "}
        <span className="font-medium">{request.title}</span>
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
          type="button"
          onClick={alwaysAllow}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-[12px] font-medium text-emerald-300 transition hover:bg-emerald-500/25"
        >
          {tr("Toujours autoriser", "Always allow", locale)}
        </button>
        <button
          type="button"
          onClick={alwaysDeny}
          className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-300 transition hover:bg-red-500/25"
        >
          {tr("Toujours refuser", "Always deny", locale)}
        </button>
        <button
          onClick={() => onAnswer(request.requestId, null)}
          className="rounded-lg px-3 py-1 text-[12px] text-[#9a9992] hover:text-[#e6e5df]"
        >
          {tr("Annuler", "Cancel", locale)}
        </button>
      </div>
    </div>
  );
}
