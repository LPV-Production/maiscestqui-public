# Mais c'est qui ?

Le carnet de tes lectures : personnages, lieux, organisations, dates et leurs liens, livre par livre.
Tu indiques le chapitre (ou la page) où tu t'es arrêté, l'IA propose ce qui est apparu depuis ta dernière lecture, tu valides.

- **Avec le fichier du livre (EPUB ou PDF)** : l'IA lit réellement chaque chapitre, jusqu'à ton point de lecture et pas au-delà. Fiable pour tous les livres.
- **Sans le fichier** : photo d'une page (texte lu dans le navigateur), ou mémoire de l'IA (seulement pour les livres très connus).
- **Ajout d'un livre** : choix de l'édition exacte dans le catalogue de la BnF (et Open Library).

- **Interface** : React + Vite, installable sur le téléphone (écran d'accueil)
- **Serveur** : un Worker Cloudflare (`server/`) qui sert aussi l'interface, base **D1**, IA **Workers AI** — tout dans les offres gratuites
- **Connexion** : identifiant et mot de passe gérés par l'app

## Avoir ta propre version

👉 **Suis [TUTO.md](TUTO.md)** : en une demi-heure, tu as ta propre appli en ligne (gratuite, avec ta propre base de données). Comptes, mises à jour et tests sur ton ordinateur y sont aussi expliqués.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/pages/` | Écrans : bibliothèque, carnet, page, nouveautés, fiche, arbre, carte des liens |
| `src/lib/family.ts` | Construction des familles et disposition de l’arbre |
| `src/lib/epub.ts`, `src/lib/pdf.ts` | Découpage d’un EPUB ou d’un PDF en chapitres, dans le navigateur |
| `server/lib/lookup.ts` | Recherche d’éditions (BnF, Open Library) |
| `server/app.ts` | API (Hono) : livres, fiches, liens, suggestions, recherche de couverture |
| `server/lib/ai.ts` | Requête à l'IA, garde-fous anti-spoiler, fusion avec les fiches existantes |
| `shared/model.ts` | Types et vocabulaire communs |
| `migrations/` | Schéma de la base D1 |
| `scripts/creer-compte.mjs` | Création d'un compte ou changement de mot de passe |

## Licence

[MIT](LICENSE) : tu peux reprendre, modifier et partager ce projet librement, y compris pour un usage commercial, en gardant la mention de licence.
