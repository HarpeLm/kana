/** Vrai quand l'interface tourne dans la fenêtre Tauri, faux dans un navigateur simple. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
