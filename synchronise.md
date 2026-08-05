# Synchronise — Tableau ↔ Diagramme BPMN (BPMN Studio / new-way)

Contexte : dans le BPMN Studio (`frontend/src/app/stt/page.tsx` via `SttPanel.tsx`) et dans
`ProcedureEditor.tsx`, le diagramme (moteur `new-way/BpmnEditor.tsx` + `new-way/Library.tsx`)
et le tableau (`ProcessTable.tsx`, données `Table1Row[]`) sont **deux vues qui ne se
synchronisent que dans un sens** : le tableau régénère le diagramme
(`generateBPMNSimple` dans `bpmnGeneratorSimple.ts`), mais rien ne relit le diagramme pour
mettre à jour le tableau. Toute tâche, tout outil (`Tool_...`), tout lien créé à la main sur
le canevas est donc invisible au tableau, à la Cartographie applicative
(`ApplicatifsPanel.tsx`, `GrapheApplicatifs.tsx`, `GrapheLiaisons.tsx`) et au score de
complexité (`ComplexityPanel.tsx`).

Décisions déjà prises (ne pas rouvrir sans raison) :
- On construit un **parseur** BPMN → `Table1Row[]`, pas des crochets événementiels épars.
- Le parseur et la réduction de croisements du layout partagent **un même modèle de
  graphe interne** (nœuds + rangs + lanes) plutôt que deux logiques isolées.
- Rien ne doit être détruit : tout id existant doit être préservé, et les `enrichments`
  (`TaskEnrichment`, clé = id de ligne) doivent suivre — le mécanisme existe déjà pour le
  drag-and-drop et la suppression de ligne dans `ProcessTable.tsx` (`renumberRows`,
  lignes 51-66 ; remap des enrichments lignes 146-163 et 217-231) : le réutiliser, pas le
  réinventer.
- La règle de positionnement gauche/droite des lanes externes est **hors scope** ici —
  traitée séparément plus tard.
- Le référentiel d'outils (écrans, paramètres, picker chercher-ou-créer) et la
  normalisation des synonymes `outil`/`outils`/`applicatif`/`application`/`systeme`/
  `système` (voir `ComplexityPanel.tsx:153-161`) sont **hors scope** de ce fichier — chantier
  séparé, à traiter après celui-ci.

Ordre d'exécution : Prompt 1 → Prompt 2 → Prompt 3, dans cet ordre (chacun dépend du
précédent). Le Prompt 4 (layout) peut être fait après ou en parallèle une fois le Prompt 1
posé — il consomme le même modèle de graphe mais ne dépend pas du parseur.

---

## Prompt 1 — Modèle de graphe partagé (rangs + lanes)

Dans `frontend/src/logic/bpmnGeneratorSimple.ts`, la génération du diagramme calcule déjà
un tri topologique et des rangs (`topoSort`, `computeRanks`, autour des lignes 304-312) et
un assignage de lanes par ordre d'apparition (lignes 437-441, voir aussi `laneId()` ligne
81-82 pour la convention `Lane_ext_`/`Lane_int_`). Cette logique est bonne mais enfouie dans
un générateur à sens unique (table → XML).

Tâche : extraire cette logique dans un nouveau module partagé, par exemple
`frontend/src/logic/bpmnGraphModel.ts`, qui expose une structure de graphe réutilisable :
- Construction du graphe à partir de `Table1Row[]` (nœuds, arêtes via `outputs[].targetId`,
  lane par `acteur`/`typeActeur`).
- Calcul des rangs (réutiliser `topoSort`/`computeRanks` tels quels, juste déplacés/exportés).
- Une fonction inverse minimale : étant donné une liste de nœuds avec leurs rangs et lanes
  (peu importe leur origine — table ou diagramme lu), produire un ordre linéaire stable,
  avec un départage explicite pour les branches parallèles de même rang (proposition : trier
  par position X sur le canevas si elle est connue, sinon par ordre de lane). Ce départage
  est utilisé par le Prompt 2.

Contrainte : ne pas changer le comportement actuel de `generateBPMNSimple` — c'est un
refactor d'extraction, pas une réécriture. Vérifier après coup que le Studio génère un
diagramme identique à l'avant sur un cas existant.

---

## Prompt 2 — Parseur BPMN → `Table1Row[]`

