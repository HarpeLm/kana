import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  HelpCircle,
  Keyboard,
  LogIn,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { setLocale, tr, useLocale, type Locale } from "../lib/i18n";
import { clearUserProfile, useUserProfile, userInitials } from "../lib/profile";
import AccountDialogs, { type AccountDialogKind } from "./AccountDialogs";

interface AccountMenuProps {
  settingsOpen?: boolean;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
}

export default function AccountMenu({
  settingsOpen = false,
  onOpenSettings,
  onOpenSignIn,
}: AccountMenuProps) {
  const locale = useLocale();
  const profile = useUserProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langExpanded, setLangExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<AccountDialogKind>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setLangExpanded(false);
    setMoreOpen(false);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({
        left: Math.max(8, rect.left + 8),
        bottom: window.innerHeight - rect.top + 8,
      });
    } else {
      setAnchor({ left: 10, bottom: 56 });
    }
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const openDialog = (kind: Exclude<AccountDialogKind, null>) => {
    closeMenu();
    setActiveDialog(kind);
  };

  const chooseLocale = (next: Locale) => {
    setLocale(next);
    setLangExpanded(false);
  };

  const hasName = profile.name.length > 0;
  const initials = userInitials(profile.name);

  return (
    <>
      <div className="shrink-0 border-t border-[#2b2b28] p-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
            menuOpen || settingsOpen
              ? "bg-[#2b2b29] text-[#ecebe4]"
              : "text-[#c4c3bc] hover:bg-[#262624] hover:text-[#ecebe4]"
          }`}
        >
          {hasName ? (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3e3e39] bg-[#1e3a8a]/35 text-[11px] font-semibold text-[#93c5fd]">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-[#ecebe4]">
                  {profile.name}
                </span>
                <span className="block text-[11px] leading-tight text-[#8c8b83]">
                  {tr("Local", "Local", locale)}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#383834] bg-[#252523] text-[#a3a29a]">
                <User className="h-3.5 w-3.5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#ecebe4]">
                {tr("Se connecter", "Sign in", locale)}
              </span>
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#8c8b83] transition-transform ${menuOpen ? "rotate-180" : ""}`}
            strokeWidth={1.7}
          />
        </button>
      </div>

      {menuOpen &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={tr("Menu du compte", "Account menu", locale)}
            style={{ left: anchor.left, bottom: anchor.bottom }}
            className="fixed z-50 w-[240px] rounded-2xl border border-white/[0.09] bg-[#1e1f22]/85 p-1.5 text-[#ecebe4] backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_44px_rgba(0,0,0,0.6)]"
          >
            <div className="px-2.5 py-1.5 text-[11.5px] font-medium text-[#8c8b83]">
              <span className="block truncate">
                {hasName ? profile.name : tr("Compte local", "Local account", locale)}
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onOpenSettings();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
            >
              <span className="flex items-center gap-2.5">
                <Settings className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                <span>{tr("Paramètres", "Settings", locale)}</span>
              </span>
              <span className="font-mono text-[11px] text-[#8c8b83]">⌘,</span>
            </button>

            <div>
              <button
                type="button"
                role="menuitem"
                aria-expanded={langExpanded}
                onClick={() => {
                  setLangExpanded((v) => !v);
                  setMoreOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                  <span>{tr("Langue", "Language", locale)}</span>
                </span>
                <span className="rounded-md bg-[#1f1f1d] px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-[#a3a29a]">
                  {locale === "fr" ? "FR" : "EN"}
                </span>
              </button>

              {langExpanded && (
                <div className="mt-0.5 space-y-0.5 rounded-xl bg-[#1f1f1d] p-1">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={locale === "fr"}
                    onClick={() => chooseLocale("fr")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] text-[#dcdbd3] transition hover:bg-[#2b2b29]"
                  >
                    <span>Français</span>
                    {locale === "fr" && <Check className="h-3.5 w-3.5 text-[#60a5fa]" />}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={locale === "en"}
                    onClick={() => chooseLocale("en")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] text-[#dcdbd3] transition hover:bg-[#2b2b29]"
                  >
                    <span>English</span>
                    {locale === "en" && <Check className="h-3.5 w-3.5 text-[#60a5fa]" />}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => openDialog("feedback")}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
            >
              <MessageSquare className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
              <span>{tr("Envoyer un commentaire", "Send feedback", locale)}</span>
            </button>

            <div
              className="relative"
              onMouseEnter={() => setMoreOpen(true)}
              onMouseLeave={() => setMoreOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMoreOpen(true);
                  setLangExpanded(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
              >
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                  <span>{tr("En savoir plus", "Learn more", locale)}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-[#8c8b83]" strokeWidth={1.8} />
              </button>

              {moreOpen && (
                <div className="absolute bottom-0 left-full pl-1.5">
                  <div
                    role="menu"
                    aria-label={tr("En savoir plus", "Learn more", locale)}
                    className="w-[210px] rounded-2xl border border-white/[0.09] bg-[#1e1f22]/85 p-1.5 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_44px_rgba(0,0,0,0.6)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDialog("legal")}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
                    >
                      <Scale className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                      <span>{tr("Mentions légales", "Legal notice", locale)}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDialog("privacy")}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
                    >
                      <ShieldCheck className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                      <span>{tr("Confidentialité", "Privacy", locale)}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDialog("shortcuts")}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
                    >
                      <Keyboard className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
                      <span>{tr("Raccourcis clavier", "Keyboard shortcuts", locale)}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="my-1 border-t border-[#343430]" />

            <button
              type="button"
              role="menuitem"
              onClick={() => openDialog("changelog")}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
            >
              <FileText className="h-4 w-4 text-[#a3a29a]" strokeWidth={1.7} />
              <span>{tr("Voir le journal des modifications", "View changelog", locale)}</span>
            </button>

            <div className="my-1 border-t border-[#343430]" />

            {hasName ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  clearUserProfile();
                  closeMenu();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#93c5fd] transition hover:bg-[#31312e]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.7} />
                <span>{tr("Se déconnecter", "Sign out", locale)}</span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onOpenSignIn();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#31312e]"
              >
                <LogIn className="h-4 w-4 text-[#60a5fa]" strokeWidth={1.7} />
                <span>{tr("Se connecter", "Sign in", locale)}</span>
              </button>
            )}
          </div>,
          document.body,
        )}

      <AccountDialogs active={activeDialog} onClose={() => setActiveDialog(null)} />
    </>
  );
}
