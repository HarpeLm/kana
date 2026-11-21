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

test("le menu Plus ouvre le volet Artéfacts et bascule Maintenir l'ordinateur actif", async ({ page }) => {
  const errors = watchErrors(page);
  const banner = page.getByRole("banner");
  await banner.getByRole("button", { name: "Plus" }).click();
  await expect(banner.getByRole("button", { name: /Conversation annexe/ })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Tâches en arrière-plan" })).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "Simulateur iOS" })).toHaveCount(0);

  const keepAwakeButton = banner.getByRole("button", { name: /Maintenir l'ordinateur actif/ });
  await expect(keepAwakeButton).toHaveAttribute("aria-pressed", "false");
  await keepAwakeButton.click();
  await expect(keepAwakeButton).toHaveAttribute("aria-pressed", "true");

  await banner.getByRole("button", { name: "Artéfacts" }).click();
  await expect(page.getByRole("region", { name: "Artéfacts" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("raccourcis globaux et palette Cmd+K : ouvrir la palette, basculer un volet et cycler le mode", async ({ page }) => {
  const errors = watchErrors(page);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  const main = page.locator("main");

  // Cmd+K depuis le compositeur ouvre la palette et exécute une action rapide.
  const composer = page.getByRole("textbox").last();
  await composer.focus();
  await page.keyboard.press(`${mod}+k`);
  const dialog = page.getByRole("dialog", { name: "Rechercher" });
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder("Rechercher").fill("diff");
  await dialog.getByRole("option", { name: /Afficher \/ masquer le diff/ }).click();
  await expect(dialog).toHaveCount(0);
  const diffPane = page.getByRole("region", { name: "Diff" });
  await expect(diffPane).toHaveCSS("opacity", "1");

  // Cmd+Shift+D referme le volet Diff.
  await page.keyboard.press(`${mod}+Shift+d`);
  await expect(diffPane).toHaveCSS("opacity", "0");

  // Cmd+Shift+M cycle le mode d'autorisation : Demander -> Plan -> Approuver à ma place.
  await expect(main.getByRole("button", { name: /Demander l'approbation/ })).toBeVisible();
  await page.keyboard.press(`${mod}+Shift+m`);
  await expect(main.getByRole("button", { name: /^Plan/ })).toBeVisible();
  await page.keyboard.press(`${mod}+Shift+m`);
  await expect(main.getByRole("button", { name: /Approuver à ma place/ })).toBeVisible();

  // Alt+ArrowDown / Alt+ArrowUp navigue entre les fils visibles.
  await expect(page.locator("header").getByText("Nouvelle conversation")).toBeVisible();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator("header").getByText("Essai")).toBeVisible();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator("header").getByText("Nouvelle conversation")).toBeVisible();

  expect(errors).toEqual([]);
});

test("mode Plan : bouton direct « Approuver le plan et passer en exécution »", async ({ page }) => {
  const errors = watchErrors(page);
  const main = page.locator("main");
  await nav(page).getByRole("button", { name: "Créer" }).click();

  // Passe en mode Plan via le menu du compositeur.
  await main.getByRole("button", { name: /Demander l'approbation/ }).click();
  await main.getByRole("button", { name: /^Plan\b/ }).click();
  await expect(main.getByRole("button", { name: /^Plan/ })).toBeVisible();

  const box = page.getByRole("textbox").last();
  await box.fill("Prépare un plan d'action");
  await box.press("Enter");
  await expect(page.getByText(/Tu as écrit « Prépare un plan d'action »\./)).toBeVisible();

  const planBanner = page.getByRole("region", { name: "Validation du plan" });
  await expect(planBanner).toBeVisible();
  const modeSelect = planBanner.getByRole("combobox", { name: "Mode d'approbation pour l'exécution" });
  await expect(modeSelect).toHaveValue("auto");

  await planBanner.getByRole("button", { name: "Approuver le plan et passer en exécution" }).click();
  await expect(planBanner).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Approuver à ma place/ })).toBeVisible();
  await expect(
    page.getByText(/Tu as écrit « Le plan est approuvé : passe en exécution et applique les modifications\. »\./),
  ).toBeVisible();

  expect(errors).toEqual([]);
});

test("widget de question structurée à choix multiples : sélection, validation et ignorer", async ({ page }) => {
  const errors = watchErrors(page);

  await page.evaluate(() => {
    localStorage.setItem(
      "kana-messages-c1",
      JSON.stringify([
        { id: "m-u1", role: "user", text: "Quel stockage choisir ?", thought: "", tools: [] },
        {
          id: "m-a1",
          role: "agent",
          text: '```question\n{"question":"Quels moteurs activer ?","options":["SQLite","PostgreSQL","DuckDB"],"multiSelect":true}\n```',
          thought: "",
          tools: [],
        },
      ]),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Essai" }).click();

  const card = page.getByRole("region", { name: "Question de l'agent" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Quels moteurs activer ?")).toBeVisible();

  await card.getByRole("button", { name: "SQLite" }).click();
  await card.getByRole("button", { name: "DuckDB" }).click();
  await card.getByRole("button", { name: "Valider la réponse" }).click();

  await expect(card).toHaveCount(0);
  await expect(page.getByText(/Tu as écrit « SQLite, DuckDB »\./)).toBeVisible();

  // Teste aussi une question détectée par heuristique ? + liste et le bouton Ignorer.
  await page.evaluate(() => {
    localStorage.setItem(
      "kana-messages-c1",
      JSON.stringify([
        { id: "m-u2", role: "user", text: "Suite ?", thought: "", tools: [] },
        {
          id: "m-a2",
          role: "agent",
          text: "Souhaites-tu déployer maintenant ?\n- Oui, maintenant\n- Plus tard",
          thought: "",
          tools: [],
        },
      ]),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Essai" }).click();

  await expect(card).toBeVisible();
  await expect(card.getByText("Souhaites-tu déployer maintenant ?")).toBeVisible();
  await card.getByRole("button", { name: "Ignorer" }).click();
  await expect(card).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("réglages : options de Notifications système et son", async ({ page }) => {
  const errors = watchErrors(page);
  const mod = process.platform === "darwin" ? "Meta" : "Control";

  await page.keyboard.press(`${mod}+,`);
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

  const enabledCheckbox = page.getByLabel("Notifications système");
  const soundCheckbox = page.getByLabel("Son de notification");

  await expect(enabledCheckbox).toBeChecked();
  await expect(soundCheckbox).toBeChecked();
  await expect(soundCheckbox).toBeEnabled();

  await enabledCheckbox.uncheck();
  await expect(enabledCheckbox).not.toBeChecked();
  await expect(soundCheckbox).toBeDisabled();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kana-notifications") ?? "null"));
  expect(stored).toEqual({ enabled: false, sound: true });

  expect(errors).toEqual([]);
});

test("tâches planifiées : création, exécution immédiate, historique, budget et launchd .plist", async ({ page }) => {
  const errors = watchErrors(page);
  await nav(page).getByRole("button", { name: "Tâches planifiées" }).click();

  await page.getByLabel("Titre de la tâche").fill("Veille sécurité");
  await page.getByLabel("Prompt de la tâche").fill("Analyse les dépendances et signale les CVE.");
  await page.getByLabel("Fréquence").selectOption("15m");
  await page.getByLabel("Budget max").selectOption("25000");
  await page.getByRole("button", { name: "Créer la tâche" }).click();

  await expect(page.getByText("Veille sécurité").first()).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Exécuter maintenant" }).click();
  await expect(page.getByText("Succès").first()).toBeVisible();
  await expect(page.getByText(/25[\s\u202f]000 jetons/).last()).toBeVisible();
  await expect(page.getByText(/Exécution terminée pour « Veille sécurité »/)).toBeVisible();

  await page.getByRole("button", { name: "launchd .plist" }).click();
  await expect(page.getByText(/<integer>900<\/integer>/)).toBeVisible();

  const storedTasks = await page.evaluate(() => JSON.parse(localStorage.getItem("kana-scheduled-tasks") ?? "[]"));
  const storedRuns = await page.evaluate(() => JSON.parse(localStorage.getItem("kana-scheduled-runs") ?? "[]"));
  expect(storedTasks).toHaveLength(1);
  expect(storedTasks[0].lastStatus).toBe("ok");
  expect(storedRuns).toHaveLength(1);

  // La recherche dans l'onglet « Tâches planifiées » retrouve la tâche créée.
  await nav(page).getByRole("button", { name: "Rechercher" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher" });
  await dialog.getByRole("tab", { name: "Tâches planifiées" }).click();
  await expect(dialog.getByRole("option", { name: /Veille sécurité/ })).toBeVisible();
  await page.keyboard.press("Escape");

  expect(errors).toEqual([]);
});

test("conversation annexe (⌘;) : poser une question rapide sans polluer le fil principal", async ({ page }) => {
  const errors = watchErrors(page);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  const main = page.locator("main");

  const composer = page.getByRole("textbox").last();
  await composer.fill("Fil principal intact");
  await composer.press("Enter");
  await expect(main.getByText(/Tu as écrit « Fil principal intact »\./)).toBeVisible();

  await page.keyboard.press(`${mod}+;`);
  const sideChat = page.getByRole("region", { name: "Conversation annexe" });
  await expect(sideChat).toBeVisible();

  const sideInput = sideChat.getByLabel("Question annexe");
  await sideInput.fill("Question rapide annexe");
  await sideInput.press("Enter");

  await expect(sideChat.getByText(/Tu as écrit « Question rapide annexe »\./)).toBeVisible();
  await expect(main.getByText("Question rapide annexe")).toHaveCount(0);

  await sideChat.getByRole("button", { name: "Effacer" }).click();
  await expect(sideChat.getByText("Question rapide annexe")).toHaveCount(0);
  await sideChat.getByRole("button", { name: "Fermer" }).click();
  await expect(sideChat).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("sessionPanel : mémoire projet, environnement distant/sandbox et sous-agent parallèle", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();
  await page.getByRole("button", { name: "Plan et tâches" }).click();
  const panel = page.locator("aside").last();

  // Mémoire du projet
  await panel.getByLabel("Nouvelle note projet").fill("Toujours lancer cargo test");
  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.getByText("Toujours lancer cargo test")).toBeVisible();

  const memory = await page.evaluate(() => JSON.parse(localStorage.getItem("kana-project-memory") ?? "{}"));
  expect(memory["/tmp/kana"]).toEqual(["Toujours lancer cargo test"]);

  // Environnement : sandbox OS puis SSH distant
  const sandboxCheckbox = panel.getByLabel("Sandbox OS isolé");
  await sandboxCheckbox.check();
  await expect(sandboxCheckbox).toBeChecked();

  await panel.getByLabel("Environnement d'exécution").selectOption("ssh");
  const sshInput = panel.getByLabel("Cible SSH");
  await sshInput.fill("dev@box:/srv/kana");
  await expect(sshInput).toHaveValue("dev@box:/srv/kana");

  await panel.getByLabel("Environnement d'exécution").selectOption("local");

  // Sous-agent parallèle en lecture seule
  await panel.getByRole("button", { name: "Recherche (lecture seule)" }).click();
  await expect(panel.getByText("Terminé").first()).toBeVisible();

  const subRow = panel.getByRole("button", { name: /Recherche.*Explore en lecture seule/ });
  await expect(subRow).toBeVisible();
  await subRow.click();

  await expect(page.locator("header").getByText(/Recherche · /)).toBeVisible();
  expect(errors).toEqual([]);
});

test("extensibilité : Connecteurs MCP, Règles, Skills, Hooks et Packs via PlusMenu", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();

  // Ouvrir Connecteurs depuis le menu « + »
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByRole("button", { name: "Connecteurs" }).click();
  const modal = page.getByRole("dialog", { name: "Extensibilité et connecteurs" });
  await expect(modal).toBeVisible();

  // 1. Connecteur MCP HTTP avec jeton OAuth Bearer
  await modal.getByLabel("Nom du serveur MCP").fill("linear-mcp");
  await modal.getByLabel("Transport MCP").selectOption("sse");
  await modal.getByLabel("URL MCP").fill("https://mcp.linear.app/sse");
  await modal.getByLabel("Jeton OAuth MCP").fill("oauth-secret");
  await modal.getByRole("button", { name: "Ajouter le serveur MCP" }).click();
  await expect(modal.getByText("linear-mcp", { exact: true })).toBeVisible();
  await expect(modal.getByText("OAuth Bearer")).toBeVisible();

  // 2. Règles projet + synchronisation
  await modal.getByRole("tab", { name: "Règles" }).click();
  await modal.getByLabel("Contenu de la règle").fill("Toujours vérifier cargo test.");
  await modal.getByRole("button", { name: "Synchroniser les règles" }).click();
  await expect(modal.getByText(/Règles synchronisées vers/)).toBeVisible();

  // 3. Skills : import SKILL.md
  await modal.getByRole("tab", { name: "Skills" }).click();
  await modal
    .getByLabel("Contenu SKILL.md à importer")
    .fill("---\nname: Audit E2E\nslash: audit-e2e\ndescription: Audit rapide\n---\nVérifie le module : $ARGUMENTS");
  await modal.getByRole("button", { name: "Importer SKILL.md" }).click();
  await expect(modal.getByText("/audit-e2e", { exact: true })).toBeVisible();

  // 4. Hooks : règle Stop
  await modal.getByRole("tab", { name: "Hooks" }).click();
  await modal.getByLabel("Événement du hook").selectOption("Stop");
  await modal.getByLabel("Motif du hook").fill("*");
  await modal.getByLabel("Commande du hook").fill("echo hook-done");
  await modal.getByRole("button", { name: "Ajouter le hook" }).click();
  await expect(modal.getByText("echo hook-done")).toBeVisible();

  // Fermer le modal puis vérifier l'autocomplétion /audit-e2e et son expansion + exécution du hook Stop
  await modal.getByRole("button", { name: "Fermer" }).click();
  await expect(modal).toHaveCount(0);

  const composer = page.getByRole("textbox").last();
  await composer.fill("/audit");
  const slashMenu = page.getByRole("listbox", { name: "Commandes slash" });
  await expect(slashMenu.getByRole("option", { name: /audit-e2e/ })).toBeVisible();
  await composer.press("Tab");
  await expect(composer).toHaveValue("/audit-e2e ");
  await composer.type("paiement");
  await composer.press("Enter");
  await expect(page.getByText(/Vérifie le module : paiement/)).toBeVisible();

  // Ouvrir Plug-ins depuis « + », vérifier le journal du hook et installer un pack en 1 clic
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByRole("button", { name: "Plug-ins" }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Installer en 1 clic" }).first().click();
  await expect(modal.getByText(/Pack « Qualité & Garde-fous Rust\/TS » installé/)).toBeVisible();
  await modal.getByRole("button", { name: "Exporter en JSON" }).click();
  await expect(modal.getByLabel("JSON du pack à importer")).toHaveValue(/kana-plugin-pack/);

  await modal.getByRole("tab", { name: "Hooks" }).click();
  await expect(modal.getByText("$ echo hook-done")).toBeVisible();
  await modal.getByRole("button", { name: "Fermer" }).click();

  expect(errors).toEqual([]);
});

test("diff interactif : vue côte-à-côte, commentaire inline, accepter et rejeter bloc/fichier", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();

  await page.getByRole("button", { name: "Git Diff" }).click();
  const diffPane = page.getByRole("region", { name: "Diff" });
  await expect(diffPane).toHaveCSS("opacity", "1");
  await expect(diffPane.getByText("main.rs")).toBeVisible();
  await expect(diffPane.getByText("notes.md")).toBeVisible();

  // Bascule côte-à-côte / unifié
  await diffPane.getByRole("button", { name: "Côte-à-côte" }).click();
  await expect(diffPane.getByRole("button", { name: "Unifié" })).toBeVisible();
  await diffPane.getByRole("button", { name: "Unifié" }).click();

  // Accepter un fichier
  await diffPane.getByRole("button", { name: "Accepter src/main.rs" }).click();
  await expect(diffPane.getByText("Accepté", { exact: true })).toBeVisible();

  // Commentaire inline sur un bloc envoyé à l'agent
  await diffPane.getByRole("button", { name: "Commenter ce bloc" }).first().click();
  await diffPane.getByLabel("Commentaire sur le diff").fill("Garde aussi l'ancien log.");
  await diffPane.getByRole("button", { name: "Envoyer à l'agent" }).click();
  await expect(page.getByText(/Commentaire de review sur `src\/main\.rs`/).first()).toBeVisible();
  await expect(page.getByText(/Garde aussi l'ancien log\./).last()).toBeVisible();

  // Rejeter un bloc puis rejeter le second fichier
  await diffPane.getByRole("button", { name: "Rejeter ce bloc" }).first().click();
  await expect(diffPane.getByText("main.rs")).toHaveCount(0);
  await diffPane.getByRole("button", { name: "Rejeter notes.md" }).click();
  await expect(diffPane.getByText("Aucun changement.")).toBeVisible();

  expect(errors).toEqual([]);
});

test("/rewind et SessionPanel : restauration d'un tour, menu forge et import review & logs CI", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();
  const main = page.locator("main");
  const composer = page.getByRole("textbox").last();

  await composer.fill("Premier tour");
  await composer.press("Enter");
  await expect(main.getByText(/Tu as écrit « Premier tour »\./)).toBeVisible();

  await composer.fill("Deuxième tour");
  await composer.press("Enter");
  await expect(main.getByText(/Tu as écrit « Deuxième tour »\./)).toBeVisible();

  // Bouton Restaurer ce tour (/rewind) sur le deuxième message utilisateur
  await main.getByText("Deuxième tour", { exact: true }).hover();
  await main.getByRole("button", { name: "Restaurer ce tour (/rewind)" }).last().click();
  await expect(main.getByText("Deuxième tour")).toHaveCount(0);
  await expect(main.getByText("Premier tour").first()).toBeVisible();

  // Commande slash /rewind ramène aussi avant le dernier tour
  await composer.fill("/rewind");
  await composer.press("Enter");
  await expect(main.getByText("Premier tour")).toHaveCount(0);

  // Relance un message pour afficher les sections actives de SessionPanel
  await composer.fill("Tour final");
  await composer.press("Enter");
  await expect(main.getByText(/Tu as écrit « Tour final »\./)).toBeVisible();

  // SessionPanel : menu forge multi-plateformes et import review & logs CI d'une PR
  await page.getByRole("button", { name: "Plan et tâches" }).click();
  const panel = page.locator("aside").last();
  await expect(panel.getByText("Pull / Merge requests")).toBeVisible();

  await panel.getByRole("button", { name: /kana/ }).first().click();
  await expect(panel.getByRole("button", { name: "Ouvrir sur GitHub / GitLab / Forge" })).toBeVisible();
  await panel.getByText("Pull / Merge requests").click();

  await panel.getByRole("button", { name: "Importer review & logs CI" }).first().click();
  await expect(main.getByText(/Feedback importé depuis la PR #215/).first()).toBeVisible();
  await expect(main.getByText(/cargo test \(ubuntu-latest\)/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("recherche plein texte des messages et coûts estimés en $ dans SessionPanel", async ({ page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "kana-conversations",
      JSON.stringify([
        { id: "c1", title: "Essai", project: "kana", agentId: "opencode", pinned: false, projectPath: "/tmp/kana" },
        { id: "c2", title: "Audit Sécurité", project: "kana", agentId: "claude", pinned: false, projectPath: "/tmp/kana" },
      ]),
    );
    localStorage.setItem(
      "kana-messages-c2",
      JSON.stringify([
        { id: "m-fts-1", role: "agent", text: "Signature webhook validée sur motcleFTS99.", think: "", tools: [] },
      ]),
    );
    const sampleUsage = {
      turns: 2,
      inputTokens: 12000,
      outputTokens: 3000,
      totalTokens: 15000,
      cacheReadTokens: 4000,
      cacheWriteTokens: 1000,
      costUsd: 0.0042,
    };
    localStorage.setItem(
      "kana-usage",
      JSON.stringify({
        days: { [today]: { opencode: sampleUsage } },
        sessions: { c1: sampleUsage },
        projects: { "/tmp/kana": sampleUsage },
        problems: {},
      }),
    );
  });
  await page.reload();
  await expect(page.getByText("Audit Sécurité").first()).toBeVisible();
  await page.getByRole("button", { name: "Essai" }).click();

  await page.getByRole("button", { name: "Plan et tâches" }).click();
  const panel = page.locator("aside").last();
  await expect(panel.getByText("Coût session")).toBeVisible();
  await expect(panel.getByText("Cache (lecture / écriture)")).toBeVisible();
  await expect(panel.getByText("Coût projet")).toBeVisible();
  await expect(panel.getByText("$0.0042").first()).toBeVisible();
  await expect(panel.getByText("Coût du jour")).toBeVisible();

  await nav(page).getByRole("button", { name: "Rechercher" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher" });
  await dialog.getByRole("textbox").fill("motcleFTS99");
  await expect(dialog.getByText("Messages")).toBeVisible();
  await expect(dialog.getByText(/motcleFTS99/).first()).toBeVisible();
  await dialog.getByRole("option", { name: /Audit Sécurité/ }).first().click();

  await expect(page.locator("main").getByText(/Signature webhook validée sur motcleFTS99\./)).toBeVisible();
  expect(errors).toEqual([]);
});

test("règles de permissions, journal d'audit et changement de langue FR/EN", async ({ page }) => {
  const errors = watchErrors(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "kana-permission-audit",
      JSON.stringify([
        {
          id: "aud1",
          at: Date.now(),
          title: "Accès .env bloqué ([SECRET MASQUÉ])",
          scope: "path",
          decision: "ask",
          source: "default-rule",
          mode: "ask",
        },
      ]),
    );
  });
  await page.reload();
  await nav(page).getByRole("button", { name: "Personnalisation" }).click();
  await expect(page.getByRole("heading", { name: "Sécurité, règles de permissions & journal d'audit" })).toBeVisible();

  // Vérifie le journal d'audit et le vidage
  await expect(page.getByText(/Accès \.env bloqué/)).toBeVisible();
  await page.getByRole("button", { name: "Vider le journal" }).click();
  await expect(page.getByText("Aucune décision enregistrée pour l'instant.")).toBeVisible();

  // Ajout, activation et suppression d'une règle granulaire
  await page.getByLabel("Décision de la règle").selectOption("deny");
  await page.getByLabel("Motif de la règle").fill("rm -rf");
  await page.getByRole("button", { name: "Ajouter la règle" }).click();
  await expect(page.getByText("rm -rf", { exact: true })).toBeVisible();

  const toggle = page.getByLabel("Activer rm -rf");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();

  await page.getByRole("button", { name: "Supprimer la règle rm -rf" }).click();
  await expect(page.getByText("Aucune règle personnalisée enregistrée.")).toBeVisible();

  // Bascule EN puis retour FR
  await page.getByLabel("Langue de l'interface").selectOption("en");
  await expect(page.getByRole("heading", { name: "Accounts & connections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security, permission rules & audit log" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: "Customize" })).toBeVisible();

  await page.getByLabel("Interface language").selectOption("fr");
  await expect(page.getByRole("heading", { name: "Comptes et connexions" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: "Personnalisation" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("inspecteur ACP/MCP en direct et export Markdown / JSON", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();
  const composer = page.getByRole("textbox").last();
  await composer.fill("Inspecte la trame");
  await composer.press("Enter");
  await expect(page.locator("main").getByText(/Tu as écrit « Inspecte la trame »\./)).toBeVisible();

  const banner = page.getByRole("banner");
  await banner.getByRole("button", { name: "Plus" }).click();
  await banner.getByRole("button", { name: /Inspecteur ACP\/MCP & Export/ }).click();

  const dialog = page.getByRole("dialog", { name: "Inspecteur ACP/MCP & Export" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("session/prompt").first()).toBeVisible();
  await expect(dialog.getByText("acp/done").first()).toBeVisible();

  await dialog.getByRole("button", { name: "Sortant (out)" }).click();
  await expect(dialog.getByText("session/prompt").first()).toBeVisible();
  await expect(dialog.getByText("acp/done")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Toutes" }).click();

  await dialog.getByRole("button", { name: "Exporter Markdown (.md)" }).click();
  await expect(dialog.getByText(/Export Markdown prêt/)).toBeVisible();
  const mdExport = await page.evaluate(() => (window as unknown as { __kanaLastExport?: { filename: string; content: string } }).__kanaLastExport);
  expect(mdExport?.filename).toMatch(/\.md$/);
  expect(mdExport?.content).toContain("Inspecte la trame");

  await dialog.getByRole("button", { name: "Exporter JSON (.json)" }).click();
  await expect(dialog.getByText(/Export JSON prêt/)).toBeVisible();
  const jsonExport = await page.evaluate(() => (window as unknown as { __kanaLastExport?: { filename: string; content: string } }).__kanaLastExport);
  expect(jsonExport?.filename).toMatch(/\.json$/);
  expect(JSON.parse(jsonExport?.content ?? "{}").messages?.length).toBeGreaterThanOrEqual(2);

  await dialog.getByRole("button", { name: "Vider" }).click();
  await expect(dialog.getByText("Aucune trame enregistrée pour l'instant.")).toBeVisible();

  await dialog.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("volet Globe : bascule de viewport responsive, tiroir DevTools (Console & Réseau) envoyé à l'agent et trace HTML", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();

  // Ouvrir le volet Navigateur (Globe)
  await page.getByRole("banner").getByRole("button", { name: "Aperçu Web" }).click();
  const globePane = page.getByRole("region", { name: "Navigateur" });
  await expect(globePane).toHaveCSS("opacity", "1");

  // 1. Bascule de viewport responsive : Bureau -> Tablette 768px -> Mobile 390px
  await expect(globePane.getByTestId("globe-viewport-label")).toContainText("Bureau · Responsive");
  await globePane.getByRole("button", { name: "Viewport Tablette 768px" }).click();
  await expect(globePane.getByTestId("globe-viewport-label")).toContainText("Tablette · 768 × 1024 px");
  await globePane.getByRole("button", { name: "Viewport Mobile 390px" }).click();
  await expect(globePane.getByTestId("globe-viewport-label")).toContainText("Mobile · 390 × 844 px");

  // 2. Tiroir DevTools (Console & Réseau) + envoi du rapport à l'agent
  await globePane.getByRole("button", { name: "DevTools (Console & Réseau)" }).click();
  const devTools = globePane.getByRole("region", { name: "Tiroir DevTools Console & Réseau" });
  await expect(devTools).toBeVisible();
  await expect(devTools.getByText(/Cannot read properties of undefined/)).toBeVisible();
  await expect(devTools.getByText(/502/)).toBeVisible();

  await devTools.getByRole("button", { name: "Envoyer à l'agent" }).click();
  await expect(page.locator("main").getByText(/Diagnostic DevTools Globe/).first()).toBeVisible();
  await expect(page.locator("main").getByText(/Cannot read properties of undefined/).first()).toBeVisible();

  // 3. Enregistrement et export de la trace de session Globe
  await globePane.getByRole("button", { name: "Trace de session Globe" }).click();
  const traceSection = globePane.getByRole("region", { name: "Trace de vérification Globe" });
  await expect(traceSection).toBeVisible();
  await traceSection.getByRole("button", { name: "Démarrer la trace" }).click();
  await expect(traceSection.getByRole("button", { name: "Arrêter la trace" })).toBeVisible();

  await globePane.getByRole("button", { name: "Viewport Bureau" }).click();
  await expect(traceSection.getByText(/browser_set_viewport → desktop/)).toBeVisible();

  await traceSection.getByRole("button", { name: "Exporter preuve HTML" }).click();
  await expect(traceSection.getByText(/Preuve HTML générée/)).toBeVisible();
  const traceExport = await page.evaluate(
    () => (window as unknown as { __kanaLastGlobeTrace?: { filename: string; content: string } }).__kanaLastGlobeTrace,
  );
  expect(traceExport?.filename).toBe("globe-verification-trace.html");
  expect(traceExport?.content).toContain("Preuve de vérification Globe — Kana");
  expect(traceExport?.content).toContain("browser_set_viewport");

  expect(errors).toEqual([]);
});

test("/advisor & Cross-Review, Diagnostics LSP dans FilesDock et Cache local des adaptateurs ACP dans SettingsView", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();

  // 1. Commande /advisor dans le compositeur -> ouverture du conseiller interactif (Quoi / Pour quoi / Pourquoi) et pipeline Cross-Review
  const composer = page.getByRole("textbox").last();
  await composer.fill("/adv");
  const slashMenu = page.getByRole("listbox", { name: "Commandes slash" });
  await expect(slashMenu).toBeVisible();
  await expect(slashMenu.getByRole("option", { name: /advisor/ })).toBeVisible();
  await composer.press("Tab");
  await expect(composer).toHaveValue("/advisor ");
  await composer.type("Durcir le module d'authentification");
  await composer.press("Enter");

  const advisorDialog = page.getByRole("dialog", { name: "Conseiller /advisor & Cross-Review" });
  await expect(advisorDialog).toBeVisible();
  await expect(advisorDialog.getByText(/Qu'est-ce que l'on met en place/)).toBeVisible();
  await expect(advisorDialog.getByText(/Pour quoi \/ quel objectif/)).toBeVisible();
  await expect(advisorDialog.getByText(/Pourquoi cette configuration/)).toBeVisible();

  await advisorDialog.getByRole("button", { name: /Audit Sécurité & Permissions/ }).click();
  await expect(advisorDialog.getByText(/Le mode `plan` \(lecture seule\) couplé au Sandbox OS/)).toBeVisible();

  await advisorDialog.getByRole("button", { name: "Lancer le pipeline Cross-Review (3 agents)" }).click();
  await expect(advisorDialog).toHaveCount(0);

  // Le panneau SessionPanel s'ouvre et affiche le suivi du pipeline Cross-Review + sous-agents multi-fournisseurs
  const panel = page.locator("aside").last();
  await expect(panel.getByText("Cross-Review & /advisor")).toBeVisible();
  await expect(panel.getByText("Étape 1 · Implémentation")).toBeVisible();
  await expect(panel.getByText("Étape 2 · Cross-Review du Diff")).toBeVisible();
  await expect(panel.getByText("Étape 3 · Vérification & Globe")).toBeVisible();
  await expect(page.locator("main").getByText(/Pipeline Cross-Review Multi-Fournisseurs/).first()).toBeVisible();

  // 2. Diagnostics LSP & Compilateur dans FilesDock + envoi des erreurs à l'agent
  await page.getByRole("banner").getByRole("button", { name: "Fichiers" }).click();
  const filesPane = page.getByRole("region", { name: "Fichiers" });
  await expect(filesPane).toHaveCSS("opacity", "1");

  await filesPane.getByRole("button", { name: /Diagnostics/ }).click();
  const diagRegion = filesPane.getByRole("region", { name: "Diagnostics LSP & Compilateur" });
  await expect(diagRegion).toBeVisible();
  await expect(diagRegion.getByText(/crates\/kana-acp\/src\/client\.rs:54:12/)).toBeVisible();
  await expect(diagRegion.getByText("E0308")).toBeVisible();

  // Cliquer sur un diagnostic ouvre le fichier correspondant dans l'éditeur
  await diagRegion.getByRole("button", { name: /crates\/kana-acp\/src\/client\.rs:54:12/ }).click();
  await expect(filesPane.getByText("crates/kana-acp/src/client.rs").first()).toBeVisible();

  // Envoyer les erreurs compilateur/LSP à l'agent
  await diagRegion.getByRole("button", { name: "Envoyer les erreurs à l'agent" }).click();
  await expect(page.locator("main").getByText(/Diagnostics LSP \/ Compilateur détectés dans le dépôt/).first()).toBeVisible();

  // 3. Section Mises à jour Tauri & Cache local des adaptateurs ACP dans SettingsView
  await nav(page).getByRole("button", { name: "Personnalisation" }).click();
  await expect(page.getByRole("heading", { name: "Mises à jour Tauri & Cache local des adaptateurs ACP" })).toBeVisible();

  await page.getByRole("button", { name: "Vérifier les mises à jour" }).click();
  await expect(page.getByText("À jour", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mettre en cache" }).first().click();
  await expect(page.getByText("En cache local").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("benchmark de performance UI : cold start < 2500 ms, fluidité sous rafale de chunks et basculement 10+ sessions sans blocage", async ({
  page,
}) => {
  const errors = watchErrors(page);

  // 1. Cold start avec 12 sessions pré-hydratées
  await page.evaluate(() => {
    const convs = Array.from({ length: 12 }, (_, i) => ({
      id: `perf-c${i + 1}`,
      title: `Session Perf #${i + 1}`,
      project: "kana",
      agentId: i % 2 === 0 ? "opencode" : "claude",
      pinned: i === 0,
      projectPath: "/tmp/kana",
    }));
    localStorage.setItem("kana-conversations", JSON.stringify(convs));
    for (let i = 0; i < 12; i++) {
      const msgs = Array.from({ length: 20 }, (_, m) => ({
        id: `pm-${i}-${m}`,
        role: m % 2 === 0 ? "user" : "agent",
        text: `Historique session #${i + 1} tour ${m + 1} — indexation FTS5 et mémoire stable.`,
        thought: "",
        tools: [],
      }));
      localStorage.setItem(`kana-messages-perf-c${i + 1}`, JSON.stringify(msgs));
    }
  });

  const t0 = Date.now();
  await page.reload();
  await expect(nav(page).getByRole("button", { name: "Rechercher" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Session Perf #1", exact: true })).toBeVisible();
  const coldStartMs = Date.now() - t0;
  expect(coldStartMs).toBeLessThan(2500);

  // 2. Basculement rapide entre plusieurs sessions avec historique + vérification de l'empreinte
  const switchT0 = Date.now();
  for (const target of ["Session Perf #2", "Session Perf #5", "Session Perf #9", "Session Perf #1"]) {
    await page.getByRole("button", { name: target, exact: true }).click();
    await expect(page.locator("header").getByText(target)).toBeVisible();
  }
  const multiSwitchMs = Date.now() - switchT0;
  expect(multiSwitchMs).toBeLessThan(2000);

  // 3. Rafale de streaming dans le chat et réactivité UI immédiate pendant et après le flux
  const composer = page.getByRole("textbox").last();
  const burstPrompt = Array.from({ length: 24 }, (_, i) => `chunk${i}`).join(" ");
  const streamT0 = Date.now();
  await composer.fill(burstPrompt);
  await composer.press("Enter");
  await expect(page.locator("main").getByText(/Tu as écrit « chunk0 chunk1/)).toBeVisible();
  const streamElapsedMs = Date.now() - streamT0;
  expect(streamElapsedMs).toBeLessThan(4000);

  expect(errors).toEqual([]);
});

test("handoff worktree bidirectionnel : basculer vers un worktree isolé puis rapatrier en local", async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole("button", { name: "Essai" }).click();

  // Démarre la conversation pour charger le résumé git de SessionPanel et exercer le relais de contexte.
  const composer = page.getByRole("textbox").last();
  await composer.fill("Prépare le handoff");
  await composer.press("Enter");
  await expect(page.locator("main").getByText(/Tu as écrit « Prépare le handoff »\./)).toBeVisible();

  await page.getByRole("button", { name: "Plan et tâches" }).click();
  const panel = page.locator("aside").last();

  const toWorktreeBtn = panel.getByRole("button", { name: "Basculer vers un worktree isolé (Handoff)" });
  const toLocalBtn = panel.getByRole("button", { name: "Rapatrier en local (Handoff)" });

  // 1. Local -> Worktree isolé
  await expect(toWorktreeBtn).toBeVisible();
  await toWorktreeBtn.click();
  await expect(panel.getByText(/Handoff vers le worktree effectué : 2 fichiers transférés\./)).toBeVisible();
  await expect(toLocalBtn).toBeVisible();
  await expect(toWorktreeBtn).toHaveCount(0);

  // 2. Worktree isolé -> Local (sans fusion définitive)
  await toLocalBtn.click();
  await expect(panel.getByText(/Rapatrié en local \(Handoff\) : 2 fichiers transférés\./)).toBeVisible();
  await expect(toWorktreeBtn).toBeVisible();
  await expect(toLocalBtn).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("daemon macOS launchctl en 1 clic et cible Kana Cloud (Managé / Mobile)", async ({ page }) => {
  const errors = watchErrors(page);

  // 1. Daemon launchctl dans « Tâches planifiées »
  await nav(page).getByRole("button", { name: "Tâches planifiées" }).click();
  const daemonCard = page.getByRole("region", { name: "Daemon système macOS (launchd)" });
  await expect(daemonCard).toBeVisible();
  await expect(daemonCard.getByText("Non installé")).toBeVisible();

  await daemonCard.getByLabel("Intervalle du daemon").selectOption("900");
  await daemonCard.getByRole("button", { name: "Installer / Activer le daemon système (launchctl)" }).click();
  await expect(daemonCard.getByText("Actif (app fermée)")).toBeVisible();
  await expect(daemonCard.getByText(/vérification toutes les 15 min/)).toBeVisible();

  await daemonCard.getByRole("button", { name: "Désactiver le daemon" }).click();
  await expect(daemonCard.getByText("Non installé")).toBeVisible();
  await expect(daemonCard.getByText(/Daemon système désactivé/)).toBeVisible();

  // 2. Cible Kana Cloud (Managé / Mobile) dans SessionPanel
  await page.getByRole("button", { name: "Essai" }).click();
  await page.getByRole("button", { name: "Plan et tâches" }).click();
  const panel = page.locator("aside").last();

  await panel.getByLabel("Environnement d'exécution").selectOption("cloud");
  await panel.getByLabel("URL du serveur Kana Cloud").fill("https://kana.example.com");
  await panel.getByLabel("Token Bearer Kana Cloud").fill("cloud-secret-token");
  await panel.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(panel.getByText(/Connecté · 0 actif\(s\)/)).toBeVisible();

  await panel.getByLabel("Prompt tâche Kana Cloud").fill("Lance cargo test sur le serveur Cloud");
  await panel.getByRole("button", { name: "Envoyer une tâche Cloud" }).click();
  await expect(panel.getByText("Lance cargo test sur le serveur Cloud")).toBeVisible();
  await expect(panel.getByText("done", { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});

test("compositeur : dictée vocale temps réel (micro, transcription et envoi)", async ({ page }) => {
  const errors = watchErrors(page);

  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "fr-FR";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      start() {
        (window as unknown as { __kanaMockRecognition?: MockSpeechRecognition }).__kanaMockRecognition = this;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
      emitResult(transcript: string, isFinal: boolean) {
        const result = Object.assign([{ transcript }], { isFinal });
        this.onresult?.({
          resultIndex: 0,
          results: Object.assign([result], { length: 1 }),
        });
      }
    }
    (window as unknown as { SpeechRecognition?: typeof MockSpeechRecognition }).SpeechRecognition = MockSpeechRecognition;
  });

  await page.reload();
  await nav(page).getByRole("button", { name: "Créer" }).click();

  const micBtn = page.getByRole("button", { name: "Dictée vocale" });
  await expect(micBtn).toBeVisible();
  await micBtn.click();

  const statusBar = page.getByRole("status");
  await expect(statusBar).toBeVisible();
  await expect(statusBar.getByText("Écoute en cours...")).toBeVisible();

  // Résultat intermédiaire en temps réel
  await page.evaluate(() => {
    const rec = (window as unknown as { __kanaMockRecognition?: { emitResult: (t: string, f: boolean) => void } })
      .__kanaMockRecognition;
    rec?.emitResult("Bonjour", false);
  });
  await expect(statusBar.getByText("Bonjour")).toBeVisible();

  // Résultat final inséré dans le champ Message
  await page.evaluate(() => {
    const rec = (window as unknown as { __kanaMockRecognition?: { emitResult: (t: string, f: boolean) => void } })
      .__kanaMockRecognition;
    rec?.emitResult("Bonjour Kana lance les tests", true);
  });

  const messageBox = page.getByRole("textbox", { name: "Message" });
  await expect(messageBox).toHaveValue("Bonjour Kana lance les tests");

  // Arrêt de la dictée et envoi du message
  await statusBar.getByRole("button", { name: "Arrêter" }).click();
  await expect(statusBar).toHaveCount(0);

  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("Bonjour Kana lance les tests").first()).toBeVisible();
  await expect(page.getByText(/Tu as écrit « Bonjour Kana lance les tests »\./)).toBeVisible();

  expect(errors).toEqual([]);
});
