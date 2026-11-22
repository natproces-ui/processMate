# Consignes de l'IA — inventaire, contradictions, glossaire

État au 22/11/2026. Ce document prépare le « cerveau unique » : rien n'est encore branché.
Ordre de lecture : **2. Décisions**, puis 3 (glossaire), puis 1 (inventaire).

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
| `interface_prompt` | Regrouper les interfaces par système | Route non appelée par l'interface — **conservée** (décision du 22/11/2026) |
| ~~`enhance_prompt`, `verify_prompt`~~ | Améliorer / vérifier un logigramme lu depuis une image | **Retirées le 22/11/2026** avec la route `img-to-bpmn` (aucun appel de l'interface) |
| ~~`SYSTEM_PROMPT` (`bpmn_ai`)~~ | Enrichir le tableau du parcours « code source » | **Retirée le 22/11/2026** avec son bouton « Enrichir avec IA » (adresse figée `localhost:8002`, inopérant en production) |
| `PROMPT_TEMPLATE` (`dot_to_table`) | Convertir le graphe du parcours « Partir du code source » en tableau | **Utilisée** (l'inventaire la disait morte à tort) : conservée |

« Probablement morte » sera confirmé avant suppression (le projet a beaucoup de chemins parallèles).

---

## 2. Décisions (22/11/2026)

Les dix contradictions sont tranchées ; le glossaire (`clinic/prompts/glossaire.py`, version 0.2) les applique.

| # | Sujet | Décision |
|---|---|---|
| C1 | Acteurs externes | Visibles dans la source, ou déduits clairement de ce qui est fait ; en cas de doute, on demande. Jamais un acteur qui n'intervient pas. |
| C2 | Granularité des acteurs | **On garde l'acteur tel que la source le nomme.** « Responsable – BOI » et « Back office » tout court sont légitimes. Un acteur clairement mentionné n'est jamais fusionné ni supprimé, sauf demande de l'utilisateur. Seules les écritures d'un même nom sont réunies (tiret, casse, article). |
| C3 | Département / acteur | Département = entité (le couloir), acteur = rôle dans l'entité ; identiques si la source ne distingue pas. Les fiches CIH suivent déjà ce modèle : « Chargé d'affaires – Agence ». |
| C4 | Descriptions | **Autant que possible**, à partir de la source, des explications du chat ou de la compréhension du métier. Sinon vide : l'utilisateur complète. Jamais « à préciser ». |
| C5 | Déduire / inventer | Comme recommandé : on déduit le titre, l'acteur évident, la nature, les abréviations, la description générale ; on n'invente ni étape, ni outil, ni délai, ni montant, ni règle propres à l'organisation. |
| C6 | Libellés des décisions | Comme recommandé : question + Oui/Non en formalisation, exacts en transcription. |
| C7 | Noms | Étape : verbe à l'infinitif + objet. Procédure : **le titre de la source quand il existe** (« Crédit documentaire à l'export – Modification »), sinon un titre court qui dit ce qu'elle accomplit. |
| C8 | Définition d'une procédure | Celle du chat, pour tous les détecteurs, complétée : une procédure peut regrouper des sous-procédures (un début, une fin, des transitions) ; des circuits sans passage de l'un à l'autre sont distincts ; si on ne peut pas trancher, on propose ou on demande. Chaque forme de source se lit selon sa forme. |
| C9 | Outils | Applicatifs et outils utilisés (TI+, Docflow, Swift Alliance, Outlook, Excel…). **Ni le papier ni le téléphone.** Pas les documents produits. |
| C10 | Ton | On répond dès la première phrase ; pas de salutation quand l'utilisateur demande quelque chose, une réponse simple s'il salue sans rien demander. Texte bien mis en forme, visuel si utile, pas d'étiquettes « Conseil », « Remarque », « Recommandation ». |

Deux principes ajoutés à la demande de l'utilisateur :
- **Le chat est une source** au même titre que les pièces jointes : consignes, explications et corrections comptent ; en cas de conflit, l'utilisateur a raison et sa correction reste acquise.
- **L'assistant peut poser des questions** : seulement si la source est réellement ambiguë et que le choix change le résultat, ciblées (ce qu'il a lu, pourquoi il hésite, les options), une ou deux au plus. Sinon il propose : une procédure se corrige vite depuis le chat.

### Sources d'exemples pour le banc d'essai
- **Opérations à l'international** (71 fiches CIH, Bureau › « Procedures processmate », aussi en base) : fiches « Acteur / Commentaire », acteurs « Fonction – Entité » écrits de plusieurs façons (« Gestionnaire des opérations – BOI » sous 8 graphies), outils TI+, Docflow, Swift Alliance, Nov@GC, PORTNET.
- **MCNE en MAD** (PDF, logigramme).
- **Forma Cash** (présentation, une diapositive par procédure, circuits Alternance / Plan).
- Manuscrits et logigrammes sans couloirs déjà utilisés dans les tests de lecture.

### Pas une contradiction, mais à unifier
- Le rédacteur écrit les descriptions dans `descriptif`, la modification dans `description` (le chat fait la correspondance). Un seul nom à terme.

---

## 3. Glossaire proposé

