import { describe, expect, it } from "vitest";
import {
  formatRecordingDuration,
  getSpeechRecognitionCtor,
  getVoiceCapabilities,
  mergeTranscript,
  type SpeechRecognitionLike,
} from "./voice";

describe("mergeTranscript", () => {
  it("insère la dictée en fin de texte avec gestion propre des espaces", () => {
    expect(mergeTranscript("", "Bonjour Kana")).toEqual({
      text: "Bonjour Kana",
      cursor: 12,
    });
    expect(mergeTranscript("Bonjour", "Kana")).toEqual({
      text: "Bonjour Kana",
      cursor: 12,
    });
    expect(mergeTranscript("Bonjour ", "Kana")).toEqual({
      text: "Bonjour Kana",
      cursor: 12,
    });
    expect(mergeTranscript("Bonjour", "   ")).toEqual({
      text: "Bonjour",
      cursor: 7,
    });
  });

  it("insère la dictée au milieu du texte sans double espace", () => {
    expect(mergeTranscript("Bonjour monde", "cher", 7)).toEqual({
      text: "Bonjour cher monde",
      cursor: 12,
    });
    expect(mergeTranscript("Bonjour monde", "cher", 8)).toEqual({
      text: "Bonjour cher monde",
      cursor: 12,
    });
    expect(mergeTranscript("Bonjour, monde", "Kana", 8)).toEqual({
      text: "Bonjour, Kana monde",
      cursor: 13,
    });
  });
});

describe("formatRecordingDuration", () => {
  it("formate les durées en minutes:secondes", () => {
    expect(formatRecordingDuration(0)).toBe("0:00");
    expect(formatRecordingDuration(9)).toBe("0:09");
    expect(formatRecordingDuration(83)).toBe("1:23");
    expect(formatRecordingDuration(-5)).toBe("0:00");
    expect(formatRecordingDuration(Number.NaN)).toBe("0:00");
  });
});

describe("getVoiceCapabilities", () => {
  it("retourne un repli cohérent hors Tauri", async () => {
    const caps = await getVoiceCapabilities();
    expect(caps.whisperAvailable).toBe(false);
    expect(caps.whisperBinary).toBeNull();
    expect(typeof caps.macosDictationSupported).toBe("boolean");
    expect(caps.preferredEngine.length).toBeGreaterThan(0);
  });
});

describe("getSpeechRecognitionCtor", () => {
  it("détecte SpeechRecognition, webkitSpeechRecognition ou null", () => {
    class FakeRecognition implements SpeechRecognitionLike {
      continuous = false;
      interimResults = false;
      lang = "fr-FR";
      onstart = null;
      onend = null;
      onerror = null;
      onresult = null;
      start() {}
      stop() {}
      abort() {}
    }

    expect(getSpeechRecognitionCtor({})).toBeNull();
    expect(getSpeechRecognitionCtor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
  });
});
