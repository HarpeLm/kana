import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { relativeTime } from "../lib/relativeTime";

function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8c8b83] transition hover:bg-[#262624] hover:text-[#ecebe4] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

interface MessageActionsProps {
  text: string;
  at?: number;
  /** Renvoyer le même message (messages de l'utilisateur). */
  onRetry?: () => void;
  /** Remettre le message dans la zone de saisie pour le modifier. */
  onEdit?: () => void;
  align?: "left" | "right";
}

/** La ligne sous un message, visible au survol : heure, réessayer, modifier, copier. */
export default function MessageActions({ text, at, onRetry, onEdit, align = "left" }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  // L'heure relative se met à jour d'elle-même.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const icon = "h-[15px] w-[15px]";
  return (
    <div
      className={`flex items-center gap-0.5 text-[12px] text-[#7e7d76] opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {at && <span className="mr-1.5">{relativeTime(at)}</span>}
      {onRetry && (
        <Action label="Réessayer" onClick={onRetry}>
          <RotateCcw className={icon} strokeWidth={1.7} />
        </Action>
      )}
      {onEdit && (
        <Action label="Modifier" onClick={onEdit}>
          <Pencil className={icon} strokeWidth={1.7} />
        </Action>
      )}
      <Action label={copied ? "Copié" : "Copier"} onClick={copy}>
        {copied ? <Check className={icon} strokeWidth={1.9} /> : <Copy className={icon} strokeWidth={1.7} />}
      </Action>
    </div>
  );
}
