# Consignes de l'IA — inventaire, contradictions, glossaire

État au 21/11/2026. Ce document prépare le « cerveau unique » : rien n'est encore branché.
Ordre de lecture : **2. Contradictions à trancher** (ce qui t'est demandé), puis 3 (glossaire proposé), puis 1 (inventaire).

---

## 1. Inventaire

**27 consignes** : 20 fichiers dans `clinic/prompts/` et 7 écrites directement dans le code.
« Utilisée » = appelée par un écran réellement utilisé aujourd'hui (vérifié route par route dans l'interface).

### Chat (le cœur)

| Consigne | Rôle | Statut |
|---|---|---|
| `studio_planner_prompt` | Aiguillage : comprendre la demande, choisir l'action | Utilisée |
| `intent_prompt` | Second aiguillage (ancien), appelé ensuite par le chat | Utilisée — **à fusionner dans l'aiguillage** |
| `extract_prompt` (611 lignes) | Rédiger une procédure : étapes, acteurs, outils, décisions, descriptions, métadonnées | Utilisée |
| `logic_swimlane`, `logic_no_lanes`, `logic_manuscript`, `logic_document`, `logic_document_image` | Lire une source selon son type (logigramme à couloirs, sans couloirs, manuscrit, document, document + image) | Utilisées |
| `pdf_classifier`, `image_classifier` | Choisir le mode de lecture d'une source | Utilisées |
| `transcribe_prompt` | Transcription fidèle, sans reformulation | Utilisée |
| `revision_prompt` | Modifier une procédure (opérations) | Utilisée par 3 circuits : chat, révision par instruction, Révision IA de Mon espace |
| `studio_remarks_prompt` | Relecture après rédaction | Utilisée |
| `MERGE_RULES` (code) | Fusionner des procédures | Utilisée |
| `ANALYSIS_PROMPT` (code) | Analyser / répondre sur les sources | Utilisée |
| `EXPLAIN_SYSTEM_PROMPT` (code) | Expliquer une procédure | Utilisée |
| `STRUCTURE_PROMPT` (code) | Proposer un référentiel | Utilisée |
| `REFERENCE_ANALYSIS_PROMPT` (code) | Lire un fichier « modèle de style » | Utilisée |
| `NARRATION_PROMPT` (code) | Suivi « ce que fait l'assistant » | Utilisée |
| `open_points_prompt` | Points ouverts après rédaction | **Dormante** (réglage `OPEN_POINTS_ENABLED`, coupé par défaut) |

### Autres écrans

| Consigne | Rôle | Statut |
|---|---|---|
| Consignes des irritants (code, `irritants_processor`) | Détecter, analyser, approfondir les irritants | Utilisées (écran Analyse) |
| Consignes de l'Analyse IA (`analysis_processor`) | Chat d'analyse séparé | Utilisées (écran Analyse IA) |
| `discovery_prompt` | Repérer les procédures d'un document (ancien) | Utilisée par le Studio complet — **définition d'une procédure différente du chat** |
| `discovery_code_prompt` | Repérer les procédures dans du code | Utilisée (Studio complet, code) |
| `tool_screen_extraction_prompt` | Lire un écran d'application | Utilisée (outils) |
| `interface_prompt` | Regrouper les interfaces par système | Route non appelée par l'interface — **probablement morte** |
| `enhance_prompt`, `verify_prompt` | Améliorer / vérifier un logigramme lu depuis une image | Routes `img-to-bpmn` non appelées par l'interface — **probablement mortes** |
| `SYSTEM_PROMPT` (`bpmn_ai`), `PROMPT_TEMPLATE` (`dot_to_table`) | Enrichir un tableau, convertir un graphe | Routes non appelées ou anciennes — **probablement mortes** |

« Probablement morte » sera confirmé avant suppression (le projet a beaucoup de chemins parallèles).

---

## 2. Contradictions à trancher

