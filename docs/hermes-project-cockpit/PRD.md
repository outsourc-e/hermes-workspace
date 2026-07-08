# PRD - Hermes Project Cockpit

## Probleme

Xavier utilise plusieurs surfaces IA et outils techniques: ChatGPT, Codex, Hermes, RAG, fichiers, GitHub, PDFEngine, dashboards, scripts, anciennes interfaces Cassian. Cette dispersion oblige a reexpliquer le contexte, retrouver les livrables, choisir les bons outils et maintenir manuellement la continuite projet.

## Objectif

Creer dans Hermes Workspace un cockpit projet IA unique permettant de piloter des sujets PMM, documentaire, data, vibecoding et artefacts sans sortir de l'environnement VPS.

## Utilisateur Principal

Xavier DEMARET, PMM solo Dstny France, non technique dans l'usage quotidien, mais capable de valider un resultat produit/metier.

## Proposition De Valeur

Hermes devient un collegue projet permanent:

- il comprend le contexte Xavier/Dstny;
- il range les sources et livrables par projet;
- il cadre les demandes vagues;
- il choisit les outils/agents;
- il produit des artefacts;
- il garde la memoire des decisions;
- il evite de repartir d'un chat vide.

## Parcours Cible

1. Xavier exprime une demande simple:

```text
Je veux un simulateur de devis Trunk SIP avec export PDF premium.
```

2. Hermes cree un projet ou propose de rattacher a un projet existant.
3. Hermes produit automatiquement:
   - cadrage;
   - sources necessaires;
   - lots;
   - agents/outils proposes;
   - livrables attendus;
   - risques;
   - prochaine action.
4. Xavier suit l'avancement depuis une page projet.
5. Les documents, artefacts, decisions et sessions restent relies au projet.

## MVP

### Inclus

- Page `Projets`.
- Fiche projet unique.
- Project Registry local.
- Artifact Registry local.
- Liaison documents Dstny/RAG vers un projet.
- Liaison sessions Hermes vers un projet.
- Liaison repos/sandboxes/URLs externes vers un projet.
- Bouton `Travailler avec Hermes`.
- Generation d'un cadrage projet depuis un brief.
- Journal des decisions.
- Statuts simples: `brouillon`, `a_valider`, `valide`, `obsolete`, `archive`.

### Hors-Scope MVP

- orchestration autonome multi-outils complete;
- deploiement automatique externe;
- suppression des anciennes UIs;
- integration profonde OpenHands/Dify/OpenAgents;
- automatisation d'envoi email/publication;
- generation PowerPoint/PDF totalement automatisee sans validation.

## Objets Metier

### Project

- id;
- title;
- objective;
- status;
- environment: `sandbox`, `staging`, `live`, `archived`;
- domain tags;
- owner;
- createdAt;
- updatedAt.

### Source

- projectId;
- type: `rag_document`, `file`, `url`, `github_repo`, `note`;
- title;
- link;
- sourceId;
- confidence;
- status.

### Artifact

- projectId;
- type: `markdown`, `pdf`, `spreadsheet`, `presentation`, `web_app`, `prompt`, `decision`, `code`, `dataset`;
- title;
- pathOrUrl;
- status;
- version;
- producedBy;
- sourceRefs;
- createdAt.

### Decision

- projectId;
- topic;
- decision;
- rationale;
- status;
- sourceRefs;
- createdAt.

### Run

- projectId;
- type: `chat`, `rag`, `codex`, `swarm`, `pdfengine`, `data`, `manual`;
- input;
- outputRef;
- status;
- startedAt;
- completedAt.

## Criteres D'Acceptation MVP

- Xavier peut creer un projet en moins de 30 secondes.
- Xavier peut rattacher un document Dstny indexe a un projet.
- Xavier peut lancer un cadrage Hermes depuis le projet.
- Le cadrage cree au moins un artefact Markdown rattache au projet.
- Une decision peut etre enregistree et retrouvee depuis la fiche projet.
- Un lien PDFEngine ou GitHub peut etre rattache comme artefact.
- L'utilisateur voit clairement le statut du projet et la prochaine action.
- Aucune ancienne brique n'est supprimee.

## Critere Go/No-Go

Go si en 7 a 10 jours ouvrables on obtient:

- creation projet;
- sources rattachees;
- cadrage genere;
- livrable Markdown retrouve;
- lien artefact externe;
- page projet stable.

No-Go ou reduction de scope si le MVP derive vers orchestration multi-agent complexe avant d'avoir ces bases.
