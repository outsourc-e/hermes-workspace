# Dstny Document Intake - cadrage

Statut: draft PRD
Date: 2026-07-07
Repository cible: outsourc-e/hermes-workspace

## Objectif

Ajouter dans Hermes Workspace une entree native `Documents Dstny` pour combler le manque entre:

- upload de fichier brut;
- metadata metier Dstny;
- ingestion RAG locale;
- analyse sourcee par Hermes.

Le module doit rester une extension legere de Workspace. Il ne doit pas embarquer Cassian Hub ni ajouter une deuxieme application.

## Documents

| Fichier | Role |
| --- | --- |
| PRD.md | besoin produit, utilisateurs, workflows, exigences |
| TECHNICAL_DESIGN.md | architecture, API, stockage, securite, integration RAG |
| IMPLEMENTATION_PLAN.md | lots de livraison, ordre d'execution, rollback |
| ACCEPTANCE_TESTS.md | tests fonctionnels, securite, non-regression |

## Decision de cadrage

On garde:

- Hermes Workspace comme interface principale;
- le RAG Cassian/Dstny existant;
- le wrapper `/home/node/.hermes/bin/dstny-rag-ingest-file`;
- les skills Dstny PMM deja installes.

On ajoute:

- une page `Documents Dstny` dans la section Knowledge;
- un stockage documentaire dedie;
- une base de suivi metadata;
- des routes API pour upload, liste, ingestion et prompt d'analyse.

On exclut:

- migration de Cassian Hub;
- remplacement du RAG existant;
- automatisation d'envoi externe;
- ingestion automatique sans validation metadata.
