import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chatState";
import { buildCompactContext, buildRelayContext } from "./fork";

const msg = (role: ChatMessage["role"], text: string): ChatMessage => ({ id: text.slice(0, 4), role, text, thought: "", tools: [] });

describe("contexte transmis à un autre agent", () => {
  it("le relais nomme l'agent d'origine et garde les échanges", () => {
    const context = buildRelayContext([msg("user", "bonjour"), msg("agent", "salut")], "Claude Code");
    expect(context).toContain("Claude Code");
    expect(context).toContain("bonjour");
    expect(context).toContain("salut");
  });
  it("le compactage garde les messages récents en entier et raccourcit les anciens", () => {
    const old = "a".repeat(500);
    const messages = [msg("user", old), ...Array.from({ length: 12 }, (_, i) => msg(i % 2 ? "agent" : "user", "b".repeat(1000)))];
    const context = buildCompactContext(messages);
    expect(context).toContain("…");
    expect(context).not.toContain(old);
    expect(context.endsWith("voici mon nouveau message :\n\n")).toBe(true);
  });
  it("ignore les erreurs et les messages vides", () => {
    const context = buildCompactContext([msg("error", "boom"), msg("user", "  "), msg("user", "vrai")]);
    expect(context).not.toContain("boom");
    expect(context).toContain("Utilisateur : vrai");
  });
});
