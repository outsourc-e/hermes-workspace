# PRD - Documents Dstny dans Hermes Workspace

## 1. Resume

Hermes Workspace permet deja de naviguer dans les fichiers et Hermes dispose deja d'un RAG Dstny local. Le manque principal est l'etape metier entre les deux: deposer un document, le qualifier avec des metadonnees Dstny, l'indexer dans le RAG, puis declencher une analyse sourcee.

Le produit a creer est une page native `Documents Dstny`, accessible depuis le menu Knowledge, qui transforme l'upload de fichiers en flux documentaire PMM fiable.

## 2. Probleme

Aujourd'hui:

- le chat n'accepte pas toujours tous les types de fichiers;
- l'explorateur `Fichiers` est brut et non metier;
- l'ingestion RAG existe mais se fait par commande serveur;
- les metadonnees Dstny sont faciles a oublier;
- les documents importants risquent d'etre analyses une fois puis perdus dans le contexte;
- Cassian Hub contient une surcouche documentaire, mais trop large et trop lourde pour ce besoin.

## 3. Utilisateur cible

Utilisateur principal: Xavier DEMARET, Responsable Produits Marketing / PMM solo chez Dstny France.

Cas d'usage:

- catalogues tarifaires;
- fiches produits;
- supports commerciaux;
- documents fournisseurs;
- contrats;
- exports BI;
- benchmarks concurrence;
- livrables valides;
- documents PDF Engine / GitHub / projets techniques.

## 4. Objectifs produit

1. Permettre l'upload de documents metier dans Workspace.
2. Forcer une qualification minimale avant ingestion RAG.
3. Indexer dans le RAG local existant sans changer l'infrastructure RAG.
4. Produire un prompt d'analyse PMM pret a envoyer a Hermes.
5. Conserver un registre des documents, statuts et erreurs.
6. Separar les sources internes, concurrence, personnel et livrables valides.
7. Reduire la charge mentale: Xavier ne doit pas retenir les commandes CLI.

## 5. Non-objectifs

- Ne pas remplacer `Fichiers`.
- Ne pas remplacer le RAG existant.
- Ne pas importer Cassian Hub.
- Ne pas creer un dashboard analytique lourd.
- Ne pas ingester automatiquement tout le workspace.
- Ne pas connecter Google Drive/Gmail/Calendar dans ce lot.
- Ne pas envoyer de document ou d'email a l'exterieur.

## 6. Navigation

Ajouter une entree dans la section Knowledge:

```text
KNOWLEDGE
  Memoire
  Documents Dstny
  Competences
  MCP
  Profils
```

Raison: `Fichiers` reste un explorateur brut. `Documents Dstny` devient le flux documentaire metier.

## 7. Workflow principal

### 7.1 Upload

L'utilisateur ouvre `Documents Dstny`, clique `Ajouter un document`, selectionne un fichier.

Formats acceptes au premier lot:

- PDF;
- DOCX;
- PPTX;
- XLSX;
- CSV;
- TXT;
- MD.

### 7.2 Qualification

Le formulaire demande:

- titre;
- collection;
- produit;
- canal;
- type de document;
- statut;
- niveau de confiance;
- date du document si connue;
- fournisseur si applicable;
- mots-cles;
- resume court optionnel.

### 7.3 Ingestion RAG

L'utilisateur clique `Indexer dans le RAG`.

Workspace appelle le wrapper existant:

```bash
/home/node/.hermes/bin/dstny-rag-ingest-file
```

L'UI affiche:

- en attente;
- ingestion en cours;
- indexe;
- erreur.

### 7.4 Analyse

L'utilisateur clique `Preparer Synthese Flash`.

Workspace genere un prompt:

```text
Synthese Flash : analyse le document "[titre]" depuis le RAG.
Collection : [collection]
Produit : [produit]
Canal : [canal]

Je veux :
- resume en 5 lignes;
- impacts business;
- impacts techniques;
- impacts pricing si presents;
- risques;
- questions a poser;
- actions recommandees;
- sources citees.

Distingue fait valide, hypothese, interpretation, recommandation et decision a confirmer.
```

Lot 1: prompt copiable.
Lot 2: bouton qui ouvre une nouvelle session chat avec ce prompt.

## 8. Collections Dstny

Valeurs recommandees:

- `dstny_catalogues`
- `dstny_produits`
- `metacentrex_alianza`
- `concurrence`
- `sales_enablement`
- `pricing`
- `mydstny_si`
- `github_pdfengine`
- `livrables_valides`
- `decisions`

## 9. Champs metier

### 9.1 Canal

- `direct`
- `ambassadeur`
- `operateur`
- `interne`
- `tous`

### 9.2 Type de document

- `catalogue`
- `fiche_produit`
- `contrat`
- `slide`
- `email`
- `export_bi`
- `pricing`
- `procedure`
- `benchmark`
- `livrable`
- `decision`
- `autre`

### 9.3 Statut

- `brouillon`
- `actif`
- `valide`
- `obsolete`
- `archive`

### 9.4 Confiance

- `faible`
- `moyen`
- `fort`

## 10. Etats UI

Chaque document affiche:

- titre;
- type;
- produit;
- canal;
- collection;
- statut;
- confiance;
- date upload;
- date ingestion;
- etat ingestion;
- dernier message d'erreur;
- chemin fichier;
- doc_id RAG si disponible.

## 11. Securite

- Auth Workspace obligatoire.
- Aucune ingestion sans action explicite.
- Taille max configurable.
- Extensions autorisees uniquement.
- Fichiers stockes hors git.
- Pas d'affichage de secrets.
- Pas d'appel externe.
- Pas de suppression definitive en lot 1.
- Suppression: statut `archive` ou `obsolete`, pas `rm`.

## 12. Critere de succes

Le module est accepte si Xavier peut:

1. uploader un PDF;
2. renseigner ses metadonnees;
3. l'indexer dans le RAG;
4. retrouver le document dans la liste;
5. generer un prompt Synthese Flash;
6. obtenir une reponse Hermes qui cite la source RAG.

## 13. Risques

| Risque | Mitigation |
| --- | --- |
| Scope trop large | livrer un module intake minimal |
| Metadata oubliees | formulaire avec champs obligatoires |
| Confusion avec Fichiers | nommer clairement `Documents Dstny` |
| RAG indisponible | etat `erreur` + message explicite |
| Documents obsoletes | statut visible + filtres |
| Fuite de donnees | stockage local, auth, pas d'envoi externe |

## 14. Decisions ouvertes

1. Nom final: `Documents Dstny` ou `Bibliotheque Dstny`.
2. Base registre: JSONL ou SQLite.
3. Limite taille fichier par defaut.
4. Bouton analyse: prompt copiable en lot 1 ou ouverture chat immediate.
5. Niveau d'integration avec la page `Fichiers`.
