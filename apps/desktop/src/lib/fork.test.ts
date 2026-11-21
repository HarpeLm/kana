import { describe, expect, it } from "vitest";
import { getArtifactGuide } from "./agentGuide";
import type { ChatMessage } from "./chatState";
import { buildCompactContext, buildForkContext, buildRelayContext, buildResumeContext } from "./fork";

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
  it("la reprise après redémarrage renvoie vide sans échange exploitable", () => {
    expect(buildResumeContext([])).toBe("");
    expect(buildResumeContext([msg("error", "boom"), msg("user", "   ")])).toBe("");
  });
  it("la reprise après redémarrage garde les échanges récents et raccourcit les anciens", () => {
    const old = "x".repeat(500);
    const messages = [msg("user", old), ...Array.from({ length: 12 }, (_, i) => msg(i % 2 ? "agent" : "user", "y".repeat(1000)))];
    const context = buildResumeContext(messages);
    expect(context).toContain("redémarrage");
    expect(context).toContain("…");
    expect(context).not.toContain(old);
    expect(context.endsWith("voici mon nouveau message :\n\n")).toBe(true);
  });

  it("injecte les prompts et consignes en anglais quand la locale est en", () => {
    expect(getArtifactGuide("fr")).toContain("Consigne de l'application Kana");
    expect(getArtifactGuide("en")).toContain("Kana application instruction");

    const forkEn = buildForkContext([msg("user", "hello")], undefined, "en");
    expect(forkEn).toContain("fork of a previous conversation");
    expect(forkEn).toContain("User: hello");
    expect(forkEn.endsWith("here is my new message:\n\n")).toBe(true);

    const relayEn = buildRelayContext([msg("user", "hi")], "Claude Code", "en");
    expect(relayEn).toContain("continues with another provider");

    const compactEn = buildCompactContext([msg("user", "hi")], "en");
    expect(compactEn).toContain("session was compacted");

    const resumeEn = buildResumeContext([msg("user", "hi")], "en");
    expect(resumeEn).toContain("resuming after an application or agent restart");
  });
});
