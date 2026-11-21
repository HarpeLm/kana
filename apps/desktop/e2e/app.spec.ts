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
