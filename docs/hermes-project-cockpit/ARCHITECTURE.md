# Architecture - Hermes Project Cockpit

## Principe

Le cockpit est une facade projet dans Hermes Workspace. Il ne remplace pas les services existants; il consolide leurs donnees dans un registre lisible.

```text
Hermes Workspace
  Project Cockpit
    Project Registry
    Artifact Registry
    Decision Log
    Project Context Injector
    Tool Router

Services existants
  Hermes Agent
  RAG / Qdrant
  Documents Dstny
  Files Workspace
  PDFEngine v2
  GitHub / repos
  Swarm / Conductor / Operations
  n8n / Presenton / Open Design (reserve)
```

## Frontiere D'Architecture

### Hermes Workspace

Responsable de:

- afficher les projets;
- rattacher sources et artefacts;
- injecter le contexte projet dans le chat;
- stocker les registres projet locaux;
- exposer les actions simples.

### Hermes Agent

Responsable de:

- raisonner;
- cadrer;
- utiliser les tools disponibles;
- produire les livrables;
- mettre a jour memoire/decisions selon les routes exposees.

### RAG

Responsable de:

- indexer les documents;
- retrouver des passages;
- fournir citations;
- rester un service specialise local.

### PDFEngine

Responsable de:

- produire des documents PDF;
- gerer templates, offres, publications;
- rester un projet/sandbox specialise pouvant etre deplace hors VPS.

Le cockpit stocke seulement:

- lien vers preview;
- repo;
- artefacts PDF;
- statut;
- decisions de projet.

## Project Context Injection

Quand un chat est lance depuis un projet, Hermes Workspace doit prepend un contexte borne:

```text
<project_context>
Projet: ...
Objectif: ...
Statut: ...
Sources liees: ...
Artefacts existants: ...
Decisions: ...
Prochaine action: ...
</project_context>
```

Contraintes:

- ne pas stocker ce contexte comme message utilisateur visible;
- garder une taille limitee;
- ne pas injecter de secrets;
- citer les sources RAG quand elles sont utilisees.

## Tool Router MVP

Regles simples au depart:

| Signal demande | Route proposee |
|---|---|
| document, source, analyse PDF | RAG / Documents Dstny |
| PRD, cadrage, decision | Hermes Agent + Artifact Markdown |
| PDF, fiche offre, devis premium | PDFEngine artifact |
| simulateur, interface, code | GitHub/Codex sandbox |
| tableau, pricing, BI, Excel | Spreadsheet/Data artifact |
| agents, lots, execution longue | Swarm/Conductor plus tard |

Le router MVP peut rester declaratif: Hermes propose la route et cree les artefacts de cadrage. L'execution automatique multi-outils vient apres.

## Stockage

MVP simple:

```text
/home/node/.hermes/projects/
  projects.jsonl
  sources.jsonl
  artifacts.jsonl
  decisions.jsonl
  runs.jsonl
  artifacts/
    <project-id>/
```

Avantages:

- facile a auditer;
- compatible Git backup;
- pas de migration DB initiale;
- coherent avec les registres JSONL deja presents.

Migration future possible vers SQLite/Postgres si volume ou requetes complexes.

## Securite

- Aucune action irreversible sans validation.
- Pas de suppression de service legacy au MVP.
- Pas de secrets dans les artefacts.
- Liens externes et sandboxes marques par environnement.
- `sandbox`, `staging`, `live`, `archived` visibles sur chaque projet/outillage.

## Strategy De Consolidation

1. Garder Hermes Workspace comme UI canonique.
2. Garder Hermes Agent comme runtime principal.
3. Garder RAG/Qdrant.
4. Garder PDFEngine comme service specialise.
5. Geler Cassian Hub et migrer les donnees utiles.
6. Mettre WebUI en veille seulement apres verification que Workspace couvre les usages.
