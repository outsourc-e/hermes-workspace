# Template Library Dstny - Cadrage Suite

Statut: cadrage produit / architecture  
Date: 2026-07-08  
Contexte: Hermes Project Cockpit MVP

## Decision Directrice

Ne pas produire de PDF métier récurrents sans bibliothèque de templates.

Le prochain jalon n'est pas de générer une fiche produit Connectivité isolée. Le prochain jalon est de créer une capacité permanente:

```text
Hermes sait produire des livrables Dstny sourcés, versionnés, contrôlés et cohérents avec un template.
```

## Objectif

Créer une bibliothèque de templates livrables dans Hermes Workspace, utilisable par:

- le cockpit projet;
- le chat Hermes;
- le RAG Dstny;
- PDF Engine;
- les futurs agents spécialisés.

## Problème à Résoudre

Sans template stable:

- chaque PDF risque d'avoir une structure différente;
- les prompts dérivent;
- les prix peuvent être mélangés entre canaux;
- les sources peuvent être anciennes ou insuffisantes;
- les agents affichés dans le cockpit restent déclaratifs;
- la production consomme des tokens sans garantie métier.

## Principe Produit

Un template n'est pas seulement une mise en page.

Un template doit porter:

- une intention métier;
- une cible;
- un canal;
- des sections obligatoires;
- des règles de sourcing;
- des règles pricing;
- des prompts spécialisés;
- une checklist qualité;
- une structure de rendu PDF;
- un statut de validation.

## Templates Prioritaires

### 1. Fiche produit PDF - Tous canaux

Usage: produire une fiche générique lorsque le canal n'est pas encore arbitrée.

Sections:

- promesse client;
- cible;
- problèmes adressés;
- bénéfices;
- description de l'offre;
- options / variantes;
- prérequis;
- pricing à valider;
- objections;
- preuves / sources;
- limites de publication.

### 2. Fiche produit PDF - Direct

Usage: support commercial orienté client final.

Différences:

- bénéfices client plus visibles;
- moins de mécanique partenaire;
- pricing public uniquement si validé;
- discours simple et commercial.

### 3. Fiche produit PDF - Ambassadeur

Usage: support revendeur commissionné.

Différences:

- pourquoi c'est facile à vendre;
- cible client;
- pitch commercial;
- objections terrain;
- bénéfices pour le partenaire;
- éléments à reprendre dans la vente client.

### 4. Fiche produit PDF - Opérateur / Marque Blanche

Usage: partenaire qui achète, revend, package ou intègre l'offre.

Différences:

- logique achat / revente;
- marge et packaging partenaire;
- intégration catalogue;
- exploitation / support;
- règles de non-comparaison prix wholesale vs prix final.

## Modèle de Données Minimum

```ts
type DeliverableTemplate = {
  id: string
  name: string
  type: 'fiche_produit_pdf' | 'battle_card' | 'one_pager' | 'support_interne'
  productFamily: 'connectivite' | 'mobile' | 'ucaas' | 'siptrunk' | 'metacentrex' | 'generic'
  channel: 'tous' | 'direct' | 'ambassadeur' | 'operateur' | 'interne'
  status: 'brouillon' | 'a_valider' | 'valide' | 'obsolete'
  requiredSources: Array<'produit' | 'pricing' | 'technique' | 'commercial' | 'legal'>
  sections: Array<TemplateSection>
  prompts: TemplatePrompts
  qualityRules: Array<QualityRule>
  renderTarget: 'html_pdf' | 'pdfme' | 'presenton' | 'markdown'
  version: string
}
```

## Prompts Spécialisés à Associer

Chaque template doit fournir des prompts courts et versionnés:

- Analyste RAG: extraire faits, prix, dates, limites et contradictions.
- PMM métier: transformer les faits en bénéfices et angle commercial.
- Pricing: vérifier canal, comparabilité, hypothèses et données manquantes.
- Rédacteur: produire le contenu dans les sections du template.
- Designer PDF: respecter la structure visuelle et la densité.
- QA anti-hallucination: bloquer les claims non sourcés.

