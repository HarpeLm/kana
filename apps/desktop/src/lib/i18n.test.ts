// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, tr, translateRustError } from "./i18n";

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("fr");
  });

  it("persiste la langue et garde fr par défaut", () => {
    expect(getLocale()).toBe("fr");
    expect(tr("Réglages", "Settings")).toBe("Réglages");
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(localStorage.getItem("kana-locale")).toBe("en");
    expect(tr("Réglages", "Settings")).toBe("Settings");
  });

  it("traduit les erreurs Rust en anglais uniquement lorsque la locale est en", () => {
    const err = "aucun dépôt git dans /tmp/foo";
    expect(translateRustError(err, "fr")).toBe(err);
    expect(translateRustError(err, "en")).toBe("not a git repository: /tmp/foo");

    expect(translateRustError("connexion requise : ouvre les Réglages pour te connecter", "en")).toBe(
      "authentication required: open Settings to sign in",
    );
    expect(translateRustError("la base est verrouillée", "en")).toBe("database is locked");
    expect(translateRustError("l'agent de ce fil n'est pas démarré", "en")).toBe(
      "the agent for this thread is not started",
    );
    expect(translateRustError("ce dossier n'est pas un dossier de travail de Kana", "en")).toBe(
      "this folder is not a Kana worktree",
    );
    expect(
      translateRustError(
        "la fusion a des conflits avec « main » : elle est annulée, rien n'a changé (git a échoué : conflict)",
        "en",
      ),
    ).toBe('merge conflicts with "main": merge aborted, nothing changed (git failed: conflict)');
  });
});
