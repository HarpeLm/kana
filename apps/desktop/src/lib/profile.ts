import { useSyncExternalStore } from "react";
import { persistSharedSetting } from "./store";

export const USER_PROFILE_KEY = "kana-user-profile";

export interface UserProfile {
  name: string;
  onboarded: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  onboarded: false,
};

const listeners = new Set<() => void>();

function readStoredProfile(): UserProfile {
  if (typeof localStorage === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PROFILE;
    return {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
      onboarded: Boolean(parsed.onboarded),
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

let currentProfile: UserProfile = readStoredProfile();

function updateProfile(next: UserProfile): UserProfile {
  currentProfile = next;
  persistSharedSetting(USER_PROFILE_KEY, JSON.stringify(next));
  listeners.forEach((notify) => notify());
  return currentProfile;
}

/** Charge le profil utilisateur local depuis le stockage persistant. */
export function loadUserProfile(): UserProfile {
  currentProfile = readStoredProfile();
  return currentProfile;
}

/** Enregistre le nom/pseudo local et marque l'onboarding comme terminé. */
export function saveUserProfile(name: string): UserProfile {
  const cleaned = name.trim();
  return updateProfile({ name: cleaned, onboarded: true });
}

/** Marque l'onboarding comme passé sans définir de nom. */
export function dismissOnboarding(): UserProfile {
  return updateProfile({ name: currentProfile.name, onboarded: true });
}

/** Déconnecte le profil local (efface le nom tout en évitant de relancer l'onboarding automatique). */
export function clearUserProfile(): UserProfile {
  return updateProfile({ name: "", onboarded: true });
}

/** Hook réactif sur le profil utilisateur local. */
export function useUserProfile(): UserProfile {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => currentProfile,
  );
}

/**
 * Calcule des initiales propres à partir d'un nom ou pseudo :
 * - `"Fabian Dargaud"` → `"FD"`
 * - `"HarpeLm"` → `"HL"`
 * - `"kana"` → `"KA"`
 */
export function userInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  const word = parts[0] ?? trimmed;
  const capitals = word.match(/\p{Lu}/gu);
  if (capitals && capitals.length >= 2) {
    return `${capitals[0]}${capitals[1]}`.toUpperCase();
  }

  return word.slice(0, 2).toUpperCase();
}
