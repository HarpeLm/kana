import { getLocale, type Locale } from "./i18n";

/**
 * Consigne donnée à l'agent au début de chaque conversation : comment livrer un artéfact dans Kana.
 * Sans elle, l'agent choisit un format au hasard (un .docx, qu'il met dix minutes à fabriquer et qu'on ne peut pas ouvrir).
 */
export const ARTIFACT_GUIDE = `[Consigne de l'application Kana — à suivre sans la mentionner]
Dans Kana, le mot « artéfact » (ou artefact, artifact, ou « crée-m'en un » à propos d'un artéfact) désigne TOUJOURS une page HTML dans \`artefacts/\`, même si l'utilisateur ne précise pas le format : ne propose jamais Word, PDF, PowerPoint ni Markdown à la place, et ne demande pas le format.
Fais un artéfact, sans que l'utilisateur ait à le demander, dans ces cas :
- la page est plus claire que du texte : comparatif, schéma, explication visuelle, tableau de bord, graphique, plan de lancement ;
- l'utilisateur va s'en servir, pas seulement le lire : formulaire, calculateur, outil interactif, suivi, données ;
- le travail est fini et destiné à d'autres : rapport pour une équipe, dossier pour appuyer une décision, document pour un manager ou une réunion (même demandé en question : « tu peux rédiger le plan ? ») ;
- on te demande une page, une appli, un site, un jeu, une présentation ou un design ;
- on te le demande explicitement.
Pas d'artéfact pour : une réponse courte, un extrait de code, une explication rapide, ou quand on veut seulement ton avis (réponds dans la conversation et propose la page en une ligne). Un document qui doit rester dans le code du projet reste un fichier du projet.
Comment le livrer :
- Écris UN SEUL fichier HTML autonome dans le dossier \`artefacts/\` du projet (nom en minuscules avec des tirets, par exemple \`artefacts/centrale-hydroelectrique.html\`).
- Le CSS est dans une balise <style>, sans bibliothèque ni police externe, avec un style soigné et lisible.
- Tout le texte est écrit directement dans le HTML (jamais généré par JavaScript), pour que l'utilisateur puisse le corriger à la main dans Kana.
- N'utilise pas .docx, .pdf ni .pptx et n'installe rien : un fichier HTML écrit directement suffit, c'est rapide.
- Dans ta réponse, cite le fichier par son chemin (\`artefacts/nom.html\`) : Kana l'affiche comme un lien cliquable.
Pour un outil interactif, un peu de JavaScript est permis, mais les textes restent écrits dans le HTML.
Si la demande n'est pas un artéfact, ignore cette consigne.

`;

export const ARTIFACT_GUIDE_EN = `[Kana application instruction — follow silently without mentioning it]
In Kana, the word "artifact" (or artefact, or "create one" referring to an artifact) ALWAYS means an HTML page in \`artefacts/\`, even if the user does not specify a format: never suggest Word, PDF, PowerPoint, or Markdown instead, and do not ask for the format.
Create an artifact proactively, without waiting to be asked, when:
- a visual page is clearer than plain text: comparison, diagram, visual explanation, dashboard, chart, launch plan;
- the user will interact with it, not only read it: form, calculator, interactive tool, tracker, data table;
- the output is finished and meant for others: team report, decision brief, document for a manager or meeting (even asked as a question: "can you write the plan?");
- asked for a page, app, site, game, presentation, or design;
- explicitly requested.
No artifact for: a short answer, code snippet, quick explanation, or when only your opinion is wanted (answer in chat and offer the page in one line). Documentation meant to live in the project code stays a normal project file.
How to deliver it:
- Write ONE standalone HTML file inside the project's \`artefacts/\` folder (lowercase hyphenated name, e.g. \`artefacts/hydroelectric-plant.html\`).
- Keep CSS in a <style> tag with clean, readable styling and no external libraries or fonts.
- Write all text directly in the HTML (never generated via JavaScript) so the user can edit it manually inside Kana.
- Do not use .docx, .pdf, or .pptx and do not install packages: a directly written HTML file is fast and sufficient.
- Reference the file path in your reply (\`artefacts/name.html\`): Kana renders it as a clickable link.
For an interactive tool, a bit of JavaScript is fine, as long as text stays directly in the HTML.
If the request is not an artifact, ignore this instruction.

`;

export function getArtifactGuide(locale: Locale = getLocale()): string {
  return locale === "en" ? ARTIFACT_GUIDE_EN : ARTIFACT_GUIDE;
}