Créer `frontend/src/logic/bpmnParser.ts`. Il prend en entrée une instance de modeler
bpmn-js déjà chargée (celle exposée par `BpmnEditor.tsx` via `onModelerReady`, voir son
usage dans `SttPanel.tsx` ligne ~731 `modelerRef.current`) et produit `{ rows: Table1Row[],
enrichments: Map<string, TaskEnrichment>, idMap: Map<string,string> }`.

Ne pas parser le XML en texte/regex : bpmn-js expose déjà les objets structurés.
Utiliser `modeler.get('elementRegistry')` pour lister tous les éléments
(`elementRegistry.getAll()`) et lire leurs `businessObject` (nom, type, lanes parentes),
et `modeler.get('moddle')` si besoin de relire des propriétés custom. C'est l'API que
`BpmnEditor.tsx` utilise déjà pour créer les shapes `Tool_` et les associations
(voir `PaletteOutil`/`createTool` lignes ~403-462 et `ToolConnectionBehavior` ~524+) —
rester cohérent avec cette API plutôt que d'en introduire une autre.

Étapes du parseur :
1. Lister les éléments de flux (Task/UserTask/ServiceTask non-`Tool_`/StartEvent/EndEvent/
   Gateway) et leurs `sequenceFlow` sortants → reconstruire `outputs[]`.
2. Pour chaque tâche, retrouver son lien vers un outil : chercher les `bpmn:Association`
   dont la cible est un shape dont l'id commence par `Tool_` (même convention que
   `BpmnEditor.tsx:144-147`), lire le `name` du business object du `Tool_` → `outil`.
   Une tâche liée à plusieurs outils : lister le cas dans les logs, décider (au moment de
   l'implémentation) si `outil` reste un champ unique (garder le premier, avertir) ou
   devient une liste — **ne pas trancher silencieusement**, remonter l'info à l'utilisateur.
3. Pour chaque tâche, retrouver sa lane parente → `acteur` (nom de la lane) et
   `typeActeur` (`interne`/`externe` selon le préfixe `Lane_int_`/`Lane_ext_`).
4. Ordonner les lignes avec le modèle de graphe du Prompt 1 (rangs + départage).
5. Préservation des ids : les shapes générés depuis une ligne existante portent déjà l'id
   de la ligne dans leur id d'élément (voir `toolId()`/`elementId()` dans
   `bpmnGeneratorSimple.ts`). Pour tout élément dont l'id correspond déjà à une ligne
   connue, garder cet id. Pour un élément réellement nouveau (créé à la main sur le
   canevas, id généré par bpmn-js), lui assigner un nouvel id séquentiel via le même
   principe que `renumberRows` (`ProcessTable.tsx:51-66`), et construire `idMap`
   (ancien id bpmn-js → nouvel id de ligne) pour que l'appelant puisse remapper les
   `enrichments` exactement comme le fait déjà `handleDrop`/`handleDeleteRow`
   (`ProcessTable.tsx:146-163`, `217-231`).
6. Cas limites à gérer explicitement, pas à ignorer : élément sans lane (rattacher à une
   lane par défaut + avertir), élément déconnecté du flux principal (l'ajouter en fin de
   liste avec un avertissement plutôt que le faire disparaître silencieusement).

Non-objectif : ce parseur n'a pas besoin de gérer un BPMN importé de l'extérieur avec une
structure quelconque (pools multiples exotiques, etc.) — seulement les diagrammes produits
ou édités depuis ce Studio.

---

## Prompt 3 — Brancher le parseur : sauvegarde et bouton Synchroniser

Dans `SttPanel.tsx` et `ProcedureEditor.tsx` :

1. **À la sauvegarde** (`handleSave`, `SttPanel.tsx` lignes 327-355) : avant d'appeler
   `orchestrationApi.saveWorkflowData(...)`, si le diagramme a été modifié directement sur
   le canevas depuis le dernier chargement (piste : comparer `currentXml` récupéré via
   `editorRefs.current[activeTab]?.saveXml()` au XML de référence), lancer le parseur du
   Prompt 2 sur l'instance modeler courante, fusionner son résultat dans `Table1Row[]` et
   `enrichments` via `idMap` avant de construire le payload à sauvegarder. Objectif : après
   cette étape, `workflow_json` ne peut plus diverger durablement du XML sauvegardé
   (`enrichments_json.__bpmn_xml__`, voir `clinic/routers/orchestration_router.py` autour
   de la ligne 798).