Pour chacune : ce que disent les consignes, pourquoi ça gêne, ma recommandation. **Tu tranches** ; je reporte ta décision dans le glossaire.

Deux modes de travail expliquent une partie des écarts, et ils sont légitimes : **formaliser** (on corrige, on reformule, on structure) et **transcrire** (on recopie fidèlement). Le glossaire les nommera explicitement au lieu de les laisser implicites.

### C1. Acteurs externes : déduits du contexte, ou seulement visibles ?
- `extract_prompt` : inclure **tous** les acteurs externes, « même sans couloir, identifiés par le contexte ».
- `transcribe_prompt` : **uniquement s'il est visible** dans la source, ne jamais en créer.
- **Gêne** : en formalisation, le modèle ajoute des acteurs externes « devinés » → forêt d'acteurs.
- **Recommandation** : formaliser → un acteur externe figure s'il **intervient réellement dans la source** (il envoie, reçoit, demande), même sans couloir dessiné ; jamais d'acteur qui n'est mentionné nulle part. Transcrire → seulement ceux qui sont visibles.

### C2. Granularité des acteurs (« forêt d'acteurs ») — règle absente
- Aucune consigne ne demande de regrouper. `extract_prompt` dit au contraire « copie EXACTEMENT l'en-tête du couloir ».
- **Gêne** : ta demande récurrente n'existe nulle part ; elle ne passe que si tu la tapes.
- **Recommandation** : en formalisation, l'acteur est **la fonction ou le service responsable** (« Agence », « Back-office Épargne », « Comptabilité formation »), pas une personne ni un intitulé de poste ; les variantes d'un même service sont fusionnées (« Middle Office », « MO », « CAE/Middle Office » → un seul) ; un acteur n'est créé que s'il porte au moins une tâche. En transcription : en-têtes exacts.
- **Question pour toi** : le bon niveau d'acteur, c'est le **service** (Comptabilité formation) ou la **fonction** (Gestionnaire formation) ?

### C3. Département et acteur
- `extract_prompt` : le département est « déduit de l'acteur » (« CAE/Middle Office » → « Middle Office »).
- **Gêne** : deux champs qui disent presque la même chose ; le logigramme fait ses couloirs sur l'un, la fiche sur l'autre.
- **Recommandation** : **département = entité de l'organisation** (le couloir du logigramme) ; **acteur = rôle dans cette entité**. Quand la source ne distingue pas, les deux portent la même valeur.

