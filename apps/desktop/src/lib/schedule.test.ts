import { describe, expect, it } from "vitest";
import {
  executeScheduledTask,
  intervalSeconds,
  isTaskDue,
  launchdPlist,
  loadScheduledRuns,
  loadScheduledTasks,
  nextRunAt,
  saveScheduledRuns,
  saveScheduledTasks,
  withinBudget,
  type ScheduledTask,
} from "./schedule";

const sampleTask = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: "task-1",
  title: "Revue CI quotidienne",
  prompt: "Analyse les logs CI et résume les erreurs.",
  projectPath: "/tmp/kana",
  agentId: "claude",
  interval: "1h",
  maxTokensBudget: 50_000,
  enabled: true,
  lastRunAt: null,
  lastStatus: null,
  ...overrides,
});

describe("schedule", () => {
  it("calcule les prochaines exécutions et l'échéance", () => {
    const base = 1_700_000_000_000;
    expect(nextRunAt("15m", null, base)).toBe(base);
    expect(nextRunAt("15m", base, base + 1_000)).toBe(base + 15 * 60_000);
    expect(nextRunAt("6h", base, base + 1_000)).toBe(base + 6 * 3_600_000);
    expect(intervalSeconds("daily:09:00")).toBe(86_400);

    const task = sampleTask({ interval: "15m", lastRunAt: base - 16 * 60_000 });
    expect(isTaskDue(task, base)).toBe(true);
    expect(isTaskDue({ ...task, enabled: false }, base)).toBe(false);
  });

  it("vérifie le budget max lors de l'exécution et génère un historique", () => {
    expect(withinBudget(25_000, 25_000)).toBe(true);
    expect(withinBudget(25_001, 25_000)).toBe(false);

    const ok = executeScheduledTask(sampleTask(), { tokensUsed: 2_400, nowMs: 1_000 });
    expect(ok.task.lastRunAt).toBe(1_000);
    expect(ok.task.lastStatus).toBe("ok");
    expect(ok.run.status).toBe("ok");
    expect(ok.run.tokensUsed).toBe(2_400);

    const over = executeScheduledTask(sampleTask({ maxTokensBudget: 1_000 }), {
      tokensUsed: 1_500,
      nowMs: 2_000,
    });
    expect(over.task.lastStatus).toBe("budget_exceeded");
    expect(over.run.status).toBe("budget_exceeded");
  });

  it("génère un XML launchd .plist échappé et persiste tâches et runs", () => {
    const plist = launchdPlist("com.kana.task&1", '/usr/local/bin/"kana"', 900);
    expect(plist).toContain("<string>com.kana.task&amp;1</string>");
    expect(plist).toContain("<string>/usr/local/bin/&quot;kana&quot;</string>");
    expect(plist).toContain("<integer>900</integer>");

    const t = sampleTask();
    saveScheduledTasks([t]);
    expect(loadScheduledTasks()).toEqual([t]);

    const { run } = executeScheduledTask(t, { tokensUsed: 800, nowMs: 5_000 });
    saveScheduledRuns([run]);
    expect(loadScheduledRuns()).toEqual([run]);
  });
});
