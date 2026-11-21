import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

/** Formules d'introduction qu'on retire du début d'une demande pour garder l'essentiel. */
const LEAD =
  /^(?:(?:bonjour|salut|hello|hey|coucou|s'il (?:te|vous) pla[iî]t|stp|svp|merci|ok|alors|du coup|et|donc|bon)[\s,!.:;-]+)*(?:(?:est-ce que|est ce que)\s+)?(?:(?:tu|vous)\s+(?:peux|pouvez|pourrais|pourriez|veux|voudrais)(?:-tu|-vous)?|(?:peux|pouvez|pourrais|pourriez)[- ](?:tu|vous)|(?:je|j')\s*(?:voudrais|veux|aimerais|souhaite|aurais besoin|dois|cherche à|essaie de|essaye de)|on (?:peut|pourrait|doit)|il faut|il faudrait|comment|can you|could you|please|i (?:want|need|would like) to|help me)\s*(?:me |m'|nous |de |d')?/i;

const MAX = 44;

/** Un titre court tiré du premier message : sans formule de politesse, majuscule au début, coupé entre deux mots. */
export function autoTitle(message: string): string {
  let line =
    message
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("/") && !l.startsWith("Fichiers joints")) ?? "";
  line = line.replace(/`+|\*+|^#+\s*|^>\s*/g, "").replace(/\s+/g, " ").trim();
  const stripped = line.replace(LEAD, "").replace(/\s*[?!.…]+$/, "").trim();
  let title = stripped.length >= 4 ? stripped : line.replace(/\s*[?!.…]+$/, "");
  if (title.length > MAX) {
    const cut = title.slice(0, MAX);
    const space = cut.lastIndexOf(" ");
    title = `${cut.slice(0, space > 20 ? space : MAX).replace(/[,;:\s-]+$/, "")}…`;
  }
  return title ? title[0].toUpperCase() + title.slice(1) : "Nouvelle conversation";
}

/** Un titre écrit par l'agent (session à part, rien n'apparaît dans la conversation) ; `null` s'il échoue. */
export async function agentTitle(agentId: string, request: string): Promise<string | null> {
  if (!inTauri) return null;
  try {
    const raw = await invoke<string>("suggest_title", { agent: agentId, request });
    const line = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    const clean = line.replace(/^["«»'`*#\s]+|["«»'`*\s.]+$/g, "").replace(/^titre\s*:\s*/i, "").trim();
    if (clean.length < 3) return null;
    return (clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean).replace(/^./, (c) => c.toUpperCase());
  } catch {
    return null;
  }
}
