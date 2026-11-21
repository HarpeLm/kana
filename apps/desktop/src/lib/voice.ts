import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface VoiceCapabilities {
  whisperAvailable: boolean;
  whisperBinary: string | null;
  macosDictationSupported: boolean;
  preferredEngine: string;
}

export type VoiceStatus = "idle" | "listening" | "transcribing" | "error";

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/** Retourne le constructeur Web Speech API disponible (`SpeechRecognition` ou `webkitSpeechRecognition`). */
export function getSpeechRecognitionCtor(target?: unknown): SpeechRecognitionCtor | null {
  const host = (target ?? (typeof window !== "undefined" ? window : undefined)) as SpeechRecognitionWindow | undefined;
  if (!host || typeof host !== "object") return null;
  if (typeof host.SpeechRecognition === "function") return host.SpeechRecognition;
  if (typeof host.webkitSpeechRecognition === "function") return host.webkitSpeechRecognition;
  return null;
}

/**
 * Insère un texte dicté à la position du curseur (ou à la fin) en gérant proprement
 * les espaces sans créer de doubles espaces.
 */
export function mergeTranscript(existing: string, dictated: string, cursor?: number): { text: string; cursor: number } {
  const clean = dictated.replace(/\s+/g, " ").trim();
  const pos = cursor === undefined ? existing.length : Math.max(0, Math.min(cursor, existing.length));
  if (!clean) {
    return { text: existing, cursor: pos };
  }

  const before = existing.slice(0, pos);
  const after = existing.slice(pos);

  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before) && !/^[,.;:!?)}\]]/.test(clean);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after) && !/^[,.;:!?)}\]]/.test(after);

  const prefix = needsSpaceBefore ? " " : "";
  const suffix = needsSpaceAfter ? " " : "";
  const text = `${before}${prefix}${clean}${suffix}${after}`;
  const nextCursor = before.length + prefix.length + clean.length;

  return { text, cursor: nextCursor };
}

/** Formate une durée d'enregistrement en `m:ss` (ex. `0:00`, `0:09`, `1:23`). */
export function formatRecordingDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function browserFallbackCapabilities(): VoiceCapabilities {
  const hasSpeech = getSpeechRecognitionCtor() !== null;
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent || "");
  return {
    whisperAvailable: false,
    whisperBinary: null,
    macosDictationSupported: isMac,
    preferredEngine: hasSpeech ? "web-speech" : isMac ? "macos-dictation" : "web-speech",
  };
}

/** Interroge le backend Tauri sur les moteurs vocaux locaux, ou retourne un repli navigateur cohérent. */
export async function getVoiceCapabilities(): Promise<VoiceCapabilities> {
  if (!inTauri) {
    return browserFallbackCapabilities();
  }
  try {
    return await invoke<VoiceCapabilities>("voice_capabilities");
  } catch {
    return browserFallbackCapabilities();
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Transcrit un enregistrement audio via la commande Tauri Whisper locale. */
export async function transcribeAudioWithWhisper(blob: Blob, lang: string): Promise<string> {
  if (!inTauri) {
    throw new Error("Whisper local nécessite l'application desktop Kana.");
  }
  const audioBase64 = await blobToBase64(blob);
  return invoke<string>("transcribe_audio_whisper", {
    audioBase64,
    mimeType: blob.type || "audio/webm",
    lang,
  });
}

/** Déclenche la dictée native macOS (best-effort) lorsque Kana tourne dans Tauri. */
export async function triggerMacosDictation(): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke<void>("trigger_macos_dictation");
  } catch {
    // Best-effort : la dictée système peut aussi être lancée manuellement via Fn Fn.
  }
}
