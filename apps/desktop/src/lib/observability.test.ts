// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "./chatState";
import type { Conversation } from "./conversations";
import {
  MAX_TRACE_FRAMES,
  clearTraceFrames,
  conversationToJson,
  conversationToMarkdown,
  downloadExport,
  getTraceFrames,
  recordTraceFrame,
} from "./observability";

describe("observability", () => {
  beforeEach(() => {
    clearTraceFrames();
  });

  it("conserve un ring buffer de 300 trames maximum et masque les secrets", () => {
    for (let i = 0; i < MAX_TRACE_FRAMES + 25; i++) {
      recordTraceFrame({
        direction: i % 3 === 0 ? "out" : i % 3 === 1 ? "in" : "mcp",
        method: `method/${i}`,
        summary: `token=secret-${i}`,
        payload: { idx: i, api_key: `sk-proj-secret${i}abcdef` },
      });
    }
    const all = getTraceFrames();
    expect(all).toHaveLength(MAX_TRACE_FRAMES);
    expect(all[0].method).toBe("method/25");
    expect(all[all.length - 1].method).toBe(`method/${MAX_TRACE_FRAMES + 24}`);
    expect(all[all.length - 1].summary).toBe("token=[SECRET MASQUÉ]");
    expect((all[all.length - 1].payload as { api_key: string }).api_key).toBe("[SECRET MASQUÉ]");

    clearTraceFrames();
    expect(getTraceFrames()).toEqual([]);
  });

  it("exporte une conversation en Markdown et JSON et enregistre __kanaLastExport", () => {
    const conversation: Conversation = {
      id: "c1",
      title: "Audit sécurité",
      project: "kana",
      agentId: "claude",
      modelId: "claude-sonnet-4",
      branch: "kana/c1",
      pinned: false,
    };
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", text: "Vérifie le module.", thought: "", tools: [] },
      {
        id: "m2",
        role: "agent",
        text: "Tout est conforme.",
        thought: "Analyse statique OK",
        tools: [{ id: "t1", title: "cargo test", status: "completed", output: "8 passed" }],
      },
    ];

    const md = conversationToMarkdown(conversation, messages, "fr");
    expect(md).toContain("# Audit sécurité");
    expect(md).toContain("## Utilisateur");
    expect(md).toContain("## Agent");
    expect(md).toContain("<summary>Réflexion</summary>");
    expect(md).toContain("`cargo test` (completed)");

    const mdEn = conversationToMarkdown(conversation, messages, "en");
    expect(mdEn).toContain("## User");
    expect(mdEn).toContain("<summary>Thought</summary>");

    const rawJson = conversationToJson(conversation, messages);
    const parsed = JSON.parse(rawJson);
    expect(parsed.format).toBe("kana-conversation");
    expect(parsed.conversation.id).toBe("c1");
    expect(parsed.messages).toHaveLength(2);

    downloadExport("audit.md", md, "text/markdown");
    expect((window as unknown as { __kanaLastExport?: { filename: string; content: string } }).__kanaLastExport).toMatchObject({
      filename: "audit.md",
      content: md,
    });
  });
});
