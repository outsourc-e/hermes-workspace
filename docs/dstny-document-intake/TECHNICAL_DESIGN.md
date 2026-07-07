# Technical Design - Documents Dstny

## 1. Architecture cible

```text
Hermes Workspace UI
  src/routes/documents-dstny.tsx
  src/screens/documents-dstny/*

Workspace API
  /api/dstny-documents/list
  /api/dstny-documents/upload
  /api/dstny-documents/update
  /api/dstny-documents/ingest
  /api/dstny-documents/analyze-prompt

Storage local
  /home/node/.hermes/documents/dstny-inbox/
  /home/node/.hermes/documents/dstny-documents.jsonl

RAG existant
  /home/node/.hermes/bin/dstny-rag-ingest-file
  /home/node/.hermes/bin/cassian-rag.py
```

## 2. Emplacements

Par defaut:

```text
$HERMES_HOME/documents/dstny-inbox
$HERMES_HOME/documents/dstny-documents.jsonl
```

Avec `HERMES_HOME=/home/node/.hermes`, cela donne:

```text
/home/node/.hermes/documents/dstny-inbox
/home/node/.hermes/documents/dstny-documents.jsonl
```

Variables optionnelles:

```text
DSTNY_DOCUMENT_ROOT=/home/node/.hermes/documents/dstny-inbox
DSTNY_DOCUMENT_REGISTRY=/home/node/.hermes/documents/dstny-documents.jsonl
DSTNY_RAG_INGEST_BIN=/home/node/.hermes/bin/dstny-rag-ingest-file
```

## 3. Modele de donnees

```ts
type DstnyDocumentStatus = 'uploaded' | 'ready' | 'ingesting' | 'indexed' | 'error' | 'archived'

type DstnyDocumentRecord = {
  id: string
  title: string
  originalName: string
  storedName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string

  collection: string
  product: string | null
  channel: 'direct' | 'ambassadeur' | 'operateur' | 'interne' | 'tous'
  docType: string
  businessStatus: 'brouillon' | 'actif' | 'valide' | 'obsolete' | 'archive'
  confidence: 'faible' | 'moyen' | 'fort'
  documentDate: string | null
  supplier: string | null
  owner: string | null
  version: string | null
  summary: string | null
  keywords: Array<string>

  ingestionStatus: DstnyDocumentStatus
  ragDocId: string | null
  ragCollection: string | null
  lastError: string | null

  uploadedAt: string
  updatedAt: string
  ingestedAt: string | null
}
```

## 4. Registre

Lot 1: JSONL append-only.

Fichier:

```text
$HERMES_HOME/documents/dstny-documents.jsonl
```

Chaque mise a jour ajoute un record complet avec le meme `id`. La lecture collapse en memoire sur le dernier record par `id`.

Raison:

- simple;
- auditable;
- proche de la doctrine Cassian Hub;
- rollback facile;
- pas de migration DB pour le premier lot.

Migration possible lot 2: SQLite si besoin de filtres lourds.

## 5. Upload

Endpoint:

```text
POST /api/dstny-documents/upload
```

Requete multipart:

- `file`;
- metadata JSON.

Regles:

- auth Workspace obligatoire;
- extension allowlist;
- nom fichier normalise;
- stockage sous un dossier date/collection;
- checksum SHA-256;
- jamais sous le repo git;
- collision resolue par suffixe court.

Extensions lot 1:

```text
.pdf .docx .pptx .xlsx .csv .txt .md
```

## 6. Liste

Endpoint:

```text
GET /api/dstny-documents/list?collection=&product=&status=&q=
```

Retour:

```json
{
  "ok": true,
  "documents": []
}
```

## 7. Mise a jour metadata

Endpoint:

```text
POST /api/dstny-documents/update
```

Permet:

- corriger titre;
- changer statut;
- changer confiance;
- marquer obsolete/archive;
- enrichir resume/mots-cles.

Ne permet pas:

- changer `filePath`;
- supprimer physiquement le fichier;
- modifier le contenu source.

## 8. Ingestion RAG

Endpoint:

```text
POST /api/dstny-documents/ingest
```

Payload:

```json
{ "id": "doc_..." }
```

Commande executee:

```bash
/home/node/.hermes/bin/dstny-rag-ingest-file "$filePath" \
  --collection "$collection" \
  --title "$title" \
  --product "$product" \
  --channel "$channel" \
  --doc-type "$docType" \
  --status "$businessStatus" \
  --confidence "$confidence"
```

Tags supplementaires:

- `source:workspace-upload`
- `document_id:<id>`
- `type:<docType>`
- `statut:<businessStatus>`
- `canal:<channel>`
- `confiance:<confidence>`

Parsing de sortie:

- recuperer `doc_id` JSON si present;
- stocker dans `ragDocId`;
- en cas d'erreur, stocker `lastError`.

## 9. Prompt d'analyse

Endpoint:

```text
POST /api/dstny-documents/analyze-prompt
```

Retour:

```json
{
  "ok": true,
  "prompt": "..."
}
```

Lot 1: afficher/copier.
Lot 2: ouvrir chat avec prompt pre-rempli.

## 10. UI

Route:

```text
/documents-dstny
```

Menu:

```text
Knowledge > Documents Dstny
```

Composants:

- `documents-dstny-screen.tsx`
- `document-upload-panel.tsx`
- `document-metadata-form.tsx`
- `document-table.tsx`
- `document-detail-panel.tsx`
- `document-ingestion-status.tsx`

UX:

- colonne gauche: upload + filtres;
- zone principale: table documents;
- panneau detail: metadata, actions, prompt.

## 11. Integration navigation

Modifier le composant de navigation existant pour ajouter:

```text
Documents Dstny
```

dans Knowledge.

Ne pas supprimer `Fichiers`.

## 12. Securite

- utiliser `isAuthenticated(request)` sur chaque route;
- pas d'upload sans auth;
- pas de path traversal;
- resolution `realpath` sous racine autorisee;
- `execFile` avec arguments tableau, jamais shell string;
- timeout ingestion;
- taille max configurable;
- ne jamais retourner de secret ou contenu complet par defaut;
- logs sans token ni chemin sensible inutile.

## 13. Tests

Unitaires:

- validation metadata;
- normalisation fichier;
- registry append/collapse;
- generation commande RAG;
- prompt d'analyse.

API:

- unauthorized = 401;
- upload extension interdite = 400;
- upload valide = record cree;
- ingest appelle wrapper mocke;
- erreur wrapper = statut error;
- list filtre correctement.

UI:

- page charge;
- formulaire exige champs obligatoires;
- upload affiche document;
- bouton ingest change statut;
- bouton prompt affiche prompt.

## 14. Rollback

Rollback code:

- revert PR.

Rollback donnees:

- les fichiers restent sous `$HERMES_HOME/documents`;
- le registre JSONL reste lisible manuellement;
- aucune suppression automatique.

Rollback ingestion:

- ne pas supprimer Qdrant automatiquement en lot 1;
- marquer le document `obsolete` si ingestion a ete faite par erreur.
