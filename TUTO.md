# TUTO — Mettre en ligne ta propre version de « Mais c'est qui ? »

Le code est sur **GitHub** ; le site, la base de données et l'IA sont chez **Cloudflare**, dans les offres gratuites. Ce tuto part de zéro : à la fin, tu as **ta propre** appli en ligne, avec ta propre base de données (vide au départ).

**Sommaire**
1. [Comment ça marche](#1-comment-ça-marche)
2. [Première mise en ligne (une seule fois)](#2-première-mise-en-ligne-une-seule-fois)
3. [Installer l'appli sur ton téléphone](#3-installer-lappli-sur-ton-téléphone)
4. [Au quotidien : mettre à jour l'appli](#4-au-quotidien--mettre-à-jour-lappli)
5. [Gérer les comptes](#5-gérer-les-comptes)
6. [Tester sur ton ordinateur](#6-tester-sur-ton-ordinateur)
7. [Dépannage](#7-dépannage)

---

## 1. Comment ça marche

| Partie | Où | Rôle |
|---|---|---|
| L'interface | dossier `src/` | Les écrans (React + Vite) |
| Le serveur | dossier `server/` | Vérifie la connexion, lit/écrit dans la base, interroge l'IA |
| La base de données | Cloudflare **D1** | Tes livres, fiches, liens et points de lecture |
| La structure de la base | dossier `migrations/` | Créée automatiquement par une commande |
| L'IA | Cloudflare **Workers AI** (gratuit), et **Gemini** en option | Propose les personnages, lieux… apparus depuis ta dernière lecture |

- Chaque compte ne voit **que ses propres livres** : le serveur le vérifie à chaque demande.
- Les mots de passe ne sont jamais stockés, seulement une empreinte chiffrée.
- Pas d'inscription publique : c'est toi qui crées les comptes avec une commande (section 5).
- **L'IA** : sans réglage, l'appli utilise l'IA gratuite de Cloudflare, qui lit les chapitres par petits morceaux. Avec une clé **Gemini** gratuite (étape 2.6, facultative), elle lit un chapitre entier d'un coup : plus rapide et plus précis.

---

## 2. Première mise en ligne (une seule fois)

Avant de commencer, il te faut :
- un compte **GitHub** (gratuit) et un compte **Cloudflare** (gratuit) ;
- **Node.js 22 ou plus récent** (https://nodejs.org) et **Git** (https://git-scm.com) installés sur ton ordinateur.

Toutes les commandes se tapent dans un terminal ouvert **dans le dossier du projet** (sous Windows : clic droit dans le dossier → « Ouvrir dans le Terminal »).

### 2.1 Récupérer ta propre copie du projet
1. Sur la page GitHub de ce projet, clique **Use this template → Create a new repository**.
2. Donne-lui un nom (par exemple `maiscestqui`), choisis **Private** (conseillé : ce sera ta version à toi), puis **Create repository**.
3. Récupère-la sur ton ordinateur (remplace `ton-pseudo` par ton identifiant GitHub) :
```bash
git clone https://github.com/ton-pseudo/maiscestqui.git
```
```bash
cd maiscestqui
```
Ta copie est **totalement indépendante** : elle a sa propre base de données, vide, et personne d'autre n'y a accès.

### 2.2 Installer les outils du projet
```bash
npm install
```

### 2.3 Se connecter à Cloudflare depuis ce PC
```bash
npx wrangler login
```
Une page s'ouvre dans ton navigateur : connecte-toi à ton compte Cloudflare et accepte.

### 2.4 Créer ta base de données
```bash
npx wrangler d1 create maiscestqui
```
La commande affiche un bloc contenant `database_id = "xxxxxxxx-xxxx-…"`. Copie cet identifiant et colle-le dans `wrangler.toml`, à la place de `REMPLACE-PAR-TON-DATABASE-ID`. Enregistre.

Puis crée les tables (vides) :
```bash
npm run db:init:remote
```

### 2.5 Envoyer tes réglages sur GitHub, puis connecter Cloudflare
```bash
git add wrangler.toml
```
```bash
git commit -m "Mes réglages Cloudflare"
```
```bash
git push
```
Puis :
1. https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Import a repository** → **Get started**.
2. Choisis ton dépôt et configure :
   | Champ | Valeur |
   |---|---|
   | Project name | `maiscestqui` (**exactement** comme dans `wrangler.toml`) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Production branch | `main` |
3. **Save and Deploy**. Au bout de 1 à 2 minutes, Cloudflare affiche l'adresse de ton site, du type `https://maiscestqui.ton-sous-domaine.workers.dev`. Chaque `git push` remettra ensuite le site à jour tout seul.

### 2.6 (Facultatif) Ajouter une clé Gemini gratuite
1. Va sur https://aistudio.google.com → **Get API key** → **Create API key**, et copie la clé.
2. Envoie-la à Cloudflare comme **secret** (elle n'est jamais écrite dans le code ni envoyée sur GitHub) :
```bash
npx wrangler secret put GEMINI_API_KEY
```
Colle la clé quand c'est demandé. Si un jour le quota gratuit de Gemini est épuisé, l'appli repasse toute seule sur l'IA de Cloudflare.

### 2.7 Créer ton compte
```bash
npm run compte -- --remote
```
Le script demande l'identifiant (ex. `camille`), le nom affiché puis le mot de passe (rien ne s'affiche quand tu tapes, c'est normal). Le mot de passe ne quitte jamais ton PC : seule son empreinte est envoyée.

### 2.8 Vérifier
Ouvre l'adresse du site, connecte-toi, ajoute un livre. Il doit apparaître dans ta bibliothèque.

---

## 3. Installer l'appli sur ton téléphone

**iPhone** : ouvre l'adresse du site dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**. Ouvre ensuite l'appli depuis sa nouvelle icône et connecte-toi.

**Android** : ouvre l'adresse dans **Chrome** → menu ⋮ → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).

---

## 4. Au quotidien : mettre à jour l'appli

Après une modification :
```bash
git add .
```
```bash
git commit -m "Ce que j'ai changé"
```
```bash
git push
```
Cloudflare remet l'appli à jour tout seul en 1 à 2 minutes (onglet **Deployments**). Tes données ne bougent pas.

**Si une modification change la structure de la base** (nouveau fichier dans `migrations/`), lance aussi, une fois :
```bash
npm run db:init:remote
```

---

## 5. Gérer les comptes

- **Ajouter un compte** (pour un proche) : `npm run compte -- --remote`, avec un nouvel identifiant.
- **Changer de mot de passe ou mot de passe oublié** : relance la même commande avec le même identifiant. Le mot de passe est remplacé, les livres restent, et tous les appareils sont déconnectés.

---

## 6. Tester sur ton ordinateur

Une base de **test** séparée existe sur ton PC, sans rapport avec celle en ligne.
```bash
npm run build
```
```bash
npm run db:init:local
```
```bash
npm run compte -- --local
```
```bash
npx wrangler dev --port 8788
```
Puis ouvre http://localhost:8788. Les appels à l'IA passent par ton compte Cloudflare (étape 2.3).

Pour utiliser Gemini en local : copie `.dev.vars.example` en `.dev.vars` et mets-y ta clé. Ce fichier n'est **jamais** envoyé sur GitHub.

---

## 7. Dépannage

| Problème | Solution |
|---|---|
| La construction Cloudflare échoue avec « database_id » | Tu n'as pas remplacé l'identifiant dans `wrangler.toml` (étape 2.4). |
| « no such table » | Les tables n'ont pas été créées : `npm run db:init:remote` (ou `db:init:local` en test). |
| Les suggestions de l'IA sont lentes ou incomplètes | Ajoute une clé Gemini (étape 2.6). |
| Voir les erreurs du serveur | Cloudflare → ton Worker `maiscestqui` → onglet **Logs**. |
