// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  estimateCostUsd,
  formatCostUsd,
  recordTokens,
  recordTurn,
  reloadUsageFromStorage,
  totalCostTodayUsd,
  usageForProject,
  usageForSession,
  usageToday,
} from "./usage";

describe("usage & costs", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadUsageFromStorage();
  });

  it("calcule les coûts estimés en $ incluant cache read et cache write", () => {
    // Claude Sonnet : $3/M input, $15/M output, $0.30/M cache read, $3.75/M cache write
    const cost = estimateCostUsd("claude", 1_000_000, 100_000, 1_000_000, 200_000, "claude-sonnet-4");
    expect(cost).toBeCloseTo(5.55, 6);
    expect(formatCostUsd(cost)).toBe("$5.55");
    expect(formatCostUsd(0.0042)).toBe("$0.0042");
    expect(formatCostUsd(0)).toBe("$0.00");
    expect(estimateCostUsd("opencode", 50_000, 10_000, 0, 0, "opencode/alpha:free")).toBe(0);
  });

  it("suit les jetons cache et coûts par session, projet et jour", () => {
    recordTokens("claude", 10_000, 2_000, 12_000, {
      cacheRead: 50_000,
      cacheWrite: 4_000,
      threadId: "t1",
      projectPath: "/repo/kana",
      modelId: "claude-sonnet-4",
    });
    recordTurn("claude", { threadId: "t1", projectPath: "/repo/kana" });

    recordTokens("codex", 20_000, 5_000, 25_000, {
      threadId: "t2",
      projectPath: "/repo/kana",
      modelId: "gpt-5",
    });

    const claudeToday = usageToday("claude");
    expect(claudeToday.turns).toBe(1);
    expect(claudeToday.cacheReadTokens).toBe(50_000);
    expect(claudeToday.cacheWriteTokens).toBe(4_000);
    expect(claudeToday.costUsd).toBeGreaterThan(0);

    const session1 = usageForSession("t1");
    expect(session1.totalTokens).toBe(12_000);
    expect(session1.cacheReadTokens).toBe(50_000);
    expect(session1.turns).toBe(1);

    const project = usageForProject("/repo/kana");
    expect(project.totalTokens).toBe(37_000);
    expect(project.costUsd).toBeCloseTo(session1.costUsd + usageForSession("t2").costUsd, 6);
    expect(totalCostTodayUsd()).toBeCloseTo(project.costUsd, 6);
  });
});
