# Hermes Project Cockpit

Statut: cadrage d'architecture  
Date: 2026-07-08  
Objectif: transformer Hermes Workspace en cockpit projet IA centralise, sans reconstruire les briques deja disponibles sur le VPS.

## Decision Directrice

Hermes Workspace devient la porte d'entree unique.

Les anciennes interfaces et outils specialises ne doivent pas etre fusionnes ni reecrits au depart. Ils doivent etre classes comme:

- coeur actif;
- brique specialisee;
- sandbox de developpement;
- legacy a mettre en veille;
- archive a conserver.

## Documents

- [VPS Audit](./VPS_AUDIT.md)
- [PRD](./PRD.md)
- [Architecture](./ARCHITECTURE.md)
- [Plan d'implementation](./IMPLEMENTATION_PLAN.md)
- [Registre des risques](./RISKS.md)

## Resultat Cible

Xavier doit pouvoir formuler une demande simple:

```text
Je veux un simulateur de devis Trunk SIP avec export PDF premium.
```

Hermes doit alors:

1. creer ou rattacher un projet;
2. cadrer le besoin;
3. retrouver les sources utiles;
4. proposer les lots;
5. choisir les outils et agents necessaires;
6. produire les artefacts;
7. enregistrer les decisions;
8. restituer l'avancement dans une page projet unique.

## Hors-Scope Initial

- remplacer Hermes Agent;
- remplacer le RAG existant;
- absorber PDFEngine dans Hermes Workspace;
- deployer simultanement Dify, OpenHands, OpenAgents et Agent OS;
- supprimer les anciennes briques avant export/audit;
- automatiser des actions irreversibles sans validation humaine.
