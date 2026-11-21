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
