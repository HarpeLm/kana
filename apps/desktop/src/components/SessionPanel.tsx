import { useState, type ReactNode } from "react";
import { FolderClosed, GitBranch, GitMerge, GitPullRequest, GitPullRequestClosed, Laptop, SquareTerminal, FileDiff } from "lucide-react";
import type { ChatMessage, ToolCall } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import { createPullRequest, type BranchSummary, type PullRequest } from "../lib/forge";
import { NO_PROJECT } from "../lib/projects";
import { toolCommand, toolLabel } from "../lib/toolLabel";
import ConfirmDialog from "./ConfirmDialog";

const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-[#232321] p-4">
      <h3 className="mb-3 text-[13px] text-[#9a9992]">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon, children, trailing }: { icon: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-[14px] text-[#ecebe4]">
      <span className="shrink-0 text-[#9a9992]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </div>
  );
}

const pill = "rounded-lg bg-[#333331] px-3 py-1 text-[13px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40 disabled:hover:bg-[#333331]";

function PullIcon({ state }: { state: string }) {
  if (state === "MERGED") return <GitMerge className="h-4 w-4 text-[#a371f7]" strokeWidth={1.8} />;
  if (state === "CLOSED") return <GitPullRequestClosed className="h-4 w-4 text-[#f85149]" strokeWidth={1.8} />;
  return <GitPullRequest className="h-4 w-4 text-[#3fb950]" strokeWidth={1.8} />;
}

interface SessionPanelProps {
  conversation: Conversation;
  messages: ChatMessage[];
  summary: BranchSummary | null;
  pulls: PullRequest[];
  /** Dossier où se trouve le travail (worktree, sinon projet). */
  workPath: string | undefined;
  onOpenDiff: () => void;
  onOpenLink: (url: string) => void;
  onRefresh: () => void;
  showPlan: boolean;
  showArtifacts: boolean;
}

/** Panneau de droite : ce que la session a fait (modifications, commandes, pull requests) et où elle travaille. */
export default function SessionPanel({
  conversation,
  messages,
  summary,
  pulls,
  workPath,
  onOpenDiff,
  onOpenLink,
  onRefresh,
  showPlan,
  showArtifacts,
}: SessionPanelProps) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const noProject = conversation.projectPath === NO_PROJECT;
  const tools: ToolCall[] = messages.flatMap((m) => m.tools);
  const running = tools.filter((t) => t.status === "pending" || t.status === "in_progress");
  const finished = tools.length - running.length;

  const onMainBranch = !summary?.branch || summary.branch === summary.base;
  const nothingToShare = !!summary && summary.ahead === 0 && !summary.dirty;
  const prBlocked = !summary || onMainBranch || nothingToShare || !summary.has_remote
    ? !summary
      ? "Aucune information sur la branche"
      : onMainBranch
        ? "Le travail est sur la branche principale : il n'y a rien à proposer"
        : !summary.has_remote
          ? "Ce projet n'a pas de remote « origin » : impossible de pousser"
          : "Aucun changement par rapport à la branche principale"
    : null;

  const startPr = () => {
    setTitle(conversation.title === "Nouvelle conversation" ? summary?.branch ?? "" : conversation.title);
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
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#2b2b28] bg-[#1d1d1b] p-3">
      <Card title="Modifications">
        <Row icon={<GitBranch className="h-4 w-4" strokeWidth={1.7} />}>
          {summary?.branch ?? "Pas de branche"}
          {summary?.base && summary.branch !== summary.base && (
            <span className="text-[#8c8b83]"> · depuis {summary.base}</span>
          )}
        </Row>
        <Row
          icon={<FileDiff className="h-4 w-4" strokeWidth={1.7} />}
          trailing={
            <button className={pill} onClick={onOpenDiff}>
              Voir
            </button>
          }
        >
          <span className="text-[#3fb950]">+{summary?.additions ?? 0}</span>{" "}
          <span className="text-[#f85149]">−{summary?.deletions ?? 0}</span>
          <span className="text-[#8c8b83]">
            {" "}
            · {summary?.files ?? 0} fichier{(summary?.files ?? 0) > 1 ? "s" : ""}
            {summary && summary.ahead > 0 ? ` · ${summary.ahead} commit${summary.ahead > 1 ? "s" : ""}` : ""}
          </span>
        </Row>
        <div className="mt-2 flex justify-end">
          <button className={pill} onClick={startPr} disabled={prBlocked !== null} title={prBlocked ?? "Pousser la branche et ouvrir une pull request"}>
            Créer une PR
          </button>
        </div>
      </Card>

      {pulls.length > 0 && (
        <Card title="Pull requests">
          <ul className="space-y-1">
            {pulls.map((pr) => (
              <li key={pr.url}>
                <button
                  onClick={() => onOpenLink(pr.url)}
                  className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-[#2a2a28]"
                >
                  <span className="mt-0.5 shrink-0">
                    <PullIcon state={pr.state} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-[#ecebe4]">
                      {pr.isDraft ? "[Brouillon] " : ""}
                      {pr.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-[#8c8b83]">
                      <span className="truncate">
                        {pr.repo ? `${pr.repo.split("/")[1]} ` : ""}#{pr.number}
                      </span>
                      <span className="text-[#3fb950]">+{pr.additions}</span>
                      <span className="text-[#f85149]">−{pr.deletions}</span>
                      {pr.checksFailed > 0 && <span className="ml-auto text-[#f87171]">{pr.checksFailed} en échec</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Environnement">
        <Row icon={<Laptop className="h-4 w-4" strokeWidth={1.7} />}>Cet ordinateur</Row>
        <Row icon={<FolderClosed className="h-4 w-4" strokeWidth={1.7} />}>
          {noProject ? "Aucun dossier" : conversation.project}
          {workPath && !noProject && <span className="text-[#8c8b83]"> · {home(workPath)}</span>}
        </Row>
        {summary?.branch && <Row icon={<GitBranch className="h-4 w-4" strokeWidth={1.7} />}>{summary.branch}</Row>}
      </Card>

      <Card title="Tâches en arrière-plan">
        {running.length === 0 && <p className="py-1 text-[13px] text-[#8c8b83]">Aucune tâche en cours.</p>}
        {running.map((tool) => (
          <Row key={tool.id} icon={<SquareTerminal className="h-4 w-4" strokeWidth={1.7} />}>
            <span className="font-mono text-[12.5px]">{(toolCommand(tool) ?? toolLabel(tool)).split("\n")[0]}</span>
          </Row>
        ))}
        <p className="mt-1 text-[13px] text-[#8c8b83]">Terminées : {finished}</p>
      </Card>

      {!noProject && workPath && (
        <Card title="Sources">
          <Row icon={<FolderClosed className="h-4 w-4" strokeWidth={1.7} />}>{conversation.project}</Row>
        </Card>
      )}

      {showPlan && (
        <Card title="Plan et tâches">
          <p className="text-[13px] text-[#8c8b83]">Aucune tâche pour cette conversation.</p>
        </Card>
      )}
      {showArtifacts && (
        <Card title="Artéfacts">
          <p className="text-[13px] text-[#8c8b83]">Aucun artéfact généré dans cette session.</p>
        </Card>
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
            <li>ouvrir une pull request vers <code>{summary.base ?? "la branche principale"}</code>.</li>
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
    </section>
  );
}