## Source Health

Avant production, Hermes doit évaluer les sources:

| Contrôle | Règle |
| --- | --- |
| Présence source produit | obligatoire |
| Présence source pricing | obligatoire si prix affiché |
| Fraîcheur pricing | signaler si date absente ou ancienne |
| Canal | direct / ambassadeur / opérateur ne doivent pas être mélangés |
| Statut document | actif prioritaire, brouillon signalé, obsolète bloqué |
| Contradictions | remonter avant production |

## Architecture Recommandée

### Court Terme

Implémenter dans Hermes Workspace:

- registre templates JSONL;
- page `Templates`;
- rattachement projet -> template;
- génération d'un brief de mission IA depuis template + projet;
- affichage des sources manquantes.

### Moyen Terme

Brancher:

- RAG Documents Dstny;
- PDF Engine;
- rendu HTML/React vers PDF;
- historique des versions produites.

### Long Terme

Permettre:

- génération depuis chat;
- génération multi-canal;
- bibliothèque de templates validés;
- production en lot sur catalogue produit;
- revue humaine avant publication.

## Choix Outils

### À privilégier au départ

- Templates métier dans Hermes Workspace.
- Rendu HTML/React ou HTML/Tailwind maîtrisé.
- Conversion PDF via PDF Engine / Gotenberg selon stabilité.

### À explorer, pas intégrer tout de suite

- pdfme: intéressant pour un designer WYSIWYG de PDF.
- Presenton: intéressant pour slides/PPTX, moins prioritaire pour fiches produit.
- Gotenberg: bon moteur de conversion, pas une bibliothèque métier.

## Lots d'Implémentation

### Lot 1 - Template Registry

Créer:

- stockage templates;
- CRUD minimal;
- 4 templates fiche produit;
- page `Templates`;
- statut et version.

Critères d'acceptation:

- Xavier peut voir les templates disponibles;
- chaque template affiche sections, sources obligatoires et règles qualité;
- un template peut être marqué `validé`.

### Lot 2 - Rattachement Projet -> Template

Créer:

- champ template dans projet;
- sélection du template à la création;
- mise à jour du plan IA selon template;
- alerte si aucun template.

Critères d'acceptation:

- un projet fiche produit Connectivité utilise un template précis;
- le plan IA dépend du template, pas de tags approximatifs.

### Lot 3 - Mission IA

Créer:

- bouton `Préparer la mission IA`;
- génération d'un brief agents structuré;
- sections attendues;
- sources obligatoires;
- règles anti-hallucination.

Critères d'acceptation:

- le brief est utilisable dans Hermes sans réexpliquer le contexte;
- il bloque ou alerte si source pricing manquante.

### Lot 4 - Source Health

Créer:

- lecture des métadonnées documents;
- fraîcheur;
- statut;
- confiance;
- conflits.

Critères d'acceptation:

- une source obsolète est visible;
- un prix sans source validée est bloqué ou signalé.

### Lot 5 - Production PDF

Créer:

- génération Markdown structuré;
- rendu HTML;
- export PDF;
- rattachement automatique de l'artefact;
- versioning.

Critères d'acceptation:

- un PDF v0.1 est généré depuis template + sources;
- les sources et hypothèses sont visibles;
- une nouvelle version ne remplace pas silencieusement l'ancienne.

## Risques

| Risque | Mitigation |
| --- | --- |
| Interface trop complexe | masquer la technique derrière templates et pré-vol |
| Rôles IA décoratifs | associer chaque rôle à un prompt versionné |
| Hallucination | QA obligatoire + citations + blocage prix non sourcé |
| Templates trop rigides | variantes par canal et famille produit |
| Explosion scope PDF | commencer par Markdown + HTML simple avant designer avancé |
| Dépendance outil externe | garder les templates métier dans Hermes |

## Prochaine Décision

Valider que le prochain sprint est:

```text
Lot 1 - Template Registry + premiers templates fiche produit
```

et non:

```text
Production directe d'un PDF Connectivité.
```
