import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, GitFork, History, Pencil, RotateCcw } from "lucide-react";
import { relativeTime } from "../lib/relativeTime";

function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md text-[#8c8b83] transition hover:bg-[#262624] hover:text-[#ecebe4] disabled:opacity-40 disabled:hover:bg-transparent"
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
  /** Ouvrir une nouvelle conversation qui reprend l'échange jusqu'à ce message. */
  onFork?: () => void;
  /** Revenir au checkpoint Git et à la conversation avant ce tour (`/rewind`). */
  onRewind?: () => void;
  align?: "left" | "right";
}

/** La ligne sous un message, visible au survol : heure, réessayer, modifier, copier. */
export default function MessageActions({ text, at, onRetry, onEdit, onFork, onRewind, align = "left" }: MessageActionsProps) {
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

  const icon = "h-[13px] w-[13px]";
  return (
    <div
      className={`flex items-center gap-0 text-[11px] text-[#7e7d76] opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {at && <span className="mr-1">{relativeTime(at)}</span>}
      {onFork && (
        <Action label="Bifurquer" onClick={onFork}>
          <GitFork className={icon} strokeWidth={1.7} />
        </Action>
      )}
      {onRewind && (
        <Action label="Restaurer ce tour (/rewind)" onClick={onRewind}>
          <History className={icon} strokeWidth={1.7} />
        </Action>
      )}
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
