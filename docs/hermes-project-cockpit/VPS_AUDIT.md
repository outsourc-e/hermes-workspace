# VPS Audit

Date: 2026-07-08  
Serveur: Hostinger VPS `srv1064977`  
But: identifier les fondations a conserver avant de construire le Project Cockpit.

## Entree Canonique Recommandee

| Role | Service / URL | Statut | Decision |
|---|---|---:|---|
| Agent principal | `hermes.service` / `127.0.0.1:8642` | actif | Garder |
| Interface principale | `hermes-workspace.service` / `127.0.0.1:3010` | actif | Garder, devenir cockpit |
| RAG API | `cassian-rag-api` / `127.0.0.1:3410` | actif Docker | Garder |
| Vector store | `cassian-rag-qdrant` / `127.0.0.1:6333` | actif Docker | Garder |
| Reverse proxy public | Traefik + Nginx interne | actif | Garder, clarifier routes |

## Interfaces Actives A Rationaliser

| Brique | Endpoint / port | Observation | Decision proposee |
|---|---|---|---|
| Hermes Workspace | `hermes-workspace.72-61-162-15.sslip.io` | UI la plus adaptee et deja etendue | Canonique |
| Hermes WebUI | `hermes-webui.72-61-162-15.sslip.io`, `127.0.0.1:8787` | Ancienne UI Hermes separee | Mettre en veille apres validation |
| Hermes Dashboard | `hermes-dashboard.72-61-162-15.sslip.io`, `127.0.0.1:9119` | Dashboard historique/gateway | Garder temporairement pour diagnostic |
| Cassian Project Hub | `projects.72-61-162-15.sslip.io`, `127.0.0.1:9131` | Ancien hub avec donnees projet utiles | Geler, migrer les donnees utiles |
| PDFEngine v2 preview | `pdfengine.72-61-162-15.sslip.io`, `127.0.0.1:3310` | Brique specialisee PDF active | Garder comme outil/sandbox |

## Outils Docker Actifs

| Conteneur | Role | Decision |
|---|---|---|
| `root-traefik-1` | TLS / exposition publique | Garder |
| `cassian-rag-api` | API RAG | Garder |
| `cassian-rag-qdrant` | base vectorielle | Garder |
| `pdfengine-v2` | runtime PDFEngine Dockerise | Garder |
| `gotenberg-gotenberg-1` | rendu PDF | Garder |
| `root-n8n-1` | automatisations | Garder en reserve, pas integrer au MVP |
| `presenton` | presentations | Garder en reserve |
| `cassian-open-design` | design / generation UI | Garder en reserve |
| `helpdesk-channel-studio` | outil specialise | Classer avant integration |
| `go-hello` | demo/sandbox | Candidat mise en veille |

## Dossiers Et Repos Relevants

| Chemin | Role | Decision |
|---|---|---|
| `/opt/hermes-workspace` | interface principale | developpement cockpit |
| `/home/node/.hermes/hermes-agent` | agent Hermes | coeur runtime |
| `/home/node/.hermes/rag/work-dstny` | artefacts RAG Dstny | source documentaire |
| `/home/node/.hermes/documents` | inbox documents Dstny | source documentaire |
| `/home/node/workspace/pdfengine-v2` | PDFEngine v2 actif | sandbox/projet specialise |
| `/home/node/.hermes/pdfengine` | PDFEngine historique | archive/source legacy |
| `/opt/cassian-project-portal` | ancien Cassian Hub | exporter/migrer donnees |
| `/home/node/.hermes/knowledge/dstny` | knowledge base Dstny Git | conserver |
| `/home/node/.hermes/openclaw-memory` | memoire/projets legacy | auditer avant reprise |

## Point D'Attention PDFEngine

Deux emplacements coexistent:

- `/home/node/workspace/pdfengine-v2`: runtime preview actif, branche `docs/plan-reprise-lots`, remote GitHub `bretacheflow/pdfengine-v2`.
- `/home/node/.hermes/pdfengine`: projet historique, non identique au runtime actif.

Decision: ne pas fusionner. Dans le cockpit, PDFEngine doit etre reference comme outil/projet externe avec liens repo, preview, artefacts et environnements.

## Donnees Cassian Hub A Ne Pas Perdre

Le dossier `/opt/cassian-project-portal/data` contient des donnees utiles:

- `projects.json`;
- `project-requests.jsonl`;
- `project-plans.jsonl`;
- `project-lot-runs.jsonl`;
- `project-lot-exec.jsonl`;
- `le-fil-*`;
- `actions.jsonl`;
- `deliveries.jsonl`;
- `le-fil-artifacts.jsonl`;
- `activity.jsonl`;
- artefacts pricing `.md`, `.json`, `.pptx`.

Decision: geler puis migrer selectivement vers le futur Project Registry / Artifact Registry.

## Politique Safe Disable

Avant de desactiver un service:

1. capturer son unit file;
2. verifier les ports/routes publiques;
3. exporter les donnees utiles;
4. creer un snapshot de configuration;
5. `systemctl stop` seulement si aucun workflow actif ne depend du service;
6. attendre 24-48h avant `disable`;
7. ne jamais supprimer les dossiers au premier passage.

Services candidats a mise en veille:

- `hermes-webui.service`;
- une partie de `cassian-project-hub-api.service` apres migration;
- conteneurs demo/sandbox non relies a un projet.

Services a garder actifs pour le moment:

- `hermes.service`;
- `hermes-workspace.service`;
- `hermes-dashboard.service` tant que le gateway en depend pour diagnostic;
- `pdfengine-preview.service`;
- RAG/Qdrant;
- Traefik/Nginx.
