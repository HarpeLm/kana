import { useRef, useState, type ReactNode } from "react";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem, { MenuDivider } from "./ConversationMenuItem";
import {
  Bot,
  Box,
  Check,
  Circle,
  CircleDot,
  Container,
  FileDiff,
  FolderPlus,
  Copy,
  FileText,
  FolderClosed,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Laptop,
  Plus,
  Server,
  Shield,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import type { ChatMessage, PlanItem, ToolCall } from "../lib/chatState";
import type { Conversation, EnvironmentKind } from "../lib/conversations";
import {
  createPullRequest,
  discardWork,
  fetchPrFeedback,
  forgeUrl,
  inspectMergeConflicts,
  mergeWork,
  type BranchSummary,
  type ConflictFile,
  type PrFeedback,
  type PullRequest,
} from "../lib/forge";
import { pickFiles } from "../lib/attachments";
import {
  NO_PROJECT,
  addProjectMemory,
  getProjectMemory,
  removeProjectMemory,
  useProjectMemoryVersion,
} from "../lib/projects";
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
  /** Modifie l'environnement d'exécution (local, sandbox OS, SSH, Docker, DevContainer). */
  onChangeEnvironment: (environment: Conversation["environment"]) => void;
  /** Sous-agents parallèles rattachés à cette conversation. */
  subagents: Array<{
    conversation: Conversation;
    status: "running" | "done" | "error" | "idle";
  }>;
  /** Lance un sous-agent parallèle lié au fil courant. */
  onSpawnSubagent: (roleLabel: string, prompt: string, readOnly?: boolean) => void;
  /** Ouvre le fil d'un sous-agent. */
  onOpenSubagent: (id: string) => void;
  /** Demande à l'agent de résoudre les conflits détectés lors de la fusion. */
  onResolveConflicts?: (branch: string, base: string, conflicts: ConflictFile[]) => void;
  /** Injecte les commentaires de review et logs CI en échec d'une PR/MR dans la conversation. */
  onImportPrFeedback?: (feedback: PrFeedback) => void;
}

