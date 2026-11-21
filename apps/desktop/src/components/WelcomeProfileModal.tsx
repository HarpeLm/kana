import { useEffect, useState, type FormEvent } from "react";
import { User, X } from "lucide-react";
import { tr, useLocale } from "../lib/i18n";
import { userInitials } from "../lib/profile";

interface WelcomeProfileModalProps {
  open: boolean;
  initialName?: string;
  onSave: (name: string) => void;
  onLater: () => void;
}

export default function WelcomeProfileModal({
  open,
  initialName = "",
  onSave,
  onLater,
}: WelcomeProfileModalProps) {
  const locale = useLocale();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onLater();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onLater]);

  if (!open) return null;

  const trimmed = name.trim();
  const initials = userInitials(trimmed);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onLater();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Bienvenue sur Kana", "Welcome to Kana", locale)}
        className="w-full max-w-[420px] rounded-2xl border border-[#383834] bg-[#1f1f1d] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#3a3a36] bg-[#252523] text-[14px] font-semibold text-[#ecebe4]">
            {initials ? (
              <span className="text-[#d97757]">{initials}</span>
            ) : (
              <User className="h-5 w-5 text-[#8c8b83]" strokeWidth={1.7} />
            )}
          </div>
          <button
            type="button"
            onClick={onLater}
            aria-label={tr("Fermer", "Close", locale)}
            className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-[#ecebe4]">
          {tr("Bienvenue dans Kana", "Welcome to Kana", locale)}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#8c8b83]">
          {tr(
            "Comment souhaitez-vous que Kana vous appelle ? Votre profil reste 100 % local sur cet ordinateur.",
            "What should Kana call you? Your profile stays 100% local on this computer.",
            locale,
          )}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="kana-welcome-name"
              className="mb-1.5 block text-[12px] font-medium text-[#c4c3bc]"
            >
              {tr("Comment souhaitez-vous que Kana vous appelle ?", "What should Kana call you?", locale)}
            </label>
            <input
              id="kana-welcome-name"
              type="text"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={tr("Prénom ou pseudo (ex. HarpeLm)", "First name or handle (e.g. HarpeLm)", locale)}
              className="w-full rounded-xl border border-[#383834] bg-[#181817] px-3.5 py-2.5 text-[13.5px] text-[#ecebe4] placeholder-[#6e6d66] outline-none transition focus:border-[#d97757] select-text"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onLater}
              className="rounded-xl px-3 py-2 text-[13px] text-[#8c8b83] transition hover:bg-[#252523] hover:text-[#ecebe4]"
            >
              {tr("Plus tard", "Later", locale)}
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              className="rounded-xl bg-[#d97757] px-4 py-2 text-[13px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tr("Continuer", "Continue", locale)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
