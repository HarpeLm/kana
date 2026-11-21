import { expect, test, type Page } from "@playwright/test";

/** Les erreurs de la console, pour vérifier qu'un écran s'ouvre sans rien casser. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  // Les aperçus d'artéfacts sont isolés (sans script) : leurs propres scripts bloqués ne comptent pas.
  const sandboxed = (text: string) => /sandboxed|about:srcdoc/.test(text);
  page.on("pageerror", (e) => !sandboxed(e.message) && errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !sandboxed(m.text()) && errors.push(m.text()));
  return errors;
}

/** Les actions rapides de la barre latérale (le nom « Artéfacts » existe aussi ailleurs dans la page). */
const nav = (page: Page) => page.getByRole("navigation").first();

test.beforeEach(async ({ page }) => {
  // Une conversation dans un projet, pour que la galerie ait un dossier où chercher (l'agent simulé y voit un artéfact « Plan »).
  await page.addInitScript(() => {
    if (!localStorage.getItem("kana-conversations")) {
      localStorage.setItem(
        "kana-conversations",
        JSON.stringify([{ id: "c1", title: "Essai", project: "kana", agentId: "opencode", pinned: false, projectPath: "/tmp/kana" }]),
      );
    }
  });
  await page.goto("/");
  await expect(nav(page).getByRole("button", { name: "Artéfacts" })).toBeVisible();
});

