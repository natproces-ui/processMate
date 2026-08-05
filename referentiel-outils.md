# Référentiel d'outils — écrans, champs, codes

Contexte : suite de `synchronise.md` (fait — le tableau et le diagramme ne divergent
plus). Ce fichier couvre le chantier d'origine que la synchro a débloqué : au lieu d'un
champ `outil` en texte libre par étape (`Table1Row.outil`), un vrai référentiel central
d'outils (Nov@, TI+, email, e-trade…), chacun avec ses écrans, les champs de chaque écran,
et des codes (transaction, produit/référence, erreur/retour). Sélection par un picker
chercher-ou-créer, comme celui des personnes dans le RACI (`RACIMatrix.tsx`).

Décisions déjà prises (ne pas rouvrir sans raison) :
- `outil` reste **uniquement** dans le Tableau 1 (`Table1Row.outil`) — c'est la source
  unique. Le Tableau 2 (Détails) ne duplique pas ce champ ; il **lit** l'outil déjà choisi
  en Tableau 1 et affiche ses écrans/codes en conséquence.
- Écrans, champs et codes sont rattachés à **l'outil** (référentiel central), pas à
  l'étape — une étape ne fait que sélectionner lesquels s'appliquent à elle.
- Tableau 2 : retirer KPI et Fréquence, garder Descriptif, ajouter la section
  Écrans/Codes dérivée de l'outil, ajouter Données en entrée/sortie de l'étape.
- Extraction des champs d'un écran assistée par IA (bouton), pas de saisie 100% manuelle
  imposée — corrigeable à la main ensuite.
- Le pattern technique pour ça existe déjà dans le code : `clinic/processor/img_processor.py`
  fait déjà de l'extraction structurée depuis une image via Gemini vision
  (`model.generate_content(contents=[prompt, image])`), avec un prompt spécialisé selon
  le type d'image (`get_logic_swimlanes()`, etc.) — même technique à réutiliser avec un
  nouveau prompt "extraire les champs d'un écran d'application", pas une nouvelle
  intégration IA à inventer.
- Aligner la structure écrans/champs sur ce qu'attend déjà le SFD (`clinic/sfd/schema.py`
  — `InterfaceUI`/`ElementUI`) : aujourd'hui `interfaces_ui` dans la génération SFD
  (`clinic/sfd/generation.py:268`) est un gabarit vide que l'IA remplit en devinant à
  chaque génération. Si le référentiel capture les vrais écrans/champs, la génération SFD
  peut consommer ces données réelles au lieu de les réinventer — bénéfice croisé, pas
  juste une coïncidence de vocabulaire.

Deux décisions tranchées après coup :
- Les codes (transaction/produit/erreur) sont un **catalogue par outil**, pas une valeur
  saisie par étape — consultables depuis n'importe quelle étape qui utilise l'outil,
  comme les écrans/champs.
- Le référentiel est **unique à toute la plateforme**, pas propre à chaque procédure —
  cohérent avec la Cartographie applicative, qui compte déjà les mêmes outils à travers
  toutes les procédures.

Décision encore ouverte, à trancher avant ou pendant l'implémentation :
- Faut-il chiffrer/traiter la fragmentation existante de `outil` (6 clés synonymes
  trouvées dans `ComplexityPanel.tsx:153-161` : `outil`, `outils`, `applicatif`,
  `application`, `systeme`, `système`) avant de lancer le référentiel, ou en parallèle ?
  Nécessite un accès aux données réelles de Supabase pour en mesurer l'ampleur — pas
  faisable depuis le code seul.

---

## Prompt 1 — Schéma Supabase du référentiel

