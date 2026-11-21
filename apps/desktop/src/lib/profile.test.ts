import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_PROFILE_KEY, clearUserProfile, dismissOnboarding, loadUserProfile, saveUserProfile, userInitials } from "./profile";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

describe("user profile", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("retourne un profil vide non onboardé par défaut", () => {
    expect(loadUserProfile()).toEqual({ name: "", onboarded: false });
  });

  it("enregistre, recharge et efface le profil local", () => {
    const saved = saveUserProfile("  HarpeLm  ");
    expect(saved).toEqual({ name: "HarpeLm", onboarded: true });
    expect(JSON.parse(localStorage.getItem(USER_PROFILE_KEY) ?? "{}")).toEqual({
      name: "HarpeLm",
      onboarded: true,
    });
    expect(loadUserProfile()).toEqual({ name: "HarpeLm", onboarded: true });

    const cleared = clearUserProfile();
    expect(cleared).toEqual({ name: "", onboarded: true });
    expect(loadUserProfile()).toEqual({ name: "", onboarded: true });
  });

  it("marque l'onboarding comme ignoré sans écraser le nom", () => {
    const dismissed = dismissOnboarding();
    expect(dismissed).toEqual({ name: "", onboarded: true });
    expect(loadUserProfile()).toEqual({ name: "", onboarded: true });
  });

  it("calcule des initiales cohérentes pour noms complets et pseudos CamelCase", () => {
    expect(userInitials("HarpeLm")).toBe("HL");
    expect(userInitials("Fabian Dargaud")).toBe("FD");
    expect(userInitials("jean-luc")).toBe("JL");
    expect(userInitials("kana")).toBe("KA");
    expect(userInitials("A")).toBe("A");
    expect(userInitials("   ")).toBe("");
  });
});