test("l'application s'ouvre sans erreur", async ({ page }) => {
  const errors = watchErrors(page);
  await page.reload();
  await expect(nav(page).getByRole("button", { name: "Rechercher" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: "Tâches planifiées" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("la galerie d'artéfacts montre une carte, bascule en liste et propose le menu au clic droit", async ({ page }) => {
  const errors = watchErrors(page);
  await nav(page).getByRole("button", { name: "Artéfacts" }).click();
  await expect(page.getByRole("heading", { name: "Artéfacts" })).toBeVisible();
  // La carte (et pas le bouton « Plan et tâches » de l'en-tête) : c'est la seule à porter « Plan » et une date.
  const card = page.getByRole("button").filter({ hasText: /^Plan.*kana/ });
  await expect(card).toBeVisible();

  await page.getByTitle("Liste", { exact: true }).click();
  await expect(card).toBeVisible();
  await page.getByTitle("Grille", { exact: true }).click();

  // Clic droit sur le texte de la carte (sous l'aperçu).
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + box.height - 14, { button: "right" });
  await expect(page.getByRole("button", { name: "Supprimer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copier le chemin" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("la recherche trouve un artéfact et l'ouvre", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Rechercher" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Artéfacts" }).click();
  await expect(dialog.getByRole("option", { name: /Plan/ })).toBeVisible();
  await dialog.getByPlaceholder("Rechercher").fill("zzzz");
  await expect(dialog.getByText("Rien à afficher pour l'instant.")).toBeVisible();
  await dialog.getByPlaceholder("Rechercher").fill("plan");
  await dialog.getByRole("option", { name: /Plan/ }).click();
  await expect(dialog).toHaveCount(0);
  // L'artéfact s'ouvre dans son volet, avec le titre de la page.
  await expect(page.frameLocator("iframe[title='Page']").getByText("Plan de la refonte")).toBeVisible();
});

test("Échap ferme la recherche", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Rechercher" }).click();
  await expect(page.getByRole("dialog", { name: "Rechercher" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Rechercher" })).toHaveCount(0);
});

test("les réglages et les tâches planifiées s'ouvrent", async ({ page }) => {
  const errors = watchErrors(page);
  await nav(page).getByRole("button", { name: "Tâches planifiées" }).click();
  await expect(page.getByText("Aucune tâche planifiée pour l'instant.")).toBeVisible();
  await nav(page).getByRole("button", { name: "Personnalisation" }).click();
  await expect(page.getByText("Réglages").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("une nouvelle conversation reçoit un titre propre dès le premier message", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();
  await box.fill("Salut, tu peux me dire ceque l'on a fait pour l'instant ?");
  await box.press("Enter");
  await expect(page.getByText("Dire ceque l'on a fait pour l'instant").first()).toBeVisible();
});

test("le chat : un message, la réponse de l'agent, puis /compact remplacé par une ligne", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();
  await box.fill("Bonjour Kana");
  await box.press("Enter");
  await expect(page.getByText("Bonjour Kana").first()).toBeVisible();
  // On attend la fin de la réponse (l'agent simulé l'écrit mot à mot) : pendant qu'il répond, un nouveau message n'est pas envoyé.
  await expect(page.getByText(/Tu as écrit « Bonjour Kana »\./)).toBeVisible();

  // La réponse à /compact n'est pas montrée : une seule ligne grise la remplace.
  await box.fill("/compact");
  await box.press("Enter");
  await expect(page.getByText("Session compactée", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tu as écrit « \/compact »/)).toHaveCount(0);
});

test("le chat : une conversation vide invite à écrire et la saisie est vidée après l'envoi", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();
  await box.fill("Salut");
  await box.press("Enter");
  await expect(box).toHaveValue("");
});

/** Ouvre l'artéfact « Plan » dans son volet, via la recherche. */
async function openPlan(page: Page) {
  await nav(page).getByRole("button", { name: "Rechercher" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher" });
  await dialog.getByRole("tab", { name: "Artéfacts" }).click();
  await dialog.getByRole("option", { name: /Plan/ }).click();
  const frame = page.frameLocator("iframe[title='Page']");
  await expect(frame.getByText("Plan de la refonte")).toBeVisible();
  return frame;
}

/** Affiche le code de la page, pour vérifier ce qui a été réellement écrit dans le fichier. */
async function showCode(page: Page) {
  // Le titre du volet (et pas le bouton « Plan et tâches » de l'en-tête).
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByText("Afficher le code").click();
  return page.locator(".cm-content");
}

test("l'éditeur d'artéfacts : un texte modifié sur place est enregistré tout seul dans le fichier", async ({ page }) => {
  const frame = await openPlan(page);
  await frame.getByText("Dessiner trois maquettes différentes").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" (version corrigée)");
  // Enregistrement automatique : un instant après la dernière frappe.
  await page.waitForTimeout(1500);
  const code = await showCode(page);
  await expect(code).toContainText("Dessiner trois maquettes différentes (version corrigée)");
  // Le reste de la page, script compris, est conservé tel quel.
  await expect(code).toContainText("Ajouté par un script");
});

test("l'éditeur d'artéfacts : supprimer une ligne puis annuler", async ({ page }) => {
  const frame = await openPlan(page);
  const line = frame.getByText("Choisir une maquette avec l'équipe");
  await line.hover();
  await frame.locator("#kana-trash").click();
  await expect(line).toHaveCount(0);
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(frame.getByText("Choisir une maquette avec l'équipe")).toBeVisible();
});

test("le compositeur : Shift+Entrée ajoute une ligne, /commandes et @mentions complètent le texte", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();

  await box.fill("/co");
  const slashMenu = page.getByRole("listbox", { name: "Commandes slash" });
  await expect(slashMenu).toBeVisible();
  await expect(slashMenu.getByRole("option", { name: /compact/ })).toBeVisible();
  await box.press("Tab");
  await expect(box).toHaveValue("/compact ");

  await box.type("@");
  const mentionMenu = page.getByRole("listbox", { name: "Mentions" });
  await expect(mentionMenu).toBeVisible();
  await mentionMenu.getByRole("button", { name: "Symboles" }).click();
  await mentionMenu.getByRole("option", { name: /AcpClient/ }).click();
  await expect(box).toHaveValue("/compact @AcpClient (crates/kana-acp/src/client.rs:54) ");

  await box.fill("Ligne 1");
  await box.press("Shift+Enter");
  await box.type("Ligne 2");
  await expect(box).toHaveValue("Ligne 1\nLigne 2");
  await box.press("Enter");
  await expect(box).toHaveValue("");
  await expect(page.getByText(/Ligne 1\s+Ligne 2/).first()).toBeVisible();
});

test("le compositeur : collage d'une image depuis le presse-papiers", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();
  await box.evaluate((node) => {
    const pngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
      137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68,
      174, 66, 96, 130,
    ]);
    const file = new File([pngBytes], "capture.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: dt });
    node.dispatchEvent(paste);
  });
  await expect(page.locator("img[alt^='collage-']")).toBeVisible();
});

test("le compositeur : file d'attente et envoi prioritaire pendant que l'agent répond", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Créer" }).click();
  const box = page.getByRole("textbox").last();
  const longPrompt = Array.from({ length: 18 }, (_, i) => `mot${i}`).join(" ");
  await box.fill(longPrompt);
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Arrêter" })).toBeVisible();

  await box.fill("Message annulé");
  await box.press("Enter");
  await expect(page.getByText("Message annulé")).toBeVisible();

  await box.fill("Message prioritaire");
  await box.press("Enter");
  await expect(page.getByText("Message prioritaire")).toBeVisible();

  await page.getByRole("button", { name: "Retirer de la file" }).first().click();
  await expect(page.getByText("Message annulé")).toHaveCount(0);

  await page.getByRole("button", { name: "Envoyer maintenant" }).first().click();
  await expect(page.getByText(/Tu as écrit « Message prioritaire »\./)).toBeVisible();
  await expect(page.getByText("Message annulé")).toHaveCount(0);
});
