# Registre Des Risques

## Risques Produit

| Risque | Probabilite | Impact | Mitigation |
|---|---:|---:|---|
| Refaire un Cassian Hub trop large | Elevee | Eleve | MVP limite a Projet + Sources + Artefacts + Decisions |
| Trop d'ecrans | Elevee | Eleve | Page projet unique; outils en sous-vues |
| Xavier doit choisir les outils | Moyenne | Eleve | Router Hermes et templates de cadrage |
| Le cockpit devient un dashboard passif | Moyenne | Moyen | Bouton central `Travailler avec Hermes` |
| Perte de confiance si sources mal citees | Moyenne | Eleve | RAG avec citations et source registry |

## Risques Techniques

| Risque | Probabilite | Impact | Mitigation |
|---|---:|---:|---|
| Plusieurs UIs Hermes actives creent confusion | Elevee | Moyen | Workspace canonique, WebUI en veille apres validation |
| PDFEngine existe en plusieurs emplacements | Elevee | Moyen | Declarer runtime actif vs archive historique |
| Cassian Hub contient donnees utiles non migrees | Elevee | Eleve | Export selectif avant stop |
| Trop de services sur VPS | Moyenne | Moyen | Classification coeur/specialise/sandbox/legacy |
| Secrets exposes dans logs/docs | Moyenne | Eleve | Ne jamais documenter tokens; scanner docs avant commit |
| JSONL devient limite si volume eleve | Faible MVP | Moyen | Migration SQLite/Postgres future |
| Router outil trop ambitieux | Elevee | Moyen | Commencer declaratif, execution auto plus tard |

## Risques Operationnels

| Risque | Probabilite | Impact | Mitigation |
|---|---:|---:|---|
| Stopper un service encore utile | Moyenne | Eleve | Stop 24h avant disable; aucun delete |
| Perdre des artefacts | Moyenne | Eleve | Artifact Registry + backups |
| Confondre sandbox et live | Moyenne | Eleve | Environnement visible sur chaque projet |
| Repartir sur un tunnel de 3 mois | Elevee | Eleve | Go/No-Go 7-10 jours pour MVP |

## Regle De Controle

Tout lot doit repondre a une question simple:

```text
Est-ce que Xavier retrouve mieux son projet, ses sources ou ses livrables apres ce lot ?
```

Si non, le lot est reporte.