/** Panneau de droite : où la session travaille et ce qu'elle a produit, tout dans une seule carte. */
export default function SessionPanel({
  conversation,
  messages,
  plan,
  summary,
  pulls,
  workPath,
  onOpenDiff,
  onOpenLink,
  onRefresh,
  context: reportedContext,
  agentId,
  onOpenRelay,
  started,
  onCompact,
  canCompact,
  onDiscarded,
  onOpenFile,
  onOpenTerminal,
  onArtifactMenu,
  onAddFolder,
  canAddFolder,
  onChangeEnvironment,
  subagents,
  onSpawnSubagent,
  onOpenSubagent,
  onResolveConflicts,
  onImportPrFeedback,
}: SessionPanelProps) {
  const [folderMenu, setFolderMenu] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  useClickOutside(folderRef, folderMenu, () => setFolderMenu(false));
  const [action, setAction] = useState<"merge" | "discard" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [conflictDetected, setConflictDetected] = useState(false);
  const [resolvingConflicts, setResolvingConflicts] = useState(false);
  const [importingPr, setImportingPr] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [compacted, setCompacted] = useState(false);
  useUsageVersion();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allFiles, setAllFiles] = useState(false);
  const [allCommits, setAllCommits] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [subagentDraft, setSubagentDraft] = useState("");
  useProjectMemoryVersion();

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
  const memoryNotes = projectPath ? getProjectMemory(projectPath) : [];
  const env = conversation.environment ?? { kind: "local" as const, sandbox: false };
  const envKind: EnvironmentKind = env.kind ?? "local";
  const envIcon =
    envKind === "ssh" ? (
      <Server className="h-4 w-4" strokeWidth={1.7} />
    ) : envKind === "docker" ? (
      <Container className="h-4 w-4" strokeWidth={1.7} />
    ) : envKind === "devcontainer" ? (
      <Box className="h-4 w-4" strokeWidth={1.7} />
    ) : env.sandbox ? (
      <Shield className="h-4 w-4 text-[#8ce09b]" strokeWidth={1.7} />
    ) : (
      <Laptop className="h-4 w-4" strokeWidth={1.7} />
    );
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
      const msg = String(e);
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
      setActionError(String(e));
    } finally {
      setResolvingConflicts(false);
    }
  };

  const importPrFeedback = async (prNumber: number) => {
    if (!onImportPrFeedback || importingPr !== null) return;
    setImportingPr(prNumber);
    try {
      const feedback = await fetchPrFeedback(prNumber, workPath ?? projectPath);
      onImportPrFeedback(feedback);
      setNotice(`Commentaires et logs CI de #${prNumber} envoyés à l'agent.`);
      setTimeout(() => setNotice(""), 6000);
    } catch (e) {
      setNotice(`Impossible d'importer #${prNumber} : ${String(e)}`);
      setTimeout(() => setNotice(""), 8000);
    } finally {
      setImportingPr(null);
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
          <div className="space-y-2 px-1 pb-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#9a9992]">
                {envIcon}
              </span>
              <select
                aria-label="Environnement d'exécution"
                value={envKind}
                onChange={(e) => {
                  const nextKind = e.target.value as EnvironmentKind;
                  if (nextKind === "local") {
                    onChangeEnvironment({ kind: "local", sandbox: env.sandbox ?? false });
                  } else {
                    onChangeEnvironment({ kind: nextKind, target: envKind === nextKind ? env.target ?? "" : "" });
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
              >
                <option value="local">Cet ordinateur</option>
                <option value="ssh">SSH distant</option>
                <option value="docker">Conteneur Docker</option>
                <option value="devcontainer">DevContainer</option>
              </select>
            </div>

            {envKind === "local" && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[12.5px] text-[#cfcec6] hover:bg-[#2a2a28]">
                <input
                  type="checkbox"
                  checked={!!env.sandbox}
                  onChange={(e) =>
                    onChangeEnvironment({
                      kind: "local",
                      sandbox: e.target.checked,
                      readOnly: env.readOnly,
                    })
                  }
                  className="h-3.5 w-3.5 accent-[#d97757]"
                />
                <span>Sandbox OS isolé</span>
              </label>
            )}

            {envKind === "ssh" && (
              <input
                type="text"
                aria-label="Cible SSH"
                value={env.target ?? ""}
                onChange={(e) => onChangeEnvironment({ kind: "ssh", target: e.target.value })}
                placeholder="user@host:/chemin"
                className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
              />
            )}

            {envKind === "docker" && (
              <input
                type="text"
                aria-label="Conteneur Docker"
                value={env.target ?? ""}
                onChange={(e) => onChangeEnvironment({ kind: "docker", target: e.target.value })}
                placeholder="nom-du-conteneur"
                className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
              />
            )}

            {envKind === "devcontainer" && (
              <input
                type="text"
                aria-label="Dossier DevContainer"
                value={env.target ?? ""}
                onChange={(e) => onChangeEnvironment({ kind: "devcontainer", target: e.target.value })}
                placeholder="/chemin/du/workspace"
                className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
              />
            )}
          </div>
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
                  label="Ouvrir sur GitHub / GitLab / Forge"
                  onClick={() => {
                    setFolderMenu(false);
                    void forgeUrl(workPath ?? conversation.projectPath).then((url) => {
                      if (url) void openUrl(url).catch(() => {});
                      else setNotice("Ce dossier n'a pas de dépôt distant.");
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
          {conversation.extraFolders?.map((folder) => (
            <Row key={folder} icon={<FolderPlus className="h-4 w-4" strokeWidth={1.7} />} title={folder}>
              {folder.split("/").filter(Boolean).pop() ?? folder}
              <span className="text-[#8c8b83]"> · ajouté</span>
            </Row>
          ))}
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

        <Section title="Mémoire du projet" count={memoryNotes.length} compact>
          {!projectPath ? (
            <Empty>Associe un projet pour partager des notes entre sessions.</Empty>
          ) : (
            <div className="space-y-2 px-1">
              {memoryNotes.length === 0 ? (
                <p className="text-[12.5px] text-[#6f6e68]">Aucune note persistante enregistrée.</p>
              ) : (
                <ul className="space-y-1.5">
                  {memoryNotes.map((note, idx) => (
                    <li
                      key={`${idx}-${note}`}
                      className="flex items-start justify-between gap-2 rounded-lg bg-[#1c1c1a] px-2.5 py-1.5 text-[12.5px] text-[#dcdbd3]"
                    >
                      <span className="min-w-0 flex-1 break-words select-text">{note}</span>
                      <button
                        type="button"
                        aria-label="Supprimer la note"
                        onClick={() => removeProjectMemory(projectPath, idx)}
                        className="shrink-0 rounded p-0.5 text-[#7e7d76] transition hover:bg-[#2f2f2c] hover:text-[#f87171]"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!memoryDraft.trim()) return;
                  addProjectMemory(projectPath, memoryDraft);
                  setMemoryDraft("");
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={memoryDraft}
                  onChange={(e) => setMemoryDraft(e.target.value)}
                  placeholder="Ajouter une note projet…"
                  aria-label="Nouvelle note projet"
                  className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
                />
                <button
                  type="submit"
                  disabled={!memoryDraft.trim()}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-[#333331] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span>Ajouter</span>
                </button>
              </form>
            </div>
          )}
        </Section>

        <Section title="Sous-agents parallèles" count={subagents.length} compact>
          <div className="space-y-2 px-1">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onSpawnSubagent(
                    "Recherche",
                    `Explore en lecture seule les fichiers liés à « ${conversation.title} » et résume les points importants.`,
                    true,
                  )
                }
                className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3a3a36]"
              >
                Recherche (lecture seule)
              </button>
              <button
                type="button"
                onClick={() =>
                  onSpawnSubagent(
                    "Tests",
                    `Exécute les tests du projet en arrière-plan pour « ${conversation.title} » et signale les éventuels échecs.`,
                    false,
                  )
                }
                className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3a3a36]"
              >
                Tests en arrière-plan
              </button>
              <button
                type="button"
                onClick={() =>
                  onSpawnSubagent(
                    "Worker",
                    `Travaille dans un worktree isolé sur une sous-tâche parallèle de « ${conversation.title} ».`,
                    false,
                  )
                }
                className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3a3a36]"
              >
                Worker (worktree isolé)
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!subagentDraft.trim()) return;
                onSpawnSubagent("Sous-agent", subagentDraft, false);
                setSubagentDraft("");
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={subagentDraft}
                onChange={(e) => setSubagentDraft(e.target.value)}
                placeholder="Consigne du sous-agent…"
                aria-label="Tâche du sous-agent"
                className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
              />
              <button
                type="submit"
                disabled={!subagentDraft.trim()}
                className="shrink-0 rounded-lg bg-[#333331] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40"
              >
                Lancer
              </button>
            </form>

            {subagents.length > 0 && (
              <div className="space-y-1">
                {subagents.map(({ conversation: sub, status }) => {
                  const statusLabel =
                    status === "running"
                      ? "En cours…"
                      : status === "error"
                        ? "Erreur"
                        : status === "done"
                          ? "Terminé"
                          : "En attente";
                  const statusTone =
                    status === "running"
                      ? "text-[#4a9bff]"
                      : status === "error"
                        ? "text-[#f87171]"
                        : status === "done"
                          ? "text-[#3fb950]"
                          : "text-[#8c8b83]";
                  return (
                    <Row
                      key={sub.id}
                      onClick={() => onOpenSubagent(sub.id)}
                      icon={<Bot className="h-4 w-4" strokeWidth={1.7} />}
                      trailing={<span className={`shrink-0 text-[11.5px] ${statusTone}`}>{statusLabel}</span>}
                    >
                      <span className="mr-1.5 rounded bg-[#2e2e2b] px-1.5 py-0.5 text-[11px] text-[#b8b7ae]">
                        {sub.roleLabel ?? "Sous-agent"}
                      </span>
                      {sub.title}
                    </Row>
                  );
                })}
              </div>
            )}
          </div>
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
          <Section title="Pull / Merge requests" count={pulls.length}>
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
          {actionError && (
            <div className="mt-2 space-y-2">
              <p className="whitespace-pre-wrap text-[12.5px] text-red-300">{actionError}</p>
              {conflictDetected && onResolveConflicts && (
                <button
                  type="button"
                  disabled={resolvingConflicts}
                  onClick={() => void resolveMergeConflictsWithAgent()}
                  className="w-full rounded-lg bg-[#d97757] px-3 py-1.5 text-[12.5px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:opacity-50"
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
    </aside>
  );
}
