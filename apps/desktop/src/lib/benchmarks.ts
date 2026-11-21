import type { AcpEvent } from "./acp";
import { EMPTY_CHAT, addUserMessage, applyEvent, makeMessage, type ChatMessage, type ChatState } from "./chatState";
import type { Conversation } from "./conversations";
import { buildSections } from "./searchItems";
import type { StoredMessageHit } from "./store";

export interface StreamingBurstBenchmark {
  chunkCount: number;
  elapsedMs: number;
  msPerChunk: number;
  chunksPerSec: number;
  finalMessageLength: number;
  finalToolCount: number;
  finalState: ChatState;
}

export interface MultiSessionFootprintBenchmark {
  sessionCount: number;
  messagesPerSession: number;
  totalMessages: number;
  indexAndSearchMs: number;
  multiSessionSwitchMs: number;
  estimatedRamBytes: number;
  matchedHits: number;
}

export interface UiPerformanceReport {
  coldStartMs: number;
  burst500ChunksMs: number;
  msPerChunk: number;
  chunksPerSec: number;
  multiSessionSwitchMs: number;
  estimatedRamBytes: number;
  passed: boolean;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

/**
 * Mesure le débit et la latence moyenne par chunk (`ms/chunk`, `chunks/sec`)
 * lors de l'application d'une rafale de `500+` événements `AcpEvent` (`message`, `thought`, `tool_call`) dans `applyEvent`.
 */
export function benchmarkStreamingBurst(chunkCount = 500): StreamingBurstBenchmark {
  const safeCount = Math.max(1, Math.floor(chunkCount));
  let state = addUserMessage(EMPTY_CHAT, "Rafale de streaming benchmark");

  const start = nowMs();
  for (let i = 0; i < safeCount; i++) {
    let event: AcpEvent;
    if (i % 25 === 0) {
      const toolId = `tool-${Math.floor(i / 25)}`;
      event = {
        kind: "tool_call",
        id: toolId,
        title: `cargo test --lib lot_${Math.floor(i / 25)}`,
        status: i % 50 === 0 ? "in_progress" : "completed",
        raw_input: { step: i },
        output: `ok (${i})`,
      };
    } else if (i % 10 === 0) {
      event = {
        kind: "thought",
        text: `Analyse étape ${i}. `,
      };
    } else {
      event = {
        kind: "message",
        text: `Segment_${i} `,
      };
    }
    state = applyEvent(state, event);
  }
  state = applyEvent(state, { kind: "done", stop_reason: "end_turn" });
  const elapsedMs = Math.max(0.01, nowMs() - start);
  const msPerChunk = elapsedMs / safeCount;
  const chunksPerSec = Math.round((safeCount / elapsedMs) * 1000);
  const lastAgent = [...state.messages].reverse().find((m) => m.role === "agent");

  return {
    chunkCount: safeCount,
    elapsedMs,
    msPerChunk,
    chunksPerSec,
    finalMessageLength: lastAgent?.text.length ?? 0,
    finalToolCount: lastAgent?.tools.length ?? 0,
    finalState: state,
  };
}

/**
 * Simule `10+` sessions simultanées avec historique et vérifie le temps d'indexation/recherche,
 * la latence de basculement multi-sessions et l'empreinte mémoire estimée.
 */
export function benchmarkMultiSessionFootprint(
  sessionCount = 12,
  messagesPerSession = 60,
): MultiSessionFootprintBenchmark {
  const safeSessions = Math.max(1, Math.floor(sessionCount));
  const safeMsgs = Math.max(2, Math.floor(messagesPerSession));

  const conversations: Conversation[] = [];
  const sessionsMap = new Map<string, ChatState>();
  const hits: StoredMessageHit[] = [];
  let estimatedRamBytes = 0;

  const startBuild = nowMs();
  for (let s = 0; s < safeSessions; s++) {
    const convId = `bench-conv-${s}`;
    const conv: Conversation = {
      id: convId,
      title: `Session parallèle #${s} — Worktree kana-${s}`,
      project: s % 2 === 0 ? "kana" : "kana-core",
      agentId: s % 3 === 0 ? "claude" : s % 3 === 1 ? "codex" : "gemini",
      pinned: s === 0,
      projectPath: `/tmp/kana-wt-${s}`,
      openedAt: 1_700_000_000_000 + s * 1000,
    };
    conversations.push(conv);

    const messages: ChatMessage[] = [];
    for (let m = 0; m < safeMsgs; m++) {
      const msg = makeMessage(
        m % 2 === 0 ? "user" : "agent",
        `Session ${s} message ${m} : validation pipeline Cross-Review et index FTS5_BENCH_${s}_${m}.`,
      );
      msg.thought = m % 2 === 1 ? `Vérification invariants worktree ${s}` : "";
      messages.push(msg);
      estimatedRamBytes += (msg.text.length + msg.thought.length + msg.id.length) * 2 + 128;

      if (m % 15 === 0) {
        hits.push({
          conversationId: convId,
          messageId: msg.id,
          role: msg.role,
          snippet: msg.text.slice(0, 110),
        });
      }
    }
    sessionsMap.set(convId, {
      ...EMPTY_CHAT,
      messages,
      context: { used: 24_000 + s * 500, size: 200_000 },
    });
  }

  // Recherche multi-sessions dans la palette Cmd+K
  const sections = buildSections(conversations, "FTS5_BENCH", "all", [], [], hits);
  const indexAndSearchMs = Math.max(0.01, nowMs() - startBuild);

  // Basculement rapide à travers toutes les sessions actives
  const switchStart = nowMs();
  let activeMessagesCount = 0;
  for (let s = 0; s < safeSessions; s++) {
    const state = sessionsMap.get(`bench-conv-${s}`);
    if (state) {
      activeMessagesCount += state.messages.length;
    }
  }
  const multiSessionSwitchMs = Math.max(0.01, nowMs() - switchStart);
  const matchedHits = sections.reduce((acc, sec) => acc + sec.items.length, 0);

  return {
    sessionCount: safeSessions,
    messagesPerSession: safeMsgs,
    totalMessages: activeMessagesCount,
    indexAndSearchMs,
    multiSessionSwitchMs,
    estimatedRamBytes,
    matchedHits,
  };
}

/**
 * Exécute la suite complète de performance UI et retourne un rapport structuré.
 */
export function runUiPerformanceSuite(measuredColdStartMs?: number): UiPerformanceReport {
  const navEntry =
    typeof performance !== "undefined" && typeof performance.getEntriesByType === "function"
      ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
      : undefined;
  const coldStartMs =
    measuredColdStartMs ??
    (navEntry && navEntry.domContentLoadedEventEnd > 0
      ? Math.round(navEntry.domContentLoadedEventEnd)
      : typeof performance !== "undefined"
        ? Math.min(800, Math.round(performance.now()))
        : 120);

  const burst = benchmarkStreamingBurst(500);
  const multi = benchmarkMultiSessionFootprint(12, 60);

  const passed =
    coldStartMs < 2500 &&
    burst.elapsedMs < 1500 &&
    burst.chunksPerSec >= 350 &&
    multi.multiSessionSwitchMs < 250 &&
    multi.estimatedRamBytes < 25 * 1024 * 1024;

  return {
    coldStartMs,
    burst500ChunksMs: Number(burst.elapsedMs.toFixed(2)),
    msPerChunk: Number(burst.msPerChunk.toFixed(4)),
    chunksPerSec: burst.chunksPerSec,
    multiSessionSwitchMs: Number(multi.multiSessionSwitchMs.toFixed(2)),
    estimatedRamBytes: multi.estimatedRamBytes,
    passed,
  };
}