### C4. Description d'étape obligatoire, ou ne rien inventer ?
- `extract_prompt` ligne 16 : « ne jamais inventer, laisser vide ». Ligne 403 : « description **obligatoire** pour toutes les tâches, ne jamais laisser vide ».
- **Gêne** : quand la source ne décrit pas une tâche, la règle oblige à inventer (outil, délai, contrôle qui n'existent pas).
- **Recommandation** : description obligatoire, mais **fondée sur la source et le libellé** ; si la source n'en dit pas plus, une phrase courte qui reformule l'étape **sans ajouter de fait** (ni outil, ni délai, ni règle) — et un point ouvert « à préciser » plutôt qu'une invention.

### C5. Jusqu'où déduire ?
- `extract_prompt` : « jamais inventer » ; mais aussi « si absent, inférer depuis le contexte métier », « déduis la signification des abréviations », « déduis un titre ».
- **Recommandation** — une règle unique :
  - **permis de déduire** : le titre, la nature interne/externe d'un acteur, la signification d'une abréviation (marquée « déduit »), l'objet et le périmètre de la procédure ;
  - **interdit d'inventer** : une étape, un acteur, un outil, un délai, un montant, une règle de gestion, une condition de décision.

### C6. Libellés des décisions
- Formalisation : la décision est une **question**, sorties **Oui / Non** obligatoires (« OK/KO » → « Dossier conforme ? Oui/Non »).
- Transcription : libellés **exacts** de la source.
- **Recommandation** : garder les deux, rattachés explicitement à leur mode (pas de contradiction réelle, mais à écrire une fois).

### C7. Nom des étapes et des procédures
- Formalisation : étape au **verbe à l'infinitif**, reformulée, « jamais "Émission" ou "Réception" seuls ». Transcription : libellé exact, pas d'infinitif imposé. Procédure (aiguillage, référentiel) : **verbe + objet**.
- **Recommandation** : règle unique par mode — étape = verbe à l'infinitif + objet précis ; procédure = verbe + objet (« Organiser une formation en alternance ») ; transcription = exact.

### C8. Qu'est-ce qu'une procédure ? (deux détecteurs)
- Chat : « un enchaînement d'étapes avec un objectif métier propre ; chaque diapositive qui détaille ses propres étapes est une procédure ; une vue d'ensemble n'en est pas une ; les étapes ne sont pas des procédures ».
- Ancienne découverte (`discovery_prompt`, Studio complet) : « identifier chaque processus ou procédure distincte », sans ces précisions.
- **Gêne** : le même PowerPoint peut donner 5 procédures dans le chat et un autre nombre dans le Studio complet ; c'est la cause des « 27 au lieu de 6 » trouvée cette semaine dans le référentiel.
- **Recommandation** : **une seule définition** (celle du chat), dans le glossaire, utilisée par tous les détecteurs.

### C9. Qu'est-ce qu'un outil ?
- `extract_prompt` : « système informatique utilisé (CRM, Nov@ OA) ».
- **Gêne** : rien sur la messagerie, le tableur, le formulaire papier, le téléphone, le portail d'un partenaire (AKTO).
- **Recommandation** : **outil = tout moyen utilisé pour réaliser la tâche** : logiciel, portail, messagerie, tableur, formulaire ; **pas** les documents produits (ce sont des sorties). Un même outil porte toujours le même nom (« Winpack », pas « winpack » puis « WinPack »).
- **Question pour toi** : le papier et le téléphone comptent-ils comme outils ?

### C10. Le ton
- Relecture : « comme un collègue », « comme le ferait Claude » — a donné « Salut ! ». Aiguillage : « naturelles, comme un collègue ». Suivi : forme nominale courte. Une seule consigne interdit la salutation.
- **Recommandation** — règle unique : français, direct, **pas de salutation ni de formule d'introduction**, pas de jargon technique ni d'interface (« JSON », « cochez »), la première personne pour dire ce que l'assistant fait.

### Sans contradiction, à écrire une fois dans le glossaire
- L'événement de début est chez le **premier acteur interne** ; la tâche d'un acteur externe qui déclenche le processus est placée **avant** lui.
- Un événement de fin porte l'acteur et le département de la tâche qui le précède.
- Une décision exclusive a au moins deux sorties libellées ; une décision parallèle n'a pas de libellés.
- Trois niveaux de référentiel toujours : thème › catégorie › sous-catégorie ; une procédure se range dans une sous-catégorie.
- Un nombre demandé par l'utilisateur est une consigne ; s'il n'est pas atteignable, on le dit.

### Pas une contradiction, mais à unifier
- Le rédacteur écrit les descriptions dans `descriptif`, la modification dans `description` (le chat fait la correspondance). Un seul nom à terme.

---

## 3. Glossaire proposé

Brouillon dans `clinic/prompts/glossaire.py` (non branché). Il sera injecté dans le cerveau et dans chaque savoir-faire, après tes décisions et une mesure sur le banc d'essai.

---

## 4. Suite

1. Tes décisions sur C1 à C10 (et les deux questions : niveau d'acteur, papier/téléphone).
2. Banc d'essai des décisions (étape 0 du cerveau unique).
3. Branchement du glossaire, consigne par consigne, mesuré avant/après.
4. Retrait des doublons et des consignes mortes (après confirmation).
