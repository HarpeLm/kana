import { describe, expect, it } from "vitest";
import {
  EMPTY_CHAT,
  addError,
  addUserMessage,
  applyEvent,
  applyTrigger,
  attachCheckpointToMessage,
  detectTrigger,
  enqueueMessage,
  extractStructuredQuestion,
  makeMessage,
  mergeCommands,
  prioritizeQueuedMessage,
  removeQueuedMessage,
  rewindChatToMessage,
  type ChatState,
} from "./chatState";
import { buildMentionItems, type FileList } from "./files";

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

  it("met à jour les commandes dynamiques ACP et les fusionne avec les commandes de base", () => {
    const chat = run(EMPTY_CHAT, {
      kind: "available_commands",
      commands: [
        { name: "web", description: "Chercher sur le web", hint: "requête" },
        { name: "compact", description: "Compacter via l'agent" },
      ],
    });
    expect(chat.commands).toHaveLength(2);
    const merged = mergeCommands(chat.commands, "we");
    expect(merged.map((c) => c.name)).toEqual(["web"]);
    const overridden = mergeCommands(chat.commands, "compact");
    expect(overridden[0].description).toBe("Compacter via l'agent");
  });

  it("gère la file d'attente et le steering des messages", () => {
    let chat = enqueueMessage(EMPTY_CHAT, "deuxième");
    chat = enqueueMessage(chat, "troisième");
    chat = enqueueMessage(chat, "   ");
    expect(chat.queued).toEqual(["deuxième", "troisième"]);
    chat = prioritizeQueuedMessage(chat, 1);
    expect(chat.queued).toEqual(["troisième", "deuxième"]);
    chat = removeQueuedMessage(chat, 1);
    expect(chat.queued).toEqual(["troisième"]);
  });

  it("détecte et applique les déclencheurs /commande et @mention", () => {
    const slash = detectTrigger("/co", 3);
    expect(slash).toEqual({ kind: "slash", query: "co", start: 0, end: 3 });
    expect(applyTrigger("/co", slash!, "/compact")).toEqual({ text: "/compact ", cursor: 9 });

    const mention = detectTrigger("Regarde @cli", 12);
    expect(mention).toEqual({ kind: "mention", query: "cli", start: 8, end: 12 });
    expect(applyTrigger("Regarde @cli vite", mention!, "@client.rs")).toEqual({
      text: "Regarde @client.rs vite",
      cursor: 18,
    });
  });

  it("construit les suggestions @fichier, @dossier, @symbole et @artéfact", () => {
    const list: FileList = {
      root: "/repo",
      files: ["artefacts/plan.html", "crates/kana-acp/src/client.rs"],
      truncated: false,
      changes: [],
      symbols: [{ name: "AcpClient", kind: "struct", path: "crates/kana-acp/src/client.rs", line: 54 }],
    };
    const all = buildMentionItems(list, "");
    expect(all.map((i) => i.kind)).toEqual(["artifact", "file", "folder", "folder", "symbol"]);
    expect(buildMentionItems(list, "symbole:Acp").map((i) => i.insert)).toEqual([
      "AcpClient (crates/kana-acp/src/client.rs:54)",
    ]);
    expect(buildMentionItems(list, "dossier:src").map((i) => i.insert)).toEqual(["crates/kana-acp/src/"]);
    expect(buildMentionItems(list, "artefact:plan").map((i) => i.insert)).toEqual(["artefacts/plan.html"]);
  });

  it("extrait une question structurée depuis un bloc ```question JSON ou texte", () => {
    const jsonMsg = makeMessage(
      "agent",
      'Avant de commencer :\n```question\n{"question":"Quels modules migrer ?","options":["Auth","Billing","Search"],"multiSelect":true}\n```',
    );
    expect(extractStructuredQuestion([jsonMsg], false)).toEqual({
      messageId: jsonMsg.id,
      question: "Quels modules migrer ?",
      options: ["Auth", "Billing", "Search"],
      multiSelect: true,
    });
    expect(extractStructuredQuestion([jsonMsg], true)).toBeNull();

    const textMsg = makeMessage(
      "agent",
      "```question\nquestion: Quel SGBD choisir ?\nmultiSelect: false\noptions:\n- SQLite\n- PostgreSQL\n```",
    );
    expect(extractStructuredQuestion([textMsg], false)).toEqual({
      messageId: textMsg.id,
      question: "Quel SGBD choisir ?",
      options: ["SQLite", "PostgreSQL"],
      multiSelect: false,
    });
  });

  it("détecte une question terminée par ? suivie de 2 à 6 options en fin de message agent", () => {
    const bulletMsg = makeMessage(
      "agent",
      "J'ai vérifié la config.\n\n**Quelle approche préfères-tu ?**\n\n- Garder le cache mémoire\n- Passer sur SQLite",
    );
    expect(extractStructuredQuestion([bulletMsg], false)).toEqual({
      messageId: bulletMsg.id,
      question: "Quelle approche préfères-tu ?",
      options: ["Garder le cache mémoire", "Passer sur SQLite"],
    });

    const numberedMsg = makeMessage(
      "agent",
      "Quel port utiliser ?\n1. 3000\n2. 8080\n3. 1420",
    );
    expect(extractStructuredQuestion([numberedMsg], false)).toEqual({
      messageId: numberedMsg.id,
      question: "Quel port utiliser ?",
      options: ["3000", "8080", "1420"],
    });
  });

  it("ignore les listes hors critères, trop longues, ou suivies d'un message utilisateur", () => {
    const oneOpt = makeMessage("agent", "Continuer ?\n- Oui");
    expect(extractStructuredQuestion([oneOpt], false)).toBeNull();

    const sevenOpts = makeMessage(
      "agent",
      "Quel jour ?\n- Lun\n- Mar\n- Mer\n- Jeu\n- Ven\n- Sam\n- Dim",
    );
    expect(extractStructuredQuestion([sevenOpts], false)).toBeNull();

    const notQuestion = makeMessage("agent", "Voici les étapes :\n- Étape 1\n- Étape 2");
    expect(extractStructuredQuestion([notQuestion], false)).toBeNull();

    const answered = [
      makeMessage("agent", "Quel choix ?\n- A\n- B"),
      makeMessage("user", "A"),
    ];
    expect(extractStructuredQuestion(answered, false)).toBeNull();
  });

  it("propose /rewind dans les commandes de base et ramène le fil au tour ciblé", () => {
    expect(mergeCommands([], "rew").map((c) => c.name)).toEqual(["rewind"]);

    let chat = addUserMessage(EMPTY_CHAT, "Tour 1");
    const m1 = chat.messages[0].id;
    chat = attachCheckpointToMessage(chat, m1, "refs/kana/checkpoints/cp1");
    chat = run(chat, { kind: "message", text: "Réponse 1" }, { kind: "done", stop_reason: "end_turn" });

    chat = addUserMessage(chat, "Tour 2");
    const m2 = chat.messages[2].id;
    chat = attachCheckpointToMessage(chat, m2, "refs/kana/checkpoints/cp2");
    chat = run(chat, { kind: "message", text: "Réponse 2" }, { kind: "done", stop_reason: "end_turn" });

    const lastRewind = rewindChatToMessage(chat);
    expect(lastRewind.checkpoint).toBe("refs/kana/checkpoints/cp2");
    expect(lastRewind.chat.messages.map((m) => m.text)).toEqual(["Tour 1", "Réponse 1"]);

    const firstRewind = rewindChatToMessage(chat, m1);
    expect(firstRewind.checkpoint).toBe("refs/kana/checkpoints/cp1");
    expect(firstRewind.chat.messages).toEqual([]);
  });

  it("masque automatiquement les secrets dans les sorties et paramètres d'outils", () => {
    const chat = run(
      addUserMessage(EMPTY_CHAT, "check"),
      {
        kind: "tool_call",
        id: "t-sec",
        title: "curl -H 'Authorization: Bearer tok_secret123'",
        status: "completed",
        raw_input: { command: "echo sk-proj-abc1234567890", api_key: "raw_secret_key" },
        output: "OPENAI_API_KEY=sk-proj-abc1234567890\nstatus=ok",
      },
    );
    const tool = chat.messages[1].tools[0];
    expect(tool.title).toContain("Bearer [SECRET MASQUÉ]");
    expect(tool.title).not.toContain("tok_secret123");
    expect(tool.input).toEqual({
      command: "echo [SECRET MASQUÉ]",
      api_key: "[SECRET MASQUÉ]",
    });
    expect(tool.output).toBe("OPENAI_API_KEY=[SECRET MASQUÉ]\nstatus=ok");
  });
});
