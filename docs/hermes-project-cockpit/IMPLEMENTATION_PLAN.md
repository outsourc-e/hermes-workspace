# Plan D'Implementation

## Phase 0 - Stabilisation Fondations

Objectif: eviter de construire le cockpit sur un VPS confus.

Actions:

- conserver `hermes.service`, `hermes-workspace.service`, RAG/Qdrant;
- verifier chaque route publique utile;
- documenter WebUI/Dashboard/Cassian/PDFEngine;
- ne rien supprimer;
- definir Workspace comme entree officielle;
- capturer les donnees Cassian Hub a migrer.

Livrable:

- dossier `docs/hermes-project-cockpit/`.

## Phase 1 - Project Registry MVP

Objectif: creer la notion de projet dans Hermes Workspace.

Backend:

- `src/server/project-cockpit.ts`;
- JSONL sous `/home/node/.hermes/projects/`;
- routes API:
  - `list`;
  - `create`;
  - `get`;
  - `update`;
  - `link-source`;
  - `link-artifact`;
  - `add-decision`.

Frontend:

- route `/projects`;
- liste projets;
- fiche projet;
- resume, sources, artefacts, decisions, activite.

Tests:

- creation projet;
- update statut;
- liaison source;
- liaison artifact;
- lecture latest state.

## Phase 2 - Liaison Documents / RAG

Objectif: attacher des documents Dstny a un projet.

Actions:

- ajouter `projectId` optionnel aux documents ou creer une table de liaison;
- depuis `Documents Dstny`, action `Attacher a un projet`;
- depuis projet, afficher sources Dstny;
- injecter sources projet dans le prompt.

## Phase 3 - Project Chat Context

Objectif: ne plus repartir d'un chat vide.

Actions:

- bouton `Travailler avec Hermes`;
- creation session liee au projet;
- injection contexte projet dans `/api/send-stream`;
- journaliser le run dans `runs.jsonl`;
- creer un artefact Markdown a partir d'une reponse validee.

## Phase 4 - Artifact Registry

Objectif: retrouver les livrables.

Types initiaux:

- `markdown`;
- `pdf`;
- `spreadsheet`;
- `presentation`;
- `web_app`;
- `prompt`;
- `decision`;
- `github_repo`;
- `external_url`.

Actions:

- creer artefact depuis texte;
- lier URL externe;
- lier repo/branche/PR;
- afficher version/statut.

## Phase 5 - Sandbox / Live

Objectif: gerer vibecoding et projets qui partent ensuite ailleurs.

Actions:

- ajouter environnement `sandbox`, `staging`, `live`, `archived`;
- lier preview URL;
- lier repo GitHub;
- lier service VPS si applicable;
- stocker la decision de deploiement.

## Phase 6 - Router Et Agents

Objectif: Hermes choisit progressivement les bons modes d'execution.

MVP:

- router declaratif;
- recommandations d'outil;
- creation de lots;
- pas d'execution autonome irreversible.

Plus tard:

- appel Swarm/Conductor;
- integration Codex/OpenHands;
- integration PDFEngine API;
- integration n8n/Presenton si justifiee.

## Safe Disable Plan

Desactivation seulement apres Phase 1 ou 2.

1. Exporter Cassian Hub data vers `projects/imports/cassian`.
2. Verifier que Project Cockpit affiche les projets/artefacts utiles.
3. Stopper `hermes-webui.service` 24h sans disable.
4. Si aucun incident, disable WebUI.
5. Garder Dashboard tant qu'il sert au diagnostic gateway.
6. Stopper Cassian Hub seulement apres migration validee.

## Definition De Done MVP

- Workspace accessible publiquement.
- Page Projets disponible.
- Projet cree.
- Source Dstny rattachee.
- Cadrage Hermes genere.
- Artefact Markdown stocke et visible.
- Decision stockee et visible.
- Aucun service legacy supprime.
- Tests unitaires passent.
- Build passe.
