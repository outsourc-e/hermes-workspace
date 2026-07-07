# Plan d'implementation - Documents Dstny

## Principes

- Livraison par petits lots.
- Aucun changement destructif.
- Pas de worker autonome.
- Pas d'action externe.
- Tests a chaque lot.
- Rollback simple.

## Lot 0 - Cadrage

Livrables:

- PRD;
- design technique;
- plan d'implementation;
- tests d'acceptation.

Critere de sortie:

- PR draft ouverte;
- scope valide.

## Lot 1 - Backend registre et modeles

Fichiers probables:

- `src/server/dstny-documents.ts`
- `src/server/dstny-documents.test.ts`

Taches:

1. definir les types;
2. resoudre les chemins depuis `HERMES_HOME`;
3. creer le registre JSONL append-only;
4. ajouter lecture collapse latest-wins;
5. ajouter filtres simples.

Tests:

- creation record;
- update record;
- collapse par id;
- filtres collection/product/status/q.

## Lot 2 - API list/update

Fichiers probables:

- `src/routes/api/dstny-documents/list.ts`
- `src/routes/api/dstny-documents/update.ts`

Taches:

1. route list avec auth;
2. route update avec auth;
3. validation Zod;
4. erreurs JSON propres.

Tests:

- 401 sans auth;
- list OK;
- update metadata OK;
- path immutable.

## Lot 3 - Upload fichier

Fichiers probables:

- `src/routes/api/dstny-documents/upload.ts`
- tests API upload.

Taches:

1. multipart upload;
2. allowlist extensions;
3. taille max;
4. checksum SHA-256;
5. stockage sous `$HERMES_HOME/documents/dstny-inbox/<year>/<collection>/`;
6. record `uploaded`.

Tests:

- PDF valide;
- extension interdite;
- path traversal impossible;
- collision nom fichier.

## Lot 4 - Ingestion RAG

Fichiers probables:

- `src/routes/api/dstny-documents/ingest.ts`
- helper commande RAG.

Taches:

1. appeler `/home/node/.hermes/bin/dstny-rag-ingest-file`;
2. utiliser `execFile`, jamais shell;
3. parser JSON de sortie;
4. stocker `ragDocId`;
5. gerer erreurs/timeout.

Tests:

- wrapper mock OK;
- wrapper mock erreur;
- metadata transformees en tags;
- statut `indexed` ou `error`.

## Lot 5 - UI Documents Dstny

Fichiers probables:

- `src/routes/documents-dstny.tsx`
- `src/screens/documents-dstny/documents-dstny-screen.tsx`
- composants enfants.

Taches:

1. page route;
2. table documents;
3. formulaire metadata;
4. upload;
5. action ingest;
6. action prompt.

Tests:

- rendu page;
- champs obligatoires;
- upload mock;
- filtre;
- prompt visible.

## Lot 6 - Navigation

Taches:

1. ajouter entree `Documents Dstny` dans Knowledge;
2. icone coherente;
3. libelle court;
4. aucun retrait de `Fichiers`.

Test:

- nav contient `Documents Dstny`.

## Lot 7 - Prompt analyse

Taches:

1. endpoint prompt;
2. template Synthese Flash;
3. bouton copier;
4. option ouvrir chat si API existante propre.

Lot 1 UI: copie seulement.
Lot suivant: ouverture session chat.

## Lot 8 - Hardening

Taches:

1. logs propres;
2. limites taille;
3. messages erreurs;
4. documentation utilisateur;
5. smoke test production.

## Definition of Done globale

- `pnpm test` cible OK;
- `pnpm build` OK;
- page accessible;
- upload PDF OK;
- ingestion RAG OK sur VPS;
- document retrouve dans liste;
- prompt Synthese Flash genere;
- aucun secret affiche;
- aucun fichier stocke dans git;
- rollback documente.

## Branching recommande

```text
codex/dstny-document-intake-prd
codex/dstny-document-intake-backend
codex/dstny-document-intake-ui
```

La PR de cadrage ne doit contenir que `docs/dstny-document-intake/*`.
