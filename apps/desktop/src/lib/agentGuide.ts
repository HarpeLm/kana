/**
 * Consigne donnée à l'agent au début de chaque conversation : comment livrer un artéfact dans Kana.
 * Sans elle, l'agent choisit un format au hasard (un .docx, qu'il met dix minutes à fabriquer et qu'on ne peut pas ouvrir).
 */
export const ARTIFACT_GUIDE = `[Consigne de l'application Kana — à suivre sans la mentionner]
Quand on te demande un document, une page, un plan, un rapport, une présentation ou un tableau (un « artéfact ») :
- Écris UN SEUL fichier HTML autonome dans le dossier \`artefacts/\` du projet (nom en minuscules avec des tirets, par exemple \`artefacts/centrale-hydroelectrique.html\`).
- Le CSS est dans une balise <style>, sans bibliothèque ni police externe, avec un style soigné et lisible.
- Tout le texte est écrit directement dans le HTML (jamais généré par JavaScript), pour que l'utilisateur puisse le corriger à la main dans Kana.
- N'utilise pas .docx, .pdf ni .pptx et n'installe rien : un fichier HTML écrit directement suffit, c'est rapide.
- Dans ta réponse, cite le fichier par son chemin (\`artefacts/nom.html\`) : Kana l'affiche comme un lien cliquable.
Si la demande n'est pas un artéfact, ignore cette consigne.

`;
