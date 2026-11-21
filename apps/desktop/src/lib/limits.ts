/** Un souci d'un fournisseur qui l'empêche de répondre pour l'instant. */
export interface Problem {
  /** `limit` : quota ou limite de débit atteints ; `auth` : connexion refusée ou expirée. */
  kind: "limit" | "auth";
  /** Quand le fournisseur sera de nouveau utilisable (ms), si le message le dit. */
  until?: number;
}

const LIMIT = /usage limit|rate.?limit|quota|too many requests|\b429\b|limit (reached|exceeded)|exceeded (your|the) (current )?(limit|quota)|out of (credits|usage)|insufficient (credit|quota)|overloaded/i;
const AUTH = /\b401\b|authenticat|invalid (bearer )?token|invalid api key|not logged in|login required|unauthori[sz]ed|connexion requise/i;

/** Heure de reprise annoncée dans un message (« resets at 14:30 », « try again in 5 minutes »…). */
export function resetTime(message: string, now: number = Date.now()): number | undefined {
  const relative = /(?:in|dans)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|heures?|jours?|days?|d)\b/i.exec(message);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const factor = /^(s|sec)/.test(unit) ? 1_000 : /^(m|min)/.test(unit) ? 60_000 : /^(h|hr|heure)/.test(unit) ? 3_600_000 : 86_400_000;
    return now + n * factor;
  }
  const clock = /(?:resets?|reprise|réinitialisation|available again)[^0-9]{0,24}(\d{1,2})[:h](\d{2})/i.exec(message);
  if (clock) {
    const at = new Date(now);
    at.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    // L'heure annoncée est déjà passée aujourd'hui : c'est demain.
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return at.getTime();
  }
  const epoch = /\|(\d{10})\b/.exec(message);
  if (epoch) return Number(epoch[1]) * 1000;
  return undefined;
}

/** Reconnaît, dans un message d'erreur d'un agent, une limite atteinte ou une connexion refusée. */
export function detectProblem(message: string, now: number = Date.now()): Problem | null {
  if (LIMIT.test(message)) return { kind: "limit", until: resetTime(message, now) };
  if (AUTH.test(message)) return { kind: "auth" };
  return null;
}
