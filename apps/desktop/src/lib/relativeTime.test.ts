import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  it("décrit le temps écoulé", () => {
    expect(relativeTime(now - 10_000, now)).toBe("À l'instant");
    expect(relativeTime(now - 2 * 60_000, now)).toBe("Il y a 2 minutes");
    expect(relativeTime(now - 60 * 60_000, now)).toBe("Il y a 1 heure");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("Il y a 3 jours");
  });
});
