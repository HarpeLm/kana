import { useState } from "react";
import { ArrowLeftRight, GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import type { Conversation } from "../../lib/conversations";
import type { HandoffReport } from "../../lib/worktree";
import {
  createPullRequest,
  discardWork,
  fetchPrFeedback,
  inspectMergeConflicts,
  mergeWork,
  type BranchSummary,
  type ConflictFile,
  type PrFeedback,
  type PullRequest,
} from "../../lib/forge";
import { translateRustError, useLocale } from "../../lib/i18n";
import ConfirmDialog from "../ConfirmDialog";

const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

function PullIcon({ state }: { state: string }) {
  if (state === "MERGED") return <GitMerge className="h-4 w-4 text-[#a371f7]" strokeWidth={1.8} />;
  if (state === "CLOSED") return <GitPullRequestClosed className="h-4 w-4 text-[#f85149]" strokeWidth={1.8} />;
  return <GitPullRequest className="h-4 w-4 text-[#3fb950]" strokeWidth={1.8} />;
}

interface SessionHandoffControlsProps {
  projectPath: string | undefined;
  worktree: string | undefined;
  branch: string | undefined;
  onHandoffToWorktree?: () => Promise<HandoffReport | void> | void;
  onHandoffToLocal?: () => Promise<HandoffReport | void> | void;
}

export function SessionHandoffControls({
  projectPath,
  worktree,
  branch,
  onHandoffToWorktree,
  onHandoffToLocal,
}: SessionHandoffControlsProps) {
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const locale = useLocale();

  if (!projectPath) return null;

  const runHandoff = async (direction: "to_worktree" | "to_local") => {
    const fn = direction === "to_worktree" ? onHandoffToWorktree : onHandoffToLocal;
    if (!fn || handoffBusy) return;
    setHandoffBusy(true);
    setHandoffError("");
    try {
      const report = await fn();
      const filesCount =
        report && typeof report === "object" && "transferred_files" in report ? report.transferred_files : null;
      const filesLabel =
        filesCount !== null
          ? `${filesCount} fichier${filesCount > 1 ? "s" : ""} transféré${filesCount > 1 ? "s" : ""}`
          : "changements transférés";
      const msg =
        direction === "to_worktree"
          ? `Handoff vers le worktree effectué : ${filesLabel}.`
          : `Rapatrié en local (Handoff) : ${filesLabel}.`;
      setHandoffNotice(msg);
      setTimeout(() => {
        setHandoffNotice((curr) => (curr === msg ? "" : curr));
      }, 8000);
    } catch (e) {
      setHandoffError(translateRustError(String(e), locale));
    } finally {
      setHandoffBusy(false);
    }
  };

  return (
    <div className="mt-1.5 space-y-1.5 px-1">
      {!worktree && onHandoffToWorktree && (
        <button
          type="button"
          disabled={handoffBusy}
          onClick={() => void runHandoff("to_worktree")}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#3a3a35] bg-[#1c1c1a] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] transition hover:border-[#55554f] hover:bg-[#2a2a28] disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-[#8ab4f8]" strokeWidth={1.8} />
          <span className="truncate">
            {handoffBusy ? "Transfert en cours…" : "Basculer vers un worktree isolé (Handoff)"}
          </span>
        </button>
      )}
      {worktree && branch && onHandoffToLocal && (
        <button
          type="button"
          disabled={handoffBusy}
          onClick={() => void runHandoff("to_local")}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#3a3a35] bg-[#1c1c1a] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] transition hover:border-[#55554f] hover:bg-[#2a2a28] disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-[#8ce09b]" strokeWidth={1.8} />
          <span className="truncate">
            {handoffBusy ? "Rapatriement en cours…" : "Rapatrier en local (Handoff)"}
          </span>
        </button>
      )}
      {handoffNotice && (
        <p className="rounded-lg bg-[#2a3a2c] px-2.5 py-1.5 text-[12px] text-[#9be0a8]">{handoffNotice}</p>
      )}
      {handoffError && (
        <p className="rounded-lg bg-[#3a2525] px-2.5 py-1.5 text-[12px] text-red-300">{handoffError}</p>
      )}
    </div>
  );
}

interface SessionPullRequestsSectionProps {
  pulls: PullRequest[];
  workPath: string | undefined;
  projectPath: string | undefined;
  onOpenLink: (url: string) => void;
  onImportPrFeedback?: (feedback: PrFeedback) => void;
  onNotice: (msg: string, durationMs?: number) => void;
}

export function SessionPullRequestsSection({
  pulls,
  workPath,
  projectPath,
  onOpenLink,
  onImportPrFeedback,
  onNotice,
}: SessionPullRequestsSectionProps) {
  const [importingPr, setImportingPr] = useState<number | null>(null);
  const locale = useLocale();

  if (pulls.length === 0) return null;

  const importPrFeedback = async (prNumber: number) => {
    if (!onImportPrFeedback || importingPr !== null) return;
    setImportingPr(prNumber);
    try {
      const feedback = await fetchPrFeedback(prNumber, workPath ?? projectPath);
      onImportPrFeedback(feedback);
      onNotice(`Commentaires et logs CI de #${prNumber} envoyés à l'agent.`, 6000);
    } catch (e) {
      onNotice(`Impossible d'importer #${prNumber} : ${translateRustError(String(e), locale)}`, 8000);
    } finally {
      setImportingPr(null);
    }
  };

  return (
    <section className="flex min-h-[132px] flex-1 basis-0 flex-col border-t border-[#2f2f2c] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <h3 className="mb-2 flex shrink-0 items-baseline gap-2 text-[13px] text-[#9a9992]">
        Pull / Merge requests
        <span className="text-[12px] text-[#6f6e68]">{pulls.length}</span>
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pulls.map((pr) => (
          <div key={pr.url} className="rounded-lg px-1 py-1.5 transition hover:bg-[#2a2a28]">
            <button
              type="button"
              onClick={() => onOpenLink(pr.url)}
              className="flex w-full items-start gap-3 text-left"
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                <PullIcon state={pr.state} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[#ecebe4]">
                  {pr.isDraft ? "[Brouillon] " : ""}
                  {pr.title}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-[#8c8b83]">
                  <span className="truncate">
                    {pr.forge === "gitlab" ? "GitLab · " : ""}
                    {pr.repo ? `${pr.repo.split("/")[1] ?? pr.repo} ` : ""}#{pr.number}
                  </span>
                  <span className="text-[#3fb950]">+{pr.additions}</span>
                  <span className="text-[#f85149]">−{pr.deletions}</span>
                  {pr.checksFailed > 0 && <span className="ml-auto text-[#f87171]">{pr.checksFailed} en échec</span>}
                </span>
              </span>
            </button>
            {onImportPrFeedback && (
              <div className="mt-1.5 pl-7">
                <button
                  type="button"
                  disabled={importingPr === pr.number}
                  onClick={() => void importPrFeedback(pr.number)}
                  className="rounded-md bg-[#30302d] px-2 py-0.5 text-[11.5px] text-[#dcdbd3] transition hover:bg-[#3b3b37] disabled:opacity-50"
                >
                  {importingPr === pr.number ? "Importation…" : "Importer review & logs CI"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

interface SessionWorktreeCardProps {
  conversation: Conversation;
  summary: BranchSummary | null;
  workPath: string | undefined;
  projectPath: string | undefined;
  started: boolean;
  notice: string;
  onNotice: (msg: string, durationMs?: number) => void;
  onOpenLink: (url: string) => void;
  onRefresh: () => void;
  onDiscarded: () => void;
  onResolveConflicts?: (branch: string, base: string, conflicts: ConflictFile[]) => void;
}

export default function SessionWorktreeCard({
  conversation,
  summary,
  workPath,
  projectPath,
  started,
  notice,
  onNotice,
  onOpenLink,
  onRefresh,
  onDiscarded,
  onResolveConflicts,
}: SessionWorktreeCardProps) {
  const [action, setAction] = useState<"merge" | "discard" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [conflictDetected, setConflictDetected] = useState(false);
  const [resolvingConflicts, setResolvingConflicts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locale = useLocale();

  const worktree = conversation.worktree;
  const onMainBranch = !summary?.branch || summary.branch === summary.base;
  const nothingToShare = !!summary && summary.ahead === 0 && !summary.dirty;
  const prBlocked = !summary
    ? "Aucune information sur la branche"
    : onMainBranch
      ? "Le travail est sur la branche principale : il n'y a rien à proposer"
      : !summary.has_remote
        ? "Ce projet n'a pas de remote « origin » : impossible de pousser"
        : nothingToShare
          ? "Aucun changement par rapport à la branche principale"
          : null;

  const mergeBlocked = !worktree || !projectPath
    ? "Cette conversation ne travaille pas dans un dossier de travail à part"
    : !summary
      ? "Aucune information sur la branche"
      : onMainBranch
        ? "Le travail est déjà sur la branche principale"
        : nothingToShare
          ? "Aucun changement par rapport à la branche principale"
          : null;

  const openAction = (kind: "merge" | "discard") => {
    setActionError("");
    setConflictDetected(false);
    setAction(kind);
  };

  const runAction = async () => {
    if (!summary?.branch || !worktree || !projectPath || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    setConflictDetected(false);
    try {
      if (action === "merge") {
        const result = await mergeWork(
          projectPath,
          worktree,
          summary.branch,
          conversation.title === "Nouvelle conversation" ? summary.branch : conversation.title,
        );
        onNotice(
          `Fusionné dans ${result.base} : ${result.merged_commits} commit${result.merged_commits > 1 ? "s" : ""}${result.saved ? " (dont tes changements en cours)" : ""}.`,
          8000,
        );
        onRefresh();
      } else if (action === "discard") {
        await discardWork(projectPath, worktree, summary.branch);
        onNotice("Travail abandonné : le prochain message repart d'un dossier neuf.", 8000);
        onDiscarded();
      }
      setAction(null);
    } catch (e) {
      const msg = translateRustError(String(e), locale);
      setActionError(msg);
      if (action === "merge" && /conflit|conflict/i.test(msg)) {
        setConflictDetected(true);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const resolveMergeConflictsWithAgent = async () => {
    if (!summary?.branch || !projectPath || !onResolveConflicts || resolvingConflicts) return;
    setResolvingConflicts(true);
    try {
      const conflicts = await inspectMergeConflicts(projectPath, summary.branch);
      setAction(null);
      setActionError("");
      setConflictDetected(false);
      onResolveConflicts(summary.branch, summary.base ?? "main", conflicts);
    } catch (e) {
      setActionError(translateRustError(String(e), locale));
    } finally {
      setResolvingConflicts(false);
    }
  };

  const startPr = () => {
    setTitle(conversation.title === "Nouvelle conversation" ? (summary?.branch ?? "") : conversation.title);
    setError("");
    setCreating(true);
  };

  const confirmPr = async () => {
    if (!summary?.branch || !title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await createPullRequest(summary.branch, title.trim(), workPath);
      setCreating(false);
      onRefresh();
      if (url.startsWith("http")) onOpenLink(url);
    } catch (e) {
      setError(translateRustError(String(e), locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {started && (
        <div className="shrink-0 space-y-2 border-t border-[#2f2f2c] p-3">
          {notice && <p className="rounded-lg bg-[#2a3a2c] px-3 py-2 text-[12.5px] text-[#9be0a8]">{notice}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => openAction("merge")}
              disabled={mergeBlocked !== null}
              title={mergeBlocked ?? `Fusionner ce travail dans ${summary?.base ?? "la branche principale"}, sans passer par GitHub`}
              className="min-w-0 flex-1 truncate rounded-xl bg-[#333331] px-3 py-2 text-[13.5px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40 disabled:hover:bg-[#333331]"
            >
              Fusionner dans {summary?.base ?? "main"}
            </button>
            <button
              onClick={startPr}
              disabled={prBlocked !== null}
              title={prBlocked ?? "Pousser la branche et ouvrir une pull request"}
              className="shrink-0 rounded-xl bg-[#333331] px-3 py-2 text-[13.5px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40 disabled:hover:bg-[#333331]"
            >
              Créer une PR
            </button>
          </div>
          {worktree && summary && !onMainBranch && (
            <button
              onClick={() => openAction("discard")}
              className="w-full text-center text-[12.5px] text-[#8c8b83] transition hover:text-[#f87171]"
            >
              Abandonner ce travail
            </button>
          )}
        </div>
      )}

      {action === "merge" && summary?.branch && (
        <ConfirmDialog
          title={`Fusionner dans ${summary.base ?? "la branche principale"} ?`}
          confirmLabel={actionBusy ? "En cours…" : "Fusionner"}
          confirmTone="accent"
          initialFocus="cancel"
          onCancel={() => !actionBusy && setAction(null)}
          onConfirm={() => void runAction()}
        >
          <p>Kana va, dans cet ordre :</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {summary.dirty && <li>enregistrer les changements en cours dans un commit à ton nom ;</li>}
            <li>
              fusionner <code>{summary.branch}</code> dans <code>{summary.base}</code>, directement dans ton projet
              {projectPath ? <> (<code>{home(projectPath)}</code>)</> : null}.
            </li>
          </ol>
          <p className="mt-2">
            Ça modifie les fichiers de ton projet. Rien n'est envoyé sur GitHub. Si la fusion a des conflits, elle est annulée et ton projet reste
            intact ; il doit aussi être sur <code>{summary.base}</code>, sans changement non enregistré.
          </p>
          {actionError && (
            <div className="mt-2 space-y-2">
              <p className="whitespace-pre-wrap text-[12.5px] text-red-300">{actionError}</p>
              {conflictDetected && onResolveConflicts && (
                <button
                  type="button"
                  disabled={resolvingConflicts}
                  onClick={() => void resolveMergeConflictsWithAgent()}
                  className="w-full rounded-lg bg-[#1e40af] px-3 py-1.5 text-[12.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:opacity-50"
                >
                  {resolvingConflicts ? "Inspection des conflits…" : "Résoudre les conflits avec l'agent"}
                </button>
              )}
            </div>
          )}
        </ConfirmDialog>
      )}

      {action === "discard" && summary?.branch && (
        <ConfirmDialog
          title="Abandonner ce travail ?"
          confirmLabel={actionBusy ? "En cours…" : "Abandonner le travail"}
          confirmTone="danger"
          initialFocus="cancel"
          onCancel={() => !actionBusy && setAction(null)}
          onConfirm={() => void runAction()}
        >
          <p>
            Le dossier de travail et la branche <code>{summary.branch}</code> seront supprimés, avec tout ce qu'ils contiennent :{" "}
            <strong>
              {summary.files} fichier{summary.files > 1 ? "s" : ""} modifié{summary.files > 1 ? "s" : ""}
              {summary.ahead > 0 ? `, ${summary.ahead} commit${summary.ahead > 1 ? "s" : ""} non fusionné${summary.ahead > 1 ? "s" : ""}` : ""}
            </strong>
            . C'est définitif.
          </p>
          <p className="mt-2">La conversation reste ; son prochain message repart d'un dossier neuf, depuis {summary.base}.</p>
          {actionError && <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-red-300">{actionError}</p>}
        </ConfirmDialog>
      )}

      {creating && summary?.branch && (
        <ConfirmDialog
          title="Créer une pull request ?"
          confirmLabel={busy ? "En cours…" : "Pousser et créer la PR"}
          confirmTone="accent"
          initialFocus="cancel"
          onCancel={() => !busy && setCreating(false)}
          onConfirm={() => void confirmPr()}
        >
          <p>Kana va, dans cet ordre :</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {summary.dirty && <li>enregistrer les changements en cours dans un commit à ton nom ;</li>}
            <li>
              pousser la branche <code>{summary.branch}</code> vers <code>origin</code> (publiquement visible si le dépôt l'est) ;
            </li>
            <li>
              ouvrir une pull request vers <code>{summary.base ?? "la branche principale"}</code>.
            </li>
          </ol>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la pull request"
            className="mt-3 w-full rounded-lg border border-[#3d3d3a] bg-[#222220] px-2.5 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
          />
          {error && <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-red-300">{error}</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
