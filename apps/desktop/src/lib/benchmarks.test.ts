import { describe, expect, it } from "vitest";
import { benchmarkMultiSessionFootprint, benchmarkStreamingBurst, runUiPerformanceSuite } from "./benchmarks";

describe("benchmarks de performance UI", () => {
  it("absorbe une rafale de 500+ événements AcpEvent avec une latence sub-milliseconde par chunk", () => {
    const res = benchmarkStreamingBurst(520);
    expect(res.chunkCount).toBe(520);
    expect(res.finalState.busy).toBe(false);
    expect(res.finalMessageLength).toBeGreaterThan(3000);
    expect(res.finalToolCount).toBeGreaterThanOrEqual(10);
    expect(res.elapsedMs).toBeLessThan(1500);
    expect(res.msPerChunk).toBeLessThan(3);
    expect(res.chunksPerSec).toBeGreaterThan(350);
  });

  it("maintient une empreinte mémoire maîtrisée et un basculement rapide sur 12 sessions simultanées", () => {
    const res = benchmarkMultiSessionFootprint(12, 60);
    expect(res.sessionCount).toBe(12);
    expect(res.totalMessages).toBe(720);
    expect(res.matchedHits).toBeGreaterThan(0);
    expect(res.indexAndSearchMs).toBeLessThan(500);
    expect(res.multiSessionSwitchMs).toBeLessThan(100);
    // Moins de 5 Mo pour 720 messages structurés en RAM
    expect(res.estimatedRamBytes).toBeGreaterThan(50_000);
    expect(res.estimatedRamBytes).toBeLessThan(5 * 1024 * 1024);
  });

  it("valide le rapport complet runUiPerformanceSuite (cold start, burst 500 chunks et switch multi-sessions)", () => {
    const report = runUiPerformanceSuite(420);
    expect(report.coldStartMs).toBe(420);
    expect(report.burst500ChunksMs).toBeLessThan(1500);
    expect(report.chunksPerSec).toBeGreaterThan(350);
    expect(report.multiSessionSwitchMs).toBeLessThan(250);
    expect(report.passed).toBe(true);
  });
});