Brouillon dans `clinic/prompts/glossaire.py` (non branché). Il sera injecté dans le cerveau et dans chaque savoir-faire, après tes décisions et une mesure sur le banc d'essai.

---

## 4. Suite

1. ~~Décisions sur C1 à C10~~ (faites le 22/11/2026).
2. ~~Banc d'essai des décisions~~ (fait le 22/11/2026) : `clinic/bench/decisions.py`, 55 situations dans `bench/decisions_cases.py`.
   Mesure de départ (`bench/resultats_decisions_avant.json`) : **48/53 justes**, 2 sautées (manuscrit, logigramme sans couloirs : fichiers à déposer dans `bench-sources/`).
   Écarts : transcription demandée avec une pièce jointe → rédigée (0/3 : l'aiguillage ne connaît pas « transcrire ») ;
   « ajoute un préfixe à toutes les procédures » → question au lieu de le faire ; plan d'atténuation des risques → proposition de procédures.
3. Branchement du glossaire, consigne par consigne, mesuré avant/après.
   - **Aiguillage — fait le 22/11/2026.** Glossaire en tête de `studio_planner_prompt` (définition d'une procédure en double retirée),
     deux actions ajoutées : `transcribe` (copie fidèle d'un fichier joint, exécutée par le chat sans qu'il reclasse la demande)
     et `ask` (question ciblée). Garde-fous : une procédure rendue telle quelle n'est pas refaite ; un nom de procédure se
     reconnaît à son premier mot ; une procédure refaite porte le titre décidé par l'aiguillage. La transcription lit
     désormais Word, PowerPoint et Excel.
     Banc (3 passages par situation, `bench/resultats_decisions_glossaire.json`) : **51/53** contre 48/53 ; transcrire 0/3 → 3/3,
     opérations sur l'ensemble 8/8 sur 5 passages. Restent : le plan d'atténuation des risques (proposé comme procédures,
     avec ou sans glossaire) et « préfixe sur toutes les procédures » (4/5 : une question de temps en temps).
   - **Rédaction et transcription — faits le 22/11/2026.** Glossaire (0.3) en tête de `extract_prompt` et de `transcribe_prompt`
     (mode TRANSCRIRE annoncé). Règles en conflit réécrites : département = entité, acteur = rôle tel que nommé (fiches
     « Acteur : » comprises), outil = applicatif, descriptif « autant que possible », acteurs externes qui interviennent réellement.
     Ajouts au glossaire après mesure : nom d'acteur jamais raccourci, précision entre parenthèses = profil (pas un acteur),
     service seul = l'acteur (ne pas inventer de fonction), « A / B » gardé tel quel.
     Banc du contenu (`bench/contenu.py`, 6 fiches CIH × rédaction et transcription, mesure contre les lignes « Acteur : ») :

     | 12 productions | Avant | Glossaire 0.3 |
     |---|---|---|
     | Acteurs inventés | 4 | 0 |
     | Acteurs perdus | 22 | 8 |
     | Fonction / entité séparées | 64/85 (75 %) | 122/130 (94 %) |
     | Outils inventés | 0 | 0 |

     Restes : « BO salle des marchés & BOI » réduit, « Chargé de clientèle » remplacé par le « Chef de caisse » que la fiche
     cite aussi dans sa liste d'acteurs (fiche incohérente). **À surveiller** : rédaction ~10 % plus lente (consigne plus longue) ;
     une rédaction a dépassé le délai de 180 s sans réponse du modèle, réussie au second essai (170 s).
     Banc des décisions refait avec le glossaire 0.3 : 52/53.
   - **Modification — faite le 22/11/2026.** Banc `bench/modification.py` (11 instructions réelles sur CREDOC, opérations
     appliquées comme le fait l'écran) : 27/33 → 22/22. Les écarts étaient l'entité ou le profil collés dans l'acteur
     (« Responsable de service – BOI », « … (profil de saisie) »). **Pas d'extrait du glossaire dans cette consigne** : mesuré,
     il rendait certaines modifications 3 à 4 fois plus lentes (16 s → 60 s) sans rien corriger de plus ; les règles ciblées
     (point 5 de la consigne) suffisent.
   - **Relecture — faite.** Extrait du glossaire (acteur, outil, descriptions, réponse) ; ne propose plus de réunir ou renommer un
     acteur nommé par la source ; un manque se signale simplement, une tâche manuelle peut ne pas avoir d'outil.
   - **Découverte du Studio complet — faite.** Même définition d'une procédure que le chat (extrait du glossaire).
     Mesure sur Forma Cash : 3-4 procédures avant, 6 après (comme le chat), deux fois de suite.
     La première version de la définition (« un début, une fin, des transitions = une seule procédure ») faisait tomber la
     découverte à 2-3 : corrigée en glossaire 0.4 (une phase détaillée à part est une procédure ; on ne regroupe que ce que la
     source décrit ensemble comme un seul déroulé).
   - `extrait(...)` dans `glossaire.py` : une consigne ne reçoit que les sections dont elle a besoin.
   - À suivre : classifieur du chat (`intent_prompt`, à fondre dans l'aiguillage), puis retrait des doublons et des consignes mortes.
4. Retrait des doublons et des consignes mortes (après confirmation).
