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
