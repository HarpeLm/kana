import { useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "../lib/env";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem, { MenuDivider } from "./ConversationMenuItem";
import {
  Check,
  Circle,
  CircleDot,
  Copy,
  FileDiff,
  FileText,
  FolderClosed,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  SquareTerminal,
  X,
} from "lucide-react";
import type { CrossReviewPipelineState } from "./AdvisorModal";
import type { ChatMessage, PlanItem, ToolCall } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import type { HandoffReport } from "../lib/worktree";
import {
  forgeUrl,
  type BranchSummary,
  type ConflictFile,
  type PrFeedback,
  type PullRequest,
} from "../lib/forge";
import { pickFiles } from "../lib/attachments";
import { NO_PROJECT } from "../lib/projects";
import { toolCommand, toolLabel } from "../lib/toolLabel";
import { isArtifactPath } from "../lib/fileKinds";
import { artifactTitle } from "../lib/artifactRefs";
import SiteIcon from "./SiteIcon";
import SessionEnvironmentCard from "./session/SessionEnvironmentCard";
import SessionMemoryUsageCard from "./session/SessionMemoryUsageCard";
import SessionWorktreeCard, {
  SessionHandoffControls,
  SessionPullRequestsSection,
} from "./session/SessionWorktreeCard";

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

function Row({
  icon,
  children,
  trailing,
  onClick,
  title,
  onContextMenu,
}: {
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  title?: string;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
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
  /** Ouvre le sélecteur de dossier natif (Finder) pour associer un dossier de projet. */
  onOpenFolder?: () => void;
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
  /** Ouvre le conseiller interactif `/advisor`. */
  onOpenAdvisor?: () => void;
  /** État courant du pipeline Cross-Review multi-fournisseurs. */
  crossReview?: CrossReviewPipelineState | null;
  /** Bascule le travail local en cours vers un worktree isolé (Handoff). */
  onHandoffToWorktree?: () => Promise<HandoffReport | void> | void;
  /** Rapatrie le travail du worktree vers le dossier local sans fusion définitive (Handoff). */
  onHandoffToLocal?: () => Promise<HandoffReport | void> | void;
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
  onOpenFolder,
  onAddFolder,
  canAddFolder,
  onChangeEnvironment,
  subagents,
  onSpawnSubagent,
  onOpenSubagent,
  onResolveConflicts,
  onImportPrFeedback,
  onOpenAdvisor,
  crossReview,
  onHandoffToWorktree,
  onHandoffToLocal,
}: SessionPanelProps) {
  const [folderMenu, setFolderMenu] = useState(false);
  const folderRef = useRef<HTMLDivElement>(null);
  useClickOutside(folderRef, folderMenu, () => setFolderMenu(false));
  const [notice, setNotice] = useState("");
  const [allFiles, setAllFiles] = useState(false);
  const [allCommits, setAllCommits] = useState(false);

  const showNotice = (msg: string, durationMs = 8000) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), durationMs);
  };

  const projectPath = conversation.projectPath && conversation.projectPath !== NO_PROJECT ? conversation.projectPath : undefined;
  const activeDir = workPath ?? projectPath;
  const noProject = !activeDir;
  const tools: ToolCall[] = messages.flatMap((m) => m.tools);
  const running = tools.filter((t) => t.status === "pending" || t.status === "in_progress").length;
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

  return (
    <aside className="flex w-[360px] shrink-0 flex-col p-2 pl-1">
      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1e1f22]/75 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.42)] ${
          anyFilled ? "flex-1" : ""
        }`}
      >
        <div className={`flex min-h-0 flex-col overflow-y-auto p-4 ${anyFilled ? "flex-1" : ""}`}>
          <Section title="Environnement" compact>
            <SessionEnvironmentCard
              conversation={conversation}
              agentId={agentId}
              workPath={workPath}
              projectPath={projectPath}
              onChangeEnvironment={onChangeEnvironment}
            />
            <div ref={folderRef} className="relative">
              <Row
                icon={<FolderClosed className="h-4 w-4" strokeWidth={1.7} />}
                onClick={noProject ? onOpenFolder : () => setFolderMenu((v) => !v)}
                title={noProject ? "Choisir un dossier de projet" : undefined}
              >
                {noProject ? (
                  <span className="text-[#b8b7ae]">Aucun dossier</span>
                ) : (
                  conversation.project
                )}
                {conversation.projectPath && !noProject && <span className="text-[#8c8b83]"> · {home(conversation.projectPath)}</span>}
              </Row>
              {folderMenu && (
                <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-white/[0.09] bg-[#1e1f22]/95 p-1 backdrop-blur-2xl shadow-xl">
                  <ConversationMenuItem
                    label="Afficher dans le Finder"
                    onClick={() => {
                      setFolderMenu(false);
                      if (!activeDir) {
                        showNotice("Aucun dossier associé à cette conversation.");
                        return;
                      }
                      if (inTauri) {
                        void invoke("reveal_in_finder", { path: activeDir }).catch((err) => {
                          void revealItemInDir(activeDir).catch(() =>
                            showNotice(`Impossible d'ouvrir le Finder : ${String(err)}`),
                          );
                        });
                      } else {
                        showNotice(`Dossier : ${activeDir}`);
                      }
                    }}
                  />
                  <ConversationMenuItem
                    label="Ouvrir sur GitHub / GitLab / Forge"
                    onClick={() => {
                      setFolderMenu(false);
                      if (!activeDir) {
                        showNotice("Aucun dossier associé à cette conversation.");
                        return;
                      }
                      void forgeUrl(activeDir)
                        .then((url) => {
                          if (!url) {
                            showNotice("Ce dossier n'a pas de dépôt distant.");
                            return;
                          }
                          if (inTauri) {
                            void openUrl(url).catch((err) =>
                              showNotice(`Impossible d'ouvrir le lien : ${String(err)}`),
                            );
                          } else {
                            window.open(url, "_blank", "noopener,noreferrer");
                          }
                        })
                        .catch(() => showNotice("Ce dossier n'a pas de dépôt distant."));
                    }}
                  />
                  <MenuDivider />
                  <ConversationMenuItem
                    label="Copier le chemin"
                    onClick={() => {
                      setFolderMenu(false);
                      if (!activeDir) {
                        showNotice("Aucun dossier associé à cette conversation.");
                        return;
                      }
                      if (navigator.clipboard?.writeText) {
                        void navigator.clipboard
                          .writeText(activeDir)
                          .then(() => showNotice("Chemin copié dans le presse-papiers.", 3000))
                          .catch(() => showNotice(`Chemin : ${activeDir}`, 4000));
                      } else {
                        showNotice(`Chemin : ${activeDir}`, 4000);
                      }
                    }}
                  />
                  <ConversationMenuItem
                    label="Ajouter un dossier…"
                    disabled={!canAddFolder}
                    onClick={() => {
                      setFolderMenu(false);
                      void pickFiles(true)
                        .then(([path]) => {
                          if (path) {
                            onAddFolder(path);
                            showNotice("Dossier ajouté à la session.", 3000);
                          }
                        })
                        .catch((err) => showNotice(`Impossible d'ajouter un dossier : ${String(err)}`));
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
            {!noProject && (summary?.branch ?? summary?.base ?? conversation.branch) && (
              <Row
                icon={<GitBranch className="h-4 w-4" strokeWidth={1.7} />}
                onClick={() => {
                  if (!activeDir) return;
                  void forgeUrl(activeDir)
                    .then((url) => {
                      if (!url) {
                        showNotice("Ce dossier n'a pas de dépôt distant.");
                        return;
                      }
                      if (inTauri) {
                        void openUrl(url).catch((err) => showNotice(`Impossible d'ouvrir le lien : ${String(err)}`));
                      } else {
                        window.open(url, "_blank", "noopener,noreferrer");
                      }
                    })
                    .catch(() => showNotice("Ce dossier n'a pas de dépôt distant."));
                }}
                title={
                  summary?.branch && summary.branch !== summary.base
                    ? `Branche active : ${summary.branch} (cliquer pour ouvrir le dépôt)`
                    : "Cliquer pour ouvrir le dépôt GitHub / GitLab"
                }
              >
                {summary?.branch ?? summary?.base ?? conversation.branch}
              </Row>
            )}
            <SessionHandoffControls
              projectPath={projectPath}
              worktree={conversation.worktree}
              branch={summary?.branch ?? conversation.branch}
              onHandoffToWorktree={onHandoffToWorktree}
              onHandoffToLocal={onHandoffToLocal}
            />
          </Section>

          <SessionMemoryUsageCard
            conversation={conversation}
            projectPath={projectPath}
            context={reportedContext}
            agentId={agentId}
            onOpenRelay={onOpenRelay}
            onCompact={onCompact}
            canCompact={canCompact}
            subagents={subagents}
            onSpawnSubagent={onSpawnSubagent}
            onOpenSubagent={onOpenSubagent}
            onOpenAdvisor={onOpenAdvisor}
            crossReview={crossReview}
          />

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
                  <Row
                    key={file.path}
                    onClick={() => onOpenFile(file.path)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onArtifactMenu(file.path, e.clientX, e.clientY);
                    }}
                    title={`Ouvrir ${file.path}`}
                    icon={<Copy className="h-4 w-4 text-[#8ab4f8]" strokeWidth={1.6} />}
                  >
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

              <SessionPullRequestsSection
                pulls={pulls}
                workPath={workPath}
                projectPath={projectPath}
                onOpenLink={onOpenLink}
                onImportPrFeedback={onImportPrFeedback}
                onNotice={showNotice}
              />

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

        <SessionWorktreeCard
          conversation={conversation}
          summary={summary}
          workPath={workPath}
          projectPath={projectPath}
          started={started}
          notice={notice}
          onNotice={showNotice}
          onOpenLink={onOpenLink}
          onRefresh={onRefresh}
          onDiscarded={onDiscarded}
          onResolveConflicts={onResolveConflicts}
        />
      </div>
    </aside>
  );
}
