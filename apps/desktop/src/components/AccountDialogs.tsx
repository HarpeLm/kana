import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  Copy,
  FileText,
  Keyboard,
  Mail,
  MessageSquare,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { inTauri } from "../lib/env";
import { tr, useLocale } from "../lib/i18n";

export type AccountDialogKind = "feedback" | "legal" | "privacy" | "shortcuts" | "changelog" | null;

export const FEEDBACK_EMAIL = "HarpeLm@proton.me";

interface AccountDialogsProps {
  active: AccountDialogKind;
  onClose: () => void;
}

function ModalShell({
  title,
  subtitle,
  icon,
  maxWidth = "max-w-[540px]",
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  maxWidth?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const locale = useLocale();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[85vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[#383834] bg-[#1f1f1d] shadow-[0_24px_64px_rgba(0,0,0,0.65)]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#2d2d2a] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#383834] bg-[#252523] text-[#60a5fa]">
              {icon}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#ecebe4]">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[12px] text-[#8c8b83]">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("Fermer", "Close", locale)}
            className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const mailtoHref = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    subject.trim() || "[Kana] Commentaire",
  )}&body=${encodeURIComponent(message.trim())}`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (inTauri) {
      void openUrl(mailtoHref).catch(() => {
        window.location.href = mailtoHref;
      });
    } else {
      window.open(mailtoHref, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopy = () => {
    void navigator.clipboard?.writeText(FEEDBACK_EMAIL).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalShell
      title={tr("Envoyer un commentaire", "Send feedback", locale)}
      subtitle={tr(
        "Un bug, une idée ou un retour d'expérience ? Écrivez-nous directement.",
        "Found a bug, have an idea, or want to share feedback? Write to us directly.",
        locale,
      )}
      icon={<MessageSquare className="h-4 w-4" strokeWidth={1.8} />}
      onClose={onClose}
    >
      <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[#343430] bg-[#181817] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#dcdbd3]">
          <Mail className="h-3.5 w-3.5 shrink-0 text-[#60a5fa]" />
          <span className="truncate font-mono select-text">{FEEDBACK_EMAIL}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2b2b29] px-2.5 py-1 text-[11.5px] text-[#ecebe4] transition hover:bg-[#383834]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>
            {copied
              ? tr("Copié", "Copied", locale)
              : tr("Copier l'adresse", "Copy address", locale)}
          </span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="kana-feedback-subject" className="mb-1 block text-[12px] font-medium text-[#c4c3bc]">
            {tr("Sujet", "Subject", locale)}
          </label>
          <input
            id="kana-feedback-subject"
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={tr("ex. Suggestion d'amélioration", "e.g. Feature suggestion", locale)}
            className="w-full rounded-xl border border-[#343430] bg-[#181817] px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#6e6d66] outline-none focus:border-[#3b82f6] select-text"
          />
        </div>

        <div>
          <label htmlFor="kana-feedback-message" className="mb-1 block text-[12px] font-medium text-[#c4c3bc]">
            {tr("Message", "Message", locale)}
          </label>
          <textarea
            id="kana-feedback-message"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={tr("Décrivez votre retour…", "Describe your feedback…", locale)}
            className="w-full resize-none rounded-xl border border-[#343430] bg-[#181817] px-3 py-2 text-[13px] text-[#ecebe4] placeholder-[#6e6d66] outline-none focus:border-[#3b82f6] select-text"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[12.5px] text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
          >
            {tr("Annuler", "Cancel", locale)}
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-[#1e40af] px-4 py-2 text-[12.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb]"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{tr("Ouvrir dans Mail", "Open in Mail", locale)}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function LegalDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  return (
    <ModalShell
      title={tr("Mentions légales", "Legal notice", locale)}
      subtitle="Kana v0.1.0"
      icon={<Scale className="h-4 w-4" strokeWidth={1.8} />}
      onClose={onClose}
    >
      <div className="space-y-4 text-[13px] leading-relaxed text-[#c4c3bc] select-text">
        <section className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Éditeur du logiciel", "Software publisher", locale)}
          </h3>
          <p className="mt-1 text-[12.5px] text-[#8c8b83]">
            {tr(
              "Kana est un projet indépendant open-source édité et maintenu par HarpePluie. Pour toute question juridique, technique ou relative à la sécurité, contactez : ",
              "Kana is an independent open-source project published and maintained by HarpePluie. For any legal, technical, or security inquiry, contact: ",
              locale,
            )}
            <span className="font-mono text-[#ecebe4]">{FEEDBACK_EMAIL}</span>.
          </p>
        </section>

        <section className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Nature open-source & exécution locale", "Open-source & local-first software", locale)}
          </h3>
          <p className="mt-1 text-[12.5px] text-[#8c8b83]">
            {tr(
              "Kana est un poste de travail local (Desktop Tauri & CLI) qui s'exécute intégralement sur votre machine. Le logiciel est fourni « en l'état », sans garantie expresse ou implicite, conformément aux usages open-source.",
              "Kana is a local-first workspace (Tauri Desktop & CLI) running entirely on your machine. The software is provided \"as is\", without warranty of any kind, in accordance with open-source practices.",
              locale,
            )}
          </p>
        </section>

        <section className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Propriété intellectuelle & marques tierces", "Intellectual property & third-party marks", locale)}
          </h3>
          <p className="mt-1 text-[12.5px] text-[#8c8b83]">
            {tr(
              "Claude Code (Anthropic), Codex (OpenAI), Gemini CLI (Google) et OpenCode sont des marques et produits appartenant à leurs propriétaires respectifs. Kana n'est affilié à aucun de ces éditeurs et communique avec leurs CLI locales via le protocole ouvert ACP.",
              "Claude Code (Anthropic), Codex (OpenAI), Gemini CLI (Google), and OpenCode are trademarks and products of their respective owners. Kana is independent and connects to local CLIs through the open ACP protocol.",
              locale,
            )}
          </p>
        </section>

        <section className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Absence de télémétrie cachée", "No hidden telemetry", locale)}
          </h3>
          <p className="mt-1 text-[12.5px] text-[#8c8b83]">
            {tr(
              "Kana n'embarque aucun traceur analytique, aucune publicité et aucune collecte silencieuse de vos prompts, de votre code source ou de vos habitudes d'utilisation.",
              "Kana includes no analytics trackers, no ads, and no silent collection of your prompts, source code, or usage habits.",
              locale,
            )}
          </p>
        </section>
      </div>
    </ModalShell>
  );
}

function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  return (
    <ModalShell
      title={tr("Confidentialité", "Privacy", locale)}
      subtitle={tr("Vos données restent chez vous.", "Your data stays with you.", locale)}
      icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.8} />}
      onClose={onClose}
    >
      <div className="space-y-3.5 text-[12.5px] leading-relaxed text-[#8c8b83] select-text">
        <div className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Stockage 100 % local", "100% local storage", locale)}
          </h3>
          <p className="mt-1">
            {tr(
              "Toutes vos conversations, préférences, règles de permissions et index de recherche plein texte sont enregistrés localement dans ~/.kana/ et dans votre base SQLite locale.",
              "All conversations, preferences, permission rules, and full-text search indexes are stored locally in ~/.kana/ and your local SQLite database.",
              locale,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Clés API dans le Trousseau macOS", "API keys in macOS Keychain", locale)}
          </h3>
          <p className="mt-1">
            {tr(
              "Les clés API éventuellement ajoutées ne sont jamais écrites en clair sur disque : elles sont confiées au Trousseau d'accès macOS (Keychain) et masquées dans le journal d'audit.",
              "Any optional API keys are never written in plaintext to disk: they are stored in the macOS Keychain and automatically redacted in the audit log.",
              locale,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5">
          <h3 className="text-[13px] font-medium text-[#ecebe4]">
            {tr("Échanges directs avec vos fournisseurs", "Direct communication with your providers", locale)}
          </h3>
          <p className="mt-1">
            {tr(
              "Kana ne possède aucun serveur intermédiaire. Vos requêtes sont transmises directement par l'adaptateur ACP local au fournisseur IA que vous avez choisi.",
              "Kana has no proxy servers. Requests are sent directly by the local ACP adapter to the AI provider you selected.",
              locale,
            )}
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const shortcuts: Array<{ keys: string; fr: string; en: string }> = [
    { keys: "⌘K", fr: "Recherche & palette de commandes", en: "Search & command palette" },
    { keys: "⌘,", fr: "Ouvrir les Paramètres", en: "Open Settings" },
    { keys: "⌘;", fr: "Discussion parallèle (Side Chat)", en: "Toggle Side Chat" },
    { keys: "⌥Espace", fr: "Accès rapide / espace de commande", en: "Quick access / command space" },
    { keys: "⌘U", fr: "Actualiser / mises à jour", en: "Refresh / updates" },
    { keys: "⌘N", fr: "Nouvelle conversation", en: "New conversation" },
    { keys: "⌘B", fr: "Afficher / masquer la barre latérale", en: "Toggle sidebar" },
    { keys: "⌘J", fr: "Afficher / masquer le terminal", en: "Toggle terminal" },
    { keys: "⌘⇧D", fr: "Volet Diff Git", en: "Toggle Git Diff" },
    { keys: "⌘⇧E", fr: "Volet Fichiers", en: "Toggle Files" },
    { keys: "⌘⇧A", fr: "Volet Artéfacts", en: "Toggle Artifacts" },
    { keys: "⌘⇧G", fr: "Navigateur Globe", en: "Toggle Globe browser" },
    { keys: "⌘⇧P", fr: "Panneau de session", en: "Toggle Session panel" },
    { keys: "⌘⇧M", fr: "Changer le mode de permission", en: "Cycle permission mode" },
  ];

  return (
    <ModalShell
      title={tr("Raccourcis clavier", "Keyboard shortcuts", locale)}
      subtitle={tr("Naviguez rapidement dans Kana sans quitter le clavier.", "Move around Kana without leaving the keyboard.", locale)}
      icon={<Keyboard className="h-4 w-4" strokeWidth={1.8} />}
      onClose={onClose}
    >
      <div className="divide-y divide-[#2a2a27] rounded-xl border border-[#2e2e2b] bg-[#181817]">
        {shortcuts.map((item) => (
          <div key={item.keys} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-[12.5px]">
            <span className="text-[#dcdbd3]">{tr(item.fr, item.en, locale)}</span>
            <kbd className="shrink-0 rounded-md border border-[#3a3a36] bg-[#252523] px-2 py-0.5 font-mono text-[11px] text-[#ecebe4]">
              {item.keys}
            </kbd>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const sections = [
    {
      title: tr("Multi-agents ACP & Relais de quota", "Multi-agent ACP & Quota Relay", locale),
      items: [
        tr(
          "Connexion unifiée à Claude Code, Codex, Gemini CLI et OpenCode via le protocole ACP local.",
          "Unified local ACP integration for Claude Code, Codex, Gemini CLI, and OpenCode.",
          locale,
        ),
        tr(
          "Relais automatique de quota entre fournisseurs et mode /advisor avec pipeline Cross-Review.",
          "Automatic cross-provider quota relay and /advisor mode with Cross-Review pipeline.",
          locale,
        ),
      ],
    },
    {
      title: tr("Workspace & Outils natifs", "Workspace & Native Tools", locale),
      items: [
        tr(
          "Worktrees Git isolés par conversation, diff interactif par bloc, checkpoints et /rewind.",
          "Isolated Git worktrees per thread, interactive hunk diff, checkpoints, and /rewind.",
          locale,
        ),
        tr(
          "Éditeur de fichiers avec diagnostics LSP, terminal intégré, navigateur Globe et galerie d'artéfacts.",
          "File editor with LSP diagnostics, integrated terminal, Globe browser, and artifacts gallery.",
          locale,
        ),
      ],
    },
    {
      title: tr("Extensibilité & Sécurité", "Extensibility & Security", locale),
      items: [
        tr(
          "Gestionnaire MCP, Skills, Hooks, règles de permissions granulaires (allow / ask / deny) et journal d'audit.",
          "MCP connectors, Skills, Hooks, granular allow/ask/deny permission rules, and audit log.",
          locale,
        ),
        tr(
          "Stockage 100 % local SQLite FTS5, clés API protégées par le Trousseau macOS et cache local des adaptateurs ACP.",
          "100% local SQLite FTS5 storage, macOS Keychain API keys, and local ACP adapter caching.",
          locale,
        ),
      ],
    },
    {
      title: tr("Interface & Expérience", "Interface & Experience", locale),
      items: [
        tr(
          "Nouveau profil local, menu compte arrondi en bas de la barre latérale et fenêtre Paramètres avec onglet Fournisseurs.",
          "New local profile, rounded bottom account menu, and rounded Settings modal with Providers tab.",
          locale,
        ),
      ],
    },
  ];

  return (
    <ModalShell
      title={tr("Journal des modifications", "Changelog", locale)}
      subtitle={tr("Historique des versions de Kana", "Kana release history", locale)}
      icon={<FileText className="h-4 w-4" strokeWidth={1.8} />}
      maxWidth="max-w-[580px]"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-[#343430] bg-[#181817] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1 rounded-full bg-[#1e3a8a]/35 px-2.5 py-0.5 font-mono text-[12px] font-semibold text-[#93c5fd]">
              <Sparkles className="h-3 w-3" />
              v0.1.0
            </span>
            <span className="text-[13px] font-medium text-[#ecebe4]">
              {tr("Version initiale Desktop & CLI", "Initial Desktop & CLI Release", locale)}
            </span>
          </div>
          <span className="text-[11.5px] text-[#8c8b83]">stable</span>
        </div>

        <div className="space-y-3">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-xl border border-[#2e2e2b] bg-[#181817] p-3.5"
            >
              <h3 className="text-[13px] font-medium text-[#ecebe4]">{section.title}</h3>
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-[#a8a79f]">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

export default function AccountDialogs({ active, onClose }: AccountDialogsProps) {
  if (!active) return null;
  if (active === "feedback") return <FeedbackDialog onClose={onClose} />;
  if (active === "legal") return <LegalDialog onClose={onClose} />;
  if (active === "privacy") return <PrivacyDialog onClose={onClose} />;
  if (active === "shortcuts") return <ShortcutsDialog onClose={onClose} />;
  return <ChangelogDialog onClose={onClose} />;
}
