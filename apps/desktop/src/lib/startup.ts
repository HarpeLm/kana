import { makeConversation, SEED_CONVERSATIONS, type Conversation, DEFAULT_AGENT } from "./conversations";
import { inTauri } from "./env";
import { launchProject, loadProjects, saveProjects, type Project } from "./projects";
import { loadLocalConversations, loadStoredConversations, saveStoredConversations } from "./store";

export interface Startup {
  conversations: Conversation[];
  projects: Project[];
  /** Conversation neuve ouverte au démarrage. */
  selectedId: string;
}

/** Une conversation jamais utilisée : elle n'a ni dossier de travail, ni titre choisi. */
const isUnused = (c: Conversation) => c.title === "Nouvelle conversation" && !c.worktree && !c.archived;

/**
 * Ce qu'il faut au démarrage : les conversations (reprises de l'ancien stockage au premier
 * lancement avec la base), les projets, et une session neuve sur laquelle s'ouvrir.
 */
export async function loadInitial(): Promise<Startup> {
  let conversations: Conversation[] = [];
  try {
    conversations = await loadStoredConversations();
  } catch {
    // base illisible : on repart de l'ancien stockage
  }
  if (conversations.length === 0) {
    conversations = (inTauri ? loadLocalConversations() : null) ?? SEED_CONVERSATIONS;
  }

  let projects = await loadProjects().catch(() => [] as Project[]);
  const launch = await launchProject().catch(() => null);
  if (launch && !projects.some((p) => p.path === launch.path)) {
    projects = [...projects, launch];
    await saveProjects(projects).catch(() => {});
  }

  // On s'ouvre sur une session neuve, dans le projet utilisé en dernier.
  const lastUsed = [...projects].sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))[0] ?? launch ?? undefined;
  const reusable = conversations.find(isUnused);
  const fresh: Conversation = reusable
    ? { ...reusable, project: lastUsed?.name ?? reusable.project, projectPath: lastUsed?.path ?? reusable.projectPath }
    : {
        ...makeConversation(lastUsed?.name ?? "kana", DEFAULT_AGENT),
        projectPath: lastUsed?.path,
      };
  const list = [fresh, ...conversations.filter((c) => c.id !== fresh.id)];
  await saveStoredConversations(list).catch(() => {});
  return { conversations: list, projects, selectedId: fresh.id };
}
