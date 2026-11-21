import { useRef, useState, type ReactNode } from "react";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem, { MenuDivider } from "./ConversationMenuItem";
import {
  Check,
  Circle,
  CircleDot,
  FileDiff,
  Copy,
  FileText,
  FolderClosed,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Laptop,
  SquareTerminal,
  X,
} from "lucide-react";
import type { ChatMessage, PlanItem, ToolCall } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import { createPullRequest, discardWork, githubUrl, mergeWork, type BranchSummary, type PullRequest } from "../lib/forge";
import { pickFiles } from "../lib/attachments";
import { NO_PROJECT } from "../lib/projects";
import { toolCommand, toolLabel } from "../lib/toolLabel";
import { isArtifactPath } from "../lib/fileKinds";
import { artifactTitle } from "../lib/artifactRefs";
import { contextWindowFor, useModelWindowsVersion } from "../lib/contextWindow";
import ConfirmDialog from "./ConfirmDialog";
import SiteIcon from "./SiteIcon";
import { AGENTS } from "../data";
import { formatTokens, problemOf, usageToday, useUsageVersion } from "../lib/usage";

const home = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");
const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;
const dirName = (path: string) => path.split("/").slice(0, -1).join("/");
const SHOWN = 5;

/**
 * Une partie du panneau. Remplie, elle partage la hauteur à égalité avec les autres remplies (ce qui
 * dépasse défile dedans) ; vide, elle se réduit à son titre et une ligne, comme une petite carte.
 */
function Section({ title, count, compact, children }: { title: string; count?: number; compact?: boolean; children: ReactNode }) {
  return (
    <section
      className={`flex flex-col border-t border-[#2f2f2c] py-3 first:border-t-0 first:pt-0 last:pb-0 ${
        compact ? "shrink-0" : "min-h-[132px] flex-1 basis-0"
      }`}
    >
      <h3 className="mb-2 flex shrink-0 items-baseline gap-2 text-[13px] text-[#9a9992]">
        {title}
        {count !== undefined && count > 0 && <span className="text-[12px] text-[#6f6e68]">{count}</span>}
      </h3>
      <div className={compact ? "" : "min-h-0 flex-1 overflow-y-auto"}>{children}</div>
    </section>
  );
}

