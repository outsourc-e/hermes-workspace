# Livraison MVP - Hermes Project Cockpit

Statut: MVP deploye sur VPS  
Date: 2026-07-08  
URL: `/projects`

## Ce qui est livre

Le MVP ajoute une entree `Projets` dans Hermes Workspace et une page projet persistante.

Chaque projet peut contenir:

- un objectif;
- un statut;
- un environnement: `sandbox`, `staging`, `live`, `archived`;
- des tags;
- des sources;
- des artefacts;
- des decisions;
- un brief copiable pour lancer une session Hermes avec le bon contexte.

Les donnees sont stockees cote serveur en JSONL append-only dans:

```text
HERMES_HOME/projects
```

Par defaut, cela correspond a:

```text
/home/node/.hermes/projects
```

## Workflow utilisateur

1. Ouvrir `Projets`.
2. Creer un projet avec un titre simple et un objectif concret.
3. Ajouter les sources utiles:
   - document RAG;
   - fichier;
   - URL;
   - repo GitHub;
   - note.
4. Ajouter les artefacts produits:
   - Markdown;
   - PDF;
   - tableur;
   - presentation;
   - interface web;
   - prompt;
   - code;
   - dataset;
   - lien externe.
5. Enregistrer les decisions importantes.
6. Cliquer sur `Travailler avec Hermes`.
7. Coller le brief genere dans une session chat Hermes.

## Intention produit

Le cockpit ne remplace pas encore Hermes Agent, le RAG ou PDFEngine.

Il sert de couche de pilotage:

- centraliser le contexte projet;
- eviter de perdre les livrables dans les chats;
- conserver les decisions;
- rattacher les sources et artefacts;
- preparer Hermes a travailler avec un brief projet stable.

## Verification technique

Commandes executees:

```bash
corepack pnpm test src/server/project-cockpit.test.ts src/server/dstny-rag.test.ts src/server/dstny-documents.test.ts
corepack pnpm build
systemctl restart hermes-workspace
curl -I https://hermes-workspace.72-61-162-15.sslip.io/projects
```

Resultat:

- tests serveur: OK;
- build production: OK;
- service `hermes-workspace`: actif;
- URL publique `/projects`: HTTP 200.

## Limites assumees du MVP

- Le rattachement entre un document Dstny indexe et un projet reste manuel.
- Le bouton `Travailler avec Hermes` genere un brief, mais ne cree pas encore automatiquement une session chat.
- La swarm n'est pas encore orchestree automatiquement depuis un projet.
- Les artefacts PDF/PPT/XLSX sont references, mais pas encore generes directement depuis le cockpit.
- Les permissions d'action externe restent volontairement conservatrices.

## Prochaine tranche recommandee

La prochaine tranche doit connecter le cockpit aux briques deja existantes:

1. lier un document Dstny/RAG a un projet depuis l'ecran `Documents Dstny`;
2. creer une session Hermes pre-remplie depuis le brief projet;
3. ajouter une chronologie projet unique: sources, prompts, decisions, artefacts;
4. exposer PDFEngine comme artefact sandbox quand un projet produit un PDF;
5. preparer l'orchestration swarm sur demande explicite, sans action irreversible automatique.
