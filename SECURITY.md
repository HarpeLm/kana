# Politique de sécurité

## Signaler une faille

Merci de **ne pas** ouvrir d'issue publique pour une faille de sécurité.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability** ([lien direct](https://github.com/HarpeLm/kana/security/advisories/new)). Décrivez le problème, comment le reproduire et ce qu'il permettrait de faire.

Vous recevrez une réponse dès que possible, et nous vous tiendrons au courant de la correction. Merci de nous laisser le temps de corriger avant de rendre la faille publique.

## Ce qui compte comme une faille

Kana lance des agents de code, ouvre des fichiers locaux, pilote un navigateur intégré et garde des clés d'API dans le Trousseau. Sont notamment importants :

- un agent ou une page web qui sortirait des limites prévues (lire ou écrire hors du dossier de travail, contourner une demande d'autorisation, un mode « plan » qui modifierait des fichiers) ;
- une fuite de clé d'API ou de contenu de conversation ;
- l'exécution de code venant d'un artéfact, d'une page ou d'un fichier ouvert.

## Versions prises en charge

Kana est jeune : seule la dernière version de la branche `main` reçoit des correctifs.
