import { describe, expect, it } from "vitest";
import { EMPTY_CHAT, addError, addUserMessage, applyEvent, type ChatState } from "./chatState";

const run = (chat: ChatState, ...events: Parameters<typeof applyEvent>[1][]) => events.reduce(applyEvent, chat);

describe("chatState", () => {
  it("ajoute le message de l'utilisateur et passe en occupé", () => {
    const chat = addUserMessage(EMPTY_CHAT, "salut");
    expect(chat.busy).toBe(true);
    expect(chat.messages.map((m) => [m.role, m.text])).toEqual([["user", "salut"]]);
  });

  it("assemble la réponse de l'agent, sa réflexion et ses outils", () => {
    const chat = run(
      addUserMessage(EMPTY_CHAT, "x"),
      { kind: "thought", text: "je réfléchis" },
      { kind: "tool_call", id: "t1", title: "ls", status: "pending" },
      { kind: "tool_call", id: "t1", title: null, status: "completed", output: "a b" },
      { kind: "message", text: "Voici " },
      { kind: "message", text: "la réponse" },
      { kind: "done", stop_reason: "end_turn" },
    );
    const agent = chat.messages[1];
    expect(agent.role).toBe("agent");
    expect(agent.thought).toBe("je réfléchis");
    expect(agent.text).toBe("Voici la réponse");
    expect(agent.tools).toHaveLength(1);
    expect(agent.tools[0]).toMatchObject({ id: "t1", title: "ls", status: "completed", output: "a b" });
    expect(agent.endedAt).toBeDefined();
    expect(chat.busy).toBe(false);
  });

  it("estime le contexte avec la consommation du dernier tour, puis cède la place à la mesure réelle", () => {
    let chat = run(EMPTY_CHAT, { kind: "turn_usage", input_tokens: 5000, output_tokens: 10, total_tokens: 5010 });
    expect(chat.context).toEqual({ used: 5000, size: 200_000, estimated: true });
    chat = run(chat, { kind: "context", used: 7000, size: 1_000_000 });
    expect(chat.context).toEqual({ used: 7000, size: 1_000_000 });
    chat = run(chat, { kind: "turn_usage", input_tokens: 9000, output_tokens: 1, total_tokens: 9001 });
    expect(chat.context?.used).toBe(7000);
  });

  it("remplace la réponse à /compact par une ligne « Session compactée » avec les jetons économisés", () => {
    let chat: ChatState = { ...EMPTY_CHAT, context: { used: 250_000, size: 1_000_000 } };
    chat = run(
      addUserMessage(chat, "/compact"),
      { kind: "thought", text: "résumé…" },
      { kind: "message", text: "Session compactée. Voici ce qu'on a fait…" },
      { kind: "context", used: 7_200, size: 1_000_000 },
      { kind: "done", stop_reason: "end_turn" },
    );
    expect(chat.messages.map((m) => m.role)).toEqual(["user", "notice"]);
    expect(chat.messages[1].text).toBe("Session compactée · 242,8 k tokens économisés");
  });

  it("dit simplement « Session compactée » quand le contexte n'est pas connu", () => {
    const chat = run(addUserMessage(EMPTY_CHAT, "/compact"), { kind: "message", text: "ok" }, { kind: "done", stop_reason: "end_turn" });
    expect(chat.messages[1]).toMatchObject({ role: "notice", text: "Session compactée" });
  });

  it("sépare le texte qui reprend après une pensée ou un outil", () => {
    const chat = run(
      addUserMessage(EMPTY_CHAT, "x"),
      { kind: "message", text: "Je regarde." },
      { kind: "tool_call", id: "t1", title: "ls", status: "completed" },
      { kind: "message", text: "Voilà." },
      { kind: "thought", text: "hmm" },
      { kind: "message", text: " Suite." },
    );
    expect(chat.messages[1].text).toBe("Je regarde.\n\nVoilà. Suite.");
  });

  it("ne met pas de saut de ligne devant le tout premier texte ni dans une phrase continue", () => {
    const first = run(addUserMessage(EMPTY_CHAT, "x"), { kind: "thought", text: "…" }, { kind: "message", text: "Début" }, { kind: "message", text: " suite" });
    expect(first.messages[1].text).toBe("Début suite");
  });

  it("ne touche pas aux réponses des autres messages", () => {
    const chat = run(addUserMessage(EMPTY_CHAT, "salut"), { kind: "message", text: "ok" }, { kind: "done", stop_reason: "end_turn" });
    expect(chat.messages[1].role).toBe("agent");
  });

  it("garde le plan annoncé et les demandes d'autorisation", () => {
    const chat = run(
      EMPTY_CHAT,
      { kind: "plan", entries: [{ content: "étape", status: "pending" }] },
      { kind: "permission", request_id: "r1", title: "edit", options: [] },
    );
    expect(chat.plan).toHaveLength(1);
    expect(chat.permissions[0]).toMatchObject({ requestId: "r1", title: "edit" });
  });

  it("une erreur arrête l'occupation et s'affiche", () => {
    const chat = addError(addUserMessage(EMPTY_CHAT, "x"), "boom");
    expect(chat.busy).toBe(false);
    expect(chat.messages[1]).toMatchObject({ role: "error", text: "boom" });
  });
});
