import { SEED_CONVERSATIONS, type Conversation } from "./conversations";
import { loadLocalConversations, loadStoredConversations, saveStoredConversations } from "./store";
import { inTauri } from "./env";

/**
 * Les conversations au démarrage. Au premier lancement avec la base, on y reprend la liste de
 * l'ancien stockage du navigateur (ou les exemples), pour ne rien perdre.
 */
export async function loadInitialConversations(): Promise<Conversation[]> {
  try {
    const stored = await loadStoredConversations();
    if (stored.length > 0) return stored;
  } catch {
    // base illisible : on repart de l'ancien stockage
  }
  const migrated = (inTauri ? loadLocalConversations() : null) ?? SEED_CONVERSATIONS;
  await saveStoredConversations(migrated).catch(() => {});
  return migrated;
}
