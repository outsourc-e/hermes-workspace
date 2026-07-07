# Tests d'acceptation - Documents Dstny

## Test 1 - Navigation

Etant donne Hermes Workspace ouvert,
quand Xavier regarde la section Knowledge,
alors il voit une entree `Documents Dstny`.

Attendu:

- l'entree ne remplace pas `Fichiers`;
- elle ouvre `/documents-dstny`;
- la page charge sans erreur.

## Test 2 - Upload PDF

Etant donne un PDF local,
quand Xavier l'upload dans `Documents Dstny`,
alors le document est stocke hors git et apparait dans la liste.

Attendu:

- record cree;
- checksum calcule;
- statut `uploaded`;
- chemin sous `$HERMES_HOME/documents/dstny-inbox`;
- pas de fichier cree dans le repo.

## Test 3 - Metadata obligatoire

Etant donne un fichier selectionne,
quand Xavier tente de l'enregistrer sans collection ou titre,
alors l'UI bloque l'action.

Champs obligatoires:

- titre;
- collection;
- canal;
- type document;
- statut;
- confiance.

## Test 4 - Ingestion RAG

Etant donne un document upload avec metadata complete,
quand Xavier clique `Indexer dans le RAG`,
alors Workspace appelle le wrapper RAG et met a jour le registre.

Attendu:

- statut passe a `ingesting`, puis `indexed`;
- `ragDocId` renseigne si le wrapper le retourne;
- tags metier transmis;
- erreur visible si le wrapper echoue.

## Test 5 - Prompt Synthese Flash

Etant donne un document indexe,
quand Xavier clique `Preparer Synthese Flash`,
alors Workspace affiche un prompt pret a copier.

Attendu:

- le prompt contient titre, collection, produit, canal;
- il demande les sources;
- il demande fait/hypothese/interpretation/recommandation;
- il utilise le format Synthese Flash Dstny.

## Test 6 - Fichier interdit

Etant donne un fichier `.exe`,
quand Xavier tente de l'uploader,
alors l'API refuse.

Attendu:

- HTTP 400;
- message clair;
- aucun fichier stocke.

## Test 7 - Auth

Etant donne une requete non authentifiee,
quand elle appelle une route `/api/dstny-documents/*`,
alors l'API retourne 401.

## Test 8 - Archive sans suppression

Etant donne un document indexe,
quand Xavier le marque `archive`,
alors il disparait des vues actives mais reste dans le registre.

Attendu:

- pas de suppression physique lot 1;
- statut visible dans filtre archive;
- source toujours traçable.

## Test 9 - RAG indisponible

Etant donne le wrapper RAG indisponible,
quand Xavier clique `Indexer`,
alors Workspace garde le document et affiche une erreur.

Attendu:

- statut `error`;
- `lastError` renseigne;
- aucune perte metadata;
- bouton reessayer disponible.

## Test 10 - Smoke production

Sur le VPS:

```bash
systemctl is-active hermes.service hermes-workspace.service
corepack pnpm test <tests cibles>
corepack pnpm build
```

Attendu:

- services actifs;
- tests OK;
- build OK;
- pas d'erreur recente liee a `dstny-documents`.