function Row({ icon, children, trailing, onClick, title, onContextMenu }: { icon: ReactNode; children: ReactNode; trailing?: ReactNode; onClick?: () => void; title?: string; onContextMenu?: (event: React.MouseEvent) => void }) {
  const content = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#9a9992]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-[14px] text-[#ecebe4]";
  return onClick ? (
    <button onClick={onClick} onContextMenu={onContextMenu} title={title} className={`${cls} transition hover:bg-[#2a2a28]`}>
      {content}
    </button>
  ) : (
    <div title={title} className={cls}>
      {content}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-1 py-1 text-[13px] text-[#6f6e68]">{children}</p>;
const MoreButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className="mt-1 px-1 text-[12.5px] text-[#8c8b83] transition hover:text-[#ecebe4]">
    {children}
  </button>
);

const statusColor: Record<string, string> = { added: "text-[#3fb950]", deleted: "text-[#f85149]", modified: "text-[#d29922]" };

function PullIcon({ state }: { state: string }) {
  if (state === "MERGED") return <GitMerge className="h-4 w-4 text-[#a371f7]" strokeWidth={1.8} />;
  if (state === "CLOSED") return <GitPullRequestClosed className="h-4 w-4 text-[#f85149]" strokeWidth={1.8} />;
  return <GitPullRequest className="h-4 w-4 text-[#3fb950]" strokeWidth={1.8} />;
}

function PlanIcon({ status }: { status: string }) {
  if (status === "completed") return <Check className="h-4 w-4 text-[#3fb950]" strokeWidth={2} />;
  if (status === "in_progress") return <CircleDot className="h-4 w-4 text-[#4a9bff]" strokeWidth={1.8} />;
  return <Circle className="h-4 w-4 text-[#6f6e68]" strokeWidth={1.6} />;
}

function ToolStatus({ status }: { status: string }) {
  if (status === "failed") return <X className="h-4 w-4 text-[#f85149]" strokeWidth={2} />;
  if (status === "pending" || status === "in_progress") return <CircleDot className="h-4 w-4 animate-pulse text-[#4a9bff]" strokeWidth={1.8} />;
  return <SquareTerminal className="h-4 w-4" strokeWidth={1.7} />;
}

/** Les adresses citées par l'agent dans ses réponses, sans doublon, la dernière en premier. */
function linksIn(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  for (const message of [...messages].reverse()) {
    if (message.role !== "agent") continue;
    for (const match of message.text.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) seen.add(match[0].replace(/[.,;:!?]+$/, ""));
  }
  return [...seen];
}

const shortLink = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

interface SessionPanelProps {
  conversation: Conversation;
  messages: ChatMessage[];
  plan: PlanItem[];
  summary: BranchSummary | null;
  pulls: PullRequest[];
  /** Dossier où se trouve le travail (worktree, sinon projet). */
  workPath: string | undefined;
  onOpenDiff: (path?: string) => void;
  onOpenLink: (url: string) => void;
  onRefresh: () => void;
  /** Occupation de la fenêtre de contexte de l'agent, si l'agent la donne. */
  context: { used: number; size: number; estimated?: boolean } | null;
  /** Fournisseur de la conversation. */
  agentId: string;
  onOpenRelay: () => void;
  /** La conversation a commencé : avant, il n'y a encore rien à montrer du travail de l'agent. */
  started: boolean;
  /** Compacter : l'agent repart avec un résumé de la conversation. */
  onCompact: () => void;
  canCompact: boolean;
  /** Le travail a été abandonné (dossier de travail supprimé) : l'agent doit être arrêté et le dossier oublié. */
  onDiscarded: () => void;
  /** Ouvre un fichier du dossier de travail dans le volet Fichiers (une page HTML s'y modifie visuellement). */
  onOpenFile: (path: string) => void;
  /** Ouvre le terminal du dossier de travail. */
  onOpenTerminal: () => void;
  /** Clic droit sur un artéfact : le menu (ouvrir, copier le chemin, supprimer). */
  onArtifactMenu: (path: string, x: number, y: number) => void;
  /** Donne un dossier de plus à l'agent (il le lit à partir de son chemin). */
  onAddFolder: (path: string) => void;
  canAddFolder: boolean;
}

/** Panneau de droite : où la session travaille et ce qu'elle a produit, tout dans une seule carte. */
export default function SessionPanel({ conversation, messages, plan, summary, pulls, workPath, onOpenDiff, onOpenLink, onRefresh, context: reportedContext, agentId, onOpenRelay, started, onCompact, canCompact, onDiscarded, onOpenFile, onOpenTerminal, onArtifactMenu, onAddFolder, canAddFolder }: SessionPanelProps) {
  const [folderMenu, setFolderMenu] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  useClickOutside(folderRef, folderMenu, () => setFolderMenu(false));
  const [action, setAction] = useState<"merge" | "discard" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [compacted, setCompacted] = useState(false);
  useUsageVersion();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allFiles, setAllFiles] = useState(false);
  const [allCommits, setAllCommits] = useState(false);

  const noProject = conversation.projectPath === NO_PROJECT;
  const tools: ToolCall[] = messages.flatMap((m) => m.tools);
  const running = tools.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  useModelWindowsVersion();
  // Sans mesure de l'agent, la jauge utilise la vraie taille de fenêtre du modèle choisi.
  const context =
    reportedContext?.estimated ? { ...reportedContext, size: contextWindowFor(conversation.modelId, agentId) } : reportedContext;
  const recent = tools.slice(-6).reverse();
  // Un artéfact : un fichier du dossier `artefacts/`, ou une page, un SVG, une image ou un PDF que la session a créés.
  const created = (summary?.changed ?? []).filter(
    (f) => isArtifactPath(f.path) || (f.status === "added" && /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i.test(f.path)),
  );
  const links = linksIn(messages).slice(0, 6);

  // Les artéfacts ont leur section : ils ne comptent pas parmi les modifications, ni dans les chiffres.
  const artifactPaths = new Set(created.map((f) => f.path));
  const changed = (summary?.changed ?? []).filter((f) => !artifactPaths.has(f.path));
  const additions = changed.reduce((sum, f) => sum + f.additions, 0);
  const deletions = changed.reduce((sum, f) => sum + f.deletions, 0);
  // Rien de rempli : la carte ne prend que la place de son contenu, comme une petite carte.
  const anyFilled = started && (plan.length > 0 || recent.length > 0 || created.length + links.length > 0 || changed.length > 0 || pulls.length > 0);
  const commits = summary?.commits ?? [];
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

  const worktree = conversation.worktree;
  const projectPath = conversation.projectPath && conversation.projectPath !== NO_PROJECT ? conversation.projectPath : undefined;
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
    setAction(kind);
  };

  const runAction = async () => {
    if (!summary?.branch || !worktree || !projectPath || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      if (action === "merge") {
        const result = await mergeWork(projectPath, worktree, summary.branch, conversation.title === "Nouvelle conversation" ? summary.branch : conversation.title);
        setNotice(
          `Fusionné dans ${result.base} : ${result.merged_commits} commit${result.merged_commits > 1 ? "s" : ""}${result.saved ? " (dont tes changements en cours)" : ""}.`,
        );
        setTimeout(() => setNotice(""), 8000);
        onRefresh();
      } else if (action === "discard") {
        await discardWork(projectPath, worktree, summary.branch);
        setNotice("Travail abandonné : le prochain message repart d'un dossier neuf.");
        setTimeout(() => setNotice(""), 8000);
        onDiscarded();
      }
      setAction(null);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionBusy(false);
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
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col p-3">
      <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[#232321] ${anyFilled ? "flex-1" : ""}`}>
        <div className={`flex min-h-0 flex-col overflow-y-auto p-4 ${anyFilled ? "flex-1" : ""}`}>
        <Section title="Environnement" compact>
          <Row icon={<Laptop className="h-4 w-4" strokeWidth={1.7} />}>Cet ordinateur</Row>
          <div ref={folderRef} className="relative">
            <Row icon={<FolderClosed className="h-4 w-4" strokeWidth={1.7} />} onClick={noProject ? undefined : () => setFolderMenu((v) => !v)}>
              {noProject ? "Aucun dossier" : conversation.project}
              {conversation.projectPath && !noProject && <span className="text-[#8c8b83]"> · {home(conversation.projectPath)}</span>}
            </Row>
            {folderMenu && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-[#41413d] bg-[#2b2b29] p-1 shadow-xl">
                <ConversationMenuItem
                  label="Afficher dans le Finder"
                  onClick={() => {
                    setFolderMenu(false);
                    const dir = workPath ?? conversation.projectPath;
                    if (dir) void revealItemInDir(dir).catch(() => {});
                  }}
                />
                <ConversationMenuItem
                  label="Ouvrir le dépôt sur GitHub"
                  onClick={() => {
                    setFolderMenu(false);
                    void githubUrl(workPath ?? conversation.projectPath).then((url) => {
                      if (url) void openUrl(url).catch(() => {});
                      else setNotice("Ce dossier n'a pas de dépôt GitHub.");
                    });
                  }}
                />
                <MenuDivider />
                <ConversationMenuItem
                  label="Copier le chemin"
                  onClick={() => {
                    setFolderMenu(false);
                    const dir = workPath ?? conversation.projectPath;
                    if (dir) void navigator.clipboard?.writeText(dir).catch(() => {});
                  }}
                />
                <ConversationMenuItem
                  label="Ajouter un dossier…"
                  disabled={!canAddFolder}
                  onClick={() => {
                    setFolderMenu(false);
                    void pickFiles(true).then(([path]) => path && onAddFolder(path)).catch(() => {});
                  }}
                />
                <MenuDivider />
                <ConversationMenuItem
                  label="Ouvrir dans le terminal"
                  onClick={() => {
                    setFolderMenu(false);
                    onOpenTerminal();
                  }}
                />
              </div>
            )}
          </div>
          {(summary?.base ?? summary?.branch) && (
            <Row
              icon={<GitBranch className="h-4 w-4" strokeWidth={1.7} />}
              title={summary?.branch && summary.branch !== summary.base ? `Le travail est sur la branche ${summary.branch}` : undefined}
            >
              {summary?.base ?? summary?.branch}
            </Row>
          )}
        </Section>

        <Section title="Consommation" compact>
          <div className="px-1 pb-2">
            <div className="flex items-baseline justify-between text-[13px] text-[#ecebe4]">
              <span>Contexte</span>
              <span className="text-[#8c8b83]">
                {context ? `${context.estimated ? "≈ " : ""}${formatTokens(context.used)} / ${formatTokens(context.size)} jetons` : "pas encore mesuré"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#30302d]">
              <div
                className={`h-full rounded-full ${context && context.used / context.size > 0.85 ? "bg-[#f85149]" : "bg-[#4a9bff]"}`}
                style={{ width: `${context ? Math.min(100, Math.max(1, (context.used / context.size) * 100)) : 0}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 px-1 pb-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#8c8b83]">
              {compacted
                ? "Compactée ✓"
                : context
                  ? `${formatTokens(Math.max(0, context.size - context.used))} jetons avant saturation`
                  : "Libère la mémoire de l'agent"}
            </span>
            <button
              onClick={() => {
                onCompact();
                setCompacted(true);
                setTimeout(() => setCompacted(false), 4000);
              }}
              disabled={!canCompact}
              title="Éteint l'agent et le relance avec un résumé de la conversation : tes messages restent affichés"
              className="shrink-0 rounded-lg bg-[#333331] px-3 py-1 text-[12.5px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40 disabled:hover:bg-[#333331]"
            >
              Compacter la session
            </button>
          </div>
          {AGENTS.map((agent) => {
            const usage = usageToday(agent.id);
            const problem = problemOf(agent.id);
            return (
              <Row
                key={agent.id}
                onClick={onOpenRelay}
                title="Ouvrir les réglages du relais"
                icon={<span className={`h-2 w-2 rounded-full ${problem ? "bg-[#f0883e]" : agent.id === agentId ? "bg-[#3fb950]" : "bg-[#55554f]"}`} />}
                trailing={
                  <span className={`shrink-0 text-[12.5px] ${problem ? "text-[#e69b80]" : "text-[#8c8b83]"}`}>
                    {problem ? (problem.kind === "limit" ? "limite" : "connexion") : usage.totalTokens > 0 ? formatTokens(usage.totalTokens) : usage.turns > 0 ? `${usage.turns} rép.` : "—"}
                  </span>
                }
              >
                {agent.name}
              </Row>
            );
          })}
        </Section>

        {started && (
          <>
        <Section title="Plan et tâches" count={plan.length} compact={plan.length === 0}>
          {plan.length === 0 && <Empty>L'agent n'a pas annoncé de plan.</Empty>}
          {plan.map((item, index) => (
            <Row key={index} icon={<PlanIcon status={item.status} />}>
              <span className={item.status === "completed" ? "text-[#8c8b83] line-through" : ""}>{item.content}</span>
            </Row>
          ))}
        </Section>

        <Section title="Artéfacts" count={created.length + links.length} compact={created.length + links.length === 0}>
          {created.length === 0 && links.length === 0 && <Empty>Rien de créé pour l'instant.</Empty>}
          {created.slice(0, 5).map((file) => (
            <Row key={file.path} onClick={() => onOpenFile(file.path)} onContextMenu={(e) => { e.preventDefault(); onArtifactMenu(file.path, e.clientX, e.clientY); }} title={`Ouvrir ${file.path}`} icon={<Copy className="h-4 w-4 text-[#8ab4f8]" strokeWidth={1.6} />}>
              {artifactTitle(file.path)}
            </Row>
          ))}
          {links.map((url) => (
            <Row key={url} onClick={() => onOpenLink(url)} title={url} icon={<SiteIcon url={url} />}>
              {shortLink(url)}
            </Row>
          ))}
        </Section>

        <Section title="Activité" count={tools.length} compact={recent.length === 0}>
          {recent.length === 0 && <Empty>Aucune commande lancée.</Empty>}
          {recent.map((tool) => (
            <Row key={tool.id} icon={<ToolStatus status={tool.status} />} title={toolCommand(tool) ?? undefined}>
              <span className="font-mono text-[12.5px]">{(toolCommand(tool) ?? toolLabel(tool)).split("\n")[0]}</span>
            </Row>
          ))}
          {tools.length > 0 && (
            <p className="px-1 pt-1 text-[12.5px] text-[#6f6e68]">
              {running > 0 ? `${running} en cours · ` : ""}
              {tools.length - running} terminée{tools.length - running > 1 ? "s" : ""}
            </p>
          )}
        </Section>

        {pulls.length > 0 && (
          <Section title="Pull requests" count={pulls.length}>
            {pulls.map((pr) => (
              <button
                key={pr.url}
                onClick={() => onOpenLink(pr.url)}
                className="flex w-full items-start gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-[#2a2a28]"
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
                      {pr.repo ? `${pr.repo.split("/")[1]} ` : ""}#{pr.number}
                    </span>
                    <span className="text-[#3fb950]">+{pr.additions}</span>
                    <span className="text-[#f85149]">−{pr.deletions}</span>
                    {pr.checksFailed > 0 && <span className="ml-auto text-[#f87171]">{pr.checksFailed} en échec</span>}
                  </span>
                </span>
              </button>
            ))}
          </Section>
        )}

        {commits.length > 0 && (
          <Section title="Commits" count={summary?.ahead}>
            {(allCommits ? commits : commits.slice(0, 3)).map((commit) => (
              <Row
                key={commit.hash}
                icon={<GitCommitHorizontal className="h-4 w-4" strokeWidth={1.7} />}
                trailing={<span className="shrink-0 font-mono text-[12px] text-[#6f6e68]">{commit.hash}</span>}
              >
                {commit.subject}
              </Row>
            ))}
            {commits.length > 3 && (
              <MoreButton onClick={() => setAllCommits((v) => !v)}>{allCommits ? "Réduire" : `Afficher ${commits.length - 3} de plus`}</MoreButton>
            )}
          </Section>
        )}

        <Section title="Modifications" count={changed.length} compact={changed.length === 0}>
          <Row
            icon={<FileDiff className="h-4 w-4" strokeWidth={1.7} />}
            trailing={
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[12.5px] text-[#8c8b83] hover:bg-[#333331] hover:text-[#ecebe4]" onClick={() => onOpenDiff()} role="button">
                Voir le diff
              </span>
            }
          >
            <span className="text-[#3fb950]">+{additions}</span> <span className="text-[#f85149]">−{deletions}</span>
          </Row>
          {changed.length === 0 && <Empty>Aucun fichier modifié pour l'instant.</Empty>}
          {(allFiles ? changed : changed.slice(0, SHOWN)).map((file) => (
            <Row
              key={file.path}
              onClick={() => onOpenDiff(file.path)}
              title={file.path}
              icon={<FileText className={`h-4 w-4 ${statusColor[file.status] ?? ""}`} strokeWidth={1.6} />}
              trailing={
                <span className="shrink-0 text-[12.5px]">
                  <span className="text-[#3fb950]">+{file.additions}</span> <span className="text-[#f85149]">−{file.deletions}</span>
                </span>
              }
            >
              {baseName(file.path)}
              {dirName(file.path) && <span className="text-[#6f6e68]"> · {dirName(file.path)}</span>}
            </Row>
          ))}
          {changed.length > SHOWN && (
            <MoreButton onClick={() => setAllFiles((v) => !v)}>
              {allFiles ? "Réduire" : `Afficher ${changed.length - SHOWN} de plus`}
            </MoreButton>
          )}
        </Section>
          </>
        )}
        </div>

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
      </div>

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
          {actionError && <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-red-300">{actionError}</p>}
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
    </aside>
  );
}