2. **Bouton "Synchroniser"** : ajouter un bouton dans la barre d'outils du Studio
   (`SttPanel.tsx`, à côté du bouton "Enregistrer" ligne ~706) qui déclenche le même
   parseur à la demande, **sans attendre la sauvegarde**. Avant d'appliquer le résultat,
   afficher un résumé des changements détectés (ex. "3 nouvelles étapes détectées depuis le
   diagramme, 2 outils mis à jour") et laisser l'utilisateur confirmer — ne jamais écraser
   silencieusement le tableau. C'est la réponse directe à la consigne "il faut veiller à ne
   rien détruire".

3. **À l'ouverture** : le sens table → diagramme (`generateBPMNSimple`) reste inchangé.
   Ne pas ajouter de parsing systématique au chargement sauf si on constate, après (1) et
   (2), que `workflow_json` et `enrichments_json.__bpmn_xml__` peuvent encore diverger dans
   un cas réel (ex. XML importé manuellement) — dans ce cas, ajouter un contrôle de
   cohérence léger au chargement plutôt qu'un parsing systématique coûteux.

---

## Prompt 4 — Layout : réduire les croisements

Objectif : les diagrammes générés par `bpmnGeneratorSimple.ts` placent aujourd'hui les
nœuds au premier emplacement libre dans l'ordre d'apparition des données
(`firstFreeY`/`isSlotFreeForNode`/`markOccupied`, lignes ~331-359) — sans tenir compte des
connexions, ce qui produit des croisements de flèches évitables ("enjambements").

**Étape 0 — FAIT, résultat net.** Testé directement `layoutProcess` de `bpmn-auto-layout`
v1.0.1 (hors de `bpmnAutoLayoutWrapper.ts` — ce wrapper appelle en réalité
`bpmnLogicGenerator.ts`/`BPMNLogicGenerator`, un générateur encore plus ancien qui
attend `row.outputOui`/`row.outputNon`, incompatible avec le `Table1Row.outputs[]`
réellement utilisé aujourd'hui — un deuxième problème indépendant du premier).

Deux essais isolés, avec Node (`--experimental-strip-types`, aucune dépendance ajoutée) :
1. Process simple, sans lane : `layoutProcess` fonctionne bien — positions correctes,
   séquence linéaire propre.
2. Même structure, avec `<collaboration>`/`<participant>`/`<laneSet>` (3 lanes, un
   gateway split, un outil associé — représentatif d'un vrai diagramme processMate) :
   `layoutProcess` retourne un XML "réussi" (pas d'exception) mais **le `<process>` est
   vide** — tous les tasks, gateways, flows, outils et associations ont disparu ; seules
   les balises `<lane>` vides survivent.

Conclusion actionnable, plus tranchée que prévu : ce n'est pas "mauvais positionnement
multi-lanes", c'est une **perte de données totale** dès qu'il y a un `laneSet` — et 100%
des diagrammes processMate en ont un. `bpmn-auto-layout` est à écarter purement et
simplement pour ce projet, pas seulement à corriger. Pas besoin de relancer le test avant
de passer à elkjs.

**elkjs — testé en isolation (scratchpad, rien installé dans le projet), écarté.**
L'hypothèse de départ était : laisser elkjs faire la minimisation de croisements, à
condition qu'il respecte nos lanes comme des colonnes fixes (l'acteur d'une étape ne
doit jamais changer de position X, seule sa position Y dans sa lane est négociable).
Deux configurations testées avec un graphe représentatif (3 lanes, gateway split, boucle
arrière — le même scénario que le test bpmn-auto-layout) :
1. `elk.partitioning.partition` par lane, direction `DOWN` → la lane censée être fixe
   dérive d'un rang à l'autre (`FrontOffice: x = 45, 29, 12, 132` selon le rang) :
   partitioning ne pin pas une colonne, il influence juste l'ordre relatif.
2. `elk.layered.layering.layerId` par lane + `layering.strategy: INTERACTIVE`, direction
   `RIGHT` (cette fois lane = layer ELK, en théorie fixable) → chaque nœud reçoit sa
   propre colonne, `layerId` n'a pas du tout groupé les nœuds d'une même lane ensemble.

Recherché ensuite si c'était une erreur de configuration de notre part : un ticket ouvert
sur le dépôt elkjs, intitulé littéralement *"layer constraints not respected"*
([kieler/elkjs#327](https://github.com/kieler/elkjs/issues/327)), et un autre demandant
depuis longtemps des exemples fonctionnels du mode interactif
([kieler/elkjs#124](https://github.com/kieler/elkjs/issues/124)) — ce n'est pas notre
erreur de configuration, c'est un point faible connu et non documenté correctement de la
librairie, exactement sur le cas qu'on doit utiliser.

**Décision : ne pas installer elkjs.** L'algorithme de crossing-minimization d'elkjs est
réel et fonctionne bien pour un layout libre, mais notre contrainte (lanes = colonnes
strictement fixes) n'est pas ce pour quoi cette API est conçue, et la faire respecter
demanderait de se battre contre une zone mal documentée de la librairie plutôt que
d'obtenir un gain net. Ni `bpmn-auto-layout` (Étape 0, perte de données sur multi-lanes)
ni elkjs ne conviennent tels quels.

**Barycentre Y intra-lane — testé (script `generateBPMNSimple` réel, scénario 3 lanes +
split + boucle), recalibré à la baisse.** `firstFreeY` ne s'est jamais déclenché sur ce
cas : chaque nœud obtient directement son créneau naturel, il n'y a rien à choisir la
plupart du temps. Ce mécanisme n'aide que dans le cas assez rare où plusieurs nœuds se
disputent le même rang dans la même lane (hors mécanisme de split déjà géré) — pas la
source principale de gêne visuelle rapportée.

**Le vrai sujet, identifié en discussion : l'ordre des lanes, pas la position des
nœuds.** `bpmnGeneratorSimple.ts` ordonne les lanes par simple ordre d'apparition dans
les données (`// Ordre des acteurs`, ~ligne 437) — aucune notion de "qui parle à qui".
Résultat : deux lanes très connectées peuvent se retrouver éloignées, avec une lane sans
rapport entre les deux, ce qui allonge inutilement chaque lien entre elles. C'est un
problème d'ordre (arrangement linéaire pondéré par le nombre de liens entre chaque paire
de lanes), pas de positionnement. Vu le petit nombre de lanes par procédure, une recherche
exhaustive sur les permutations (garantie optimale, pas une heuristique) est réaliste.
Ça recoupe naturellement la règle gauche/droite des lanes externes, laissée de côté
jusqu'ici : dans ce cadre, ce serait juste une contrainte du même calcul (lanes externes
fixées à une extrémité, ordre optimisé pour les lanes internes entre elles) plutôt qu'un
chantier séparé.

**Statut : mis de côté pour l'instant, priorité donnée à la synchro (Prompts 1-3).**
Rien de ce chantier layout n'est implémenté — ni le barycentre Y (recalibré, peu
prioritaire), ni le réordonnancement des lanes (la vraie piste, pas encore commencée). À
reprendre ici quand ce sera le moment, sans repartir de zéro sur l'analyse.

---

## Versions confirmées dans ce projet (`frontend/package.json`)

`bpmn-js` ^18.8.0, `bpmn-moddle` ^9.0.4, `bpmn-js-create-append-anything` ^1.2.0 (déjà
utilisé dans `BpmnEditor.tsx`), `bpmn-auto-layout` ^1.0.1 (installé, wrappé, jamais
appelé), `dagre` ^0.8.5 (installé, jamais importé).

## Sources consultées pour ce fichier

- [elkjs — ELK's layout algorithms for JavaScript](https://github.com/kieler/elkjs)
- [Crossing Minimization Strategy (ELK)](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-strategy.html)
- [Semi-Interactive Crossing Minimization (ELK)](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html)
- [bpmn-js walkthrough — bpmn.io](https://bpmn.io/toolkit/bpmn-js/walkthrough/)
- [bpmn-io/bpmn-js — DeepWiki](https://deepwiki.com/bpmn-io/bpmn-js)
- [bpmn-elk-layout — npm/jsDelivr](https://www.jsdelivr.com/package/npm/bpmn-elk-layout) (non vérifié en profondeur — à évaluer avant usage)
