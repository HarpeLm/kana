import { describe, expect, it } from "vitest";
import {
  checkCloudHealth,
  listCloudJobs,
  loadCloudConfig,
  saveCloudConfig,
  submitCloudJob,
} from "./cloud";

describe("cloud", () => {
  it("persiste la configuration Kana Cloud et valide les URLs", async () => {
    saveCloudConfig({
      url: "https://kana.example.com",
      token: "secret-cloud-token",
      enabled: true,
    });
    expect(loadCloudConfig()).toEqual({
      url: "https://kana.example.com",
      token: "secret-cloud-token",
      enabled: true,
    });

    await expect(checkCloudHealth("not-a-url")).rejects.toThrow(/http:\/\/ ou https:\/\//);
  });

  it("vérifie la santé, soumet un job distant et liste les jobs en mode fallback", async () => {
    const health = await checkCloudHealth("https://kana.example.com", "tok-123");
    expect(health.ok).toBe(true);
    expect(health.authRequired).toBe(true);

    const job = await submitCloudJob(
      "https://kana.example.com",
      "tok-123",
      "claude",
      "Vérifie les tests CI",
      "/workspace/kana",
    );
    expect(job.agent).toBe("claude");
    expect(job.status).toBe("done");
    expect(job.output).toContain("Vérifie les tests CI");

    const jobs = await listCloudJobs("https://kana.example.com", "tok-123");
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs[0].id).toBe(job.id);
  });
});