Aujourd'hui, aucune table dédiée n'existe : tout est dans `workflows.workflow_json`/
`enrichments_json` (jsonb). Créer les tables (nouveau fichier SQL, même convention que
`scripts/orchestration_tasks_schema.sql` — commentaire "draft, not applied
automatically" en tête, migration réelle à appliquer manuellement dans Supabase) :

- `tools` — id (uuid), name (text, unique), color (text, optionnel — reprendre la
  palette déjà utilisée dans `ApplicatifsPanel.tsx`/`GrapheApplicatifs.tsx` pour Nov@,
  TI+, etc. plutôt que d'en inventer une nouvelle), created_at.
- `tool_screens` — id, tool_id (FK), name, screenshot_url (text, nullable), description,
  created_at. Le stockage de l'image : identifier l'endpoint d'upload déjà utilisé par
  `procedure_task_attachments.file_url` (existant, colonne `file_url text` dans
  `scripts/orchestration_tasks_schema.sql`) et le réutiliser plutôt qu'en créer un
  nouveau — je n'ai pas retrouvé cet endpoint précisément dans le code exploré jusqu'ici,
  à localiser avant d'écrire ce prompt pour de vrai.
- `tool_screen_fields` — id, screen_id (FK), name, type (text libre ou enum court :
  texte/nombre/date/liste), required (bool), example_value (text, nullable).
- `tool_codes` — id, tool_id (FK), type (`transaction` | `produit` | `erreur`), code
  (text), description. Catalogue par outil, pas de lien à une étape précise.

Pas de RLS/policies à deviner ici — copier le pattern déjà en place sur les tables
`procedure_*` existantes (`clinic/database/*.sql`) plutôt qu'en inventer un nouveau.

---

## Prompt 2 — Endpoints backend (FastAPI)

Nouveau routeur, `clinic/routers/tools_router.py`, même style que
`orchestration_tasks_router.py` :
- `GET /api/tools?q=` — recherche (pour le picker chercher-ou-créer), retourne
  id/name/color, limité (~20) comme `listUsers`.
- `POST /api/tools` — création (`{name}` minimum).
- `GET /api/tools/{id}` — détail avec écrans + champs + codes.
- `POST /api/tools/{id}/screens` — ajoute un écran (avec upload de capture — voir la
  question de stockage au Prompt 1).
- `POST /api/tools/screens/{id}/extract-fields` — lance l'extraction IA : réutilise le
  pattern de `img_processor.py` (prompt + image → Gemini), avec un nouveau prompt dédié
  (`clinic/prompts/` — suivre la convention des fichiers `logic_*.py`/`*_prompt.py`
  existants plutôt que d'écrire le prompt inline dans le routeur). Retourne une liste de
  champs proposés, à confirmer/corriger côté frontend avant sauvegarde — jamais
  sauvegardés automatiquement sans passage par l'utilisateur.
- `PUT`/`DELETE` sur écrans/champs/codes pour l'édition manuelle après extraction IA.

---

## Prompt 3 — Client API frontend

`frontend/src/lib/toolsApi.ts`, même forme que `orchestrationApi.ts` (`fetchJSON`,
signatures similaires à `listUsers`/`getProcedure`). Types `Tool`, `ToolScreen`,
`ToolScreenField`, `ToolCode` en miroir du schéma Prompt 1.

---

## Prompt 4 — Picker chercher-ou-créer, branché à la source unique

Deux points d'entrée à corriger, tous les deux vers le **même** composant de picker
(nouveau, ex. `frontend/src/components/orchestration/ToolPicker.tsx`) :

1. **Tableau 1** — `ProcessTable.tsx`, colonne OUTIL (actuellement un `<input type="text">`
   brut, ~ligne 396-403) : remplacer par le picker. C'est la modification qui compte le
   plus, puisque `outil` doit rester la source unique.
2. **Canevas — fait pour le drag-and-drop, pas pour la palette.** Deux chemins créent
   un shape `Tool_` dans `BpmnEditor.tsx`, avec des risques différents :
   - `onDrop` (glisser depuis `Library.tsx`, ~ligne 735) — HTML5 drag-and-drop natif,
     pas de geste interactif bpmn-js en cours à ce moment. Modifié : `window.prompt()`
     pour le nom, résolu via `toolsApi.createOrGet` (dédoublonné côté backend), *avant*
     la création du shape. Vérifié par diff `tsc` avant/après sur tout le projet :
     aucune erreur nouvelle.
   - `PaletteOutil.createTool` (icône "Outil" de la palette, clic ou dragstart,
     ~lignes 403-462) — **non modifié, volontairement.** Ce chemin utilise
     `create.start(event, shape)`, le mode interactif de bpmn-js où la forme suit le
     curseur jusqu'au clic de pose. Intercaler un `prompt()` (bloquant) avant cet appel
     casserait le geste (le drag est déjà entamé au moment de l'event) ; le faire après
     coup demanderait d'accrocher un event de fin de création (`create.end` ou
     équivalent) jamais testé dans ce fichier — contrairement à `connection.added`
     (`ToolConnectionBehavior`, déjà utilisé et fiable). Risque de casser un geste qui
     marche aujourd'hui pour un gain non vérifiable sans navigateur réel : laissé de
     côté. Résultat pratique : l'icône de la palette crée encore un "Outil" générique à
     renommer à la main (comme avant) ; le glisser-déposer depuis `Library.tsx`, lui,
     passe par le référentiel. À reprendre avec un test manuel en navigateur avant de
     toucher au chemin palette.

---

## Prompt 5 — Tableau 2 : retirer Fréquence/KPI (fait) — section Écrans/Codes (pas fait)

**Fait et vérifié** (diff `tsc` avant/après, aucune erreur nouvelle) : les champs
Fréquence et KPI retirés du formulaire (`DetailModal.tsx`) et des colonnes du tableau
récapitulatif (`ProcessTable.tsx`). Descriptif et Durée estimée gardés — seuls
Fréquence/KPI avaient été explicitement demandés à retirer, Durée estimée n'a jamais été
mentionnée pour suppression, donc conservée par prudence plutôt que devinée. Non
destructif : `TaskEnrichment` garde `frequence`/`kpi` dans son type, une procédure
existante qui avait déjà ces valeurs les conserve en base, seule l'UI ne les affiche/
édite plus.

**Pas fait — la section Écrans/Codes dérivée de l'outil.** Volontairement laissée de
côté plutôt que construite à l'aveugle, pour deux raisons concrètes :
1. Elle suppose de pouvoir déjà peupler le référentiel (ajouter un écran avec sa
   capture, lancer l'extraction IA, éditer les champs proposés) — cette gestion n'a pas
   sa propre interface pour l'instant. `tools_router.py`/`toolsApi.ts` exposent déjà
   tous les endpoints nécessaires (`addScreen`, `extractFields`, `addField`,
   `addCode`...), il manque l'écran qui les assemble. Plus naturel comme une page
   "fiche outil" dédiée que comme un ajout dans la modale par étape.
2. "Cocher les écrans pertinents pour cette étape" suppose un nouvel endroit où stocker
   ce choix (`TaskEnrichment` n'a pas de champ pour ça aujourd'hui) — pas tranché pour
   ne pas improviser un champ de plus sans relecture.

Prochaine étape concrète, dans cet ordre : (a) une page/panneau "Fiche outil" pour
gérer écrans/champs/codes d'un outil du référentiel (dont le bouton d'extraction IA —
`toolsApi.extractFields` existe déjà côté client, juste pas de bouton), (b) une fois ça
navigable, revenir sur le Tableau 2 pour la sélection des écrans pertinents par étape.

---

## Prompt 6 — Migration des données existantes

À ne traiter qu'après avoir mesuré l'ampleur réelle (question ouverte en tête de
fichier — nécessite un accès direct à Supabase, pas seulement au code). Une fois
mesurée : script de rapprochement des 6 clés synonymes vers des entrées `tools`
(dédoublonnage approximatif par nom, ex. "TI+"/"TIPLUS" → un seul `tools.id`), avec une
liste de correspondances incertaines à valider à la main plutôt qu'un rapprochement
automatique aveugle.

---

## Ordre d'exécution proposé

Prompt 1 → 2 → 3 (fondations, rien de visible côté utilisateur) → 4 (le picker, le
changement le plus visible) → 5 (Tableau 2) → 6 (migration, séparée, après mesure des
données réelles). Le Prompt 7 (bouton IA d'extraction) fait partie du Prompt 2
(l'endpoint) et du Prompt 5 (le bouton dans l'UI) — pas une étape à part.
