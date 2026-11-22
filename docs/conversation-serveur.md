# Le serveur, vérité de la conversation — plan à valider

État au 22/11/2026 : **lots A à D codés et testés**, en attente de l'application du script SQL en production (voir § 5). Ce document décrit l'étape qui précède le panneau à la Claude
(« Sorties », « Utilisés dans cette conversation », « Progression ») et l'enregistrement de plusieurs procédures.

---

## 1. Aujourd'hui

| Ce que la conversation produit ou utilise | Où c'est gardé | Qui fait foi |
|---|---|---|
| Messages (texte, étapes, cartes) | Serveur — `conversation_messages` | Serveur |
| Sources jointes | Serveur — `conversation_sources` (cumulées, retirables) | Serveur |
| Procédures **générées** | Serveur — une copie complète dans le message qui les a produites (`generated`) | Navigateur ensuite |
| Procédures **modifiées** par le chat | Le serveur calcule les opérations ; **le navigateur les applique** | Navigateur |
| Corrections à la main (tableau, diagramme) | Navigateur | Navigateur |
| État courant des procédures | `conversations.state.procedures`, **recopié par le navigateur** 1,5 s après chaque modification | Navigateur |
| Procédures archivées / rétablies | Navigateur, puis recopie | Navigateur |
| Points de restauration, « ce qui a changé » d'un message | Navigateur seulement | Navigateur |
| Recherches sur internet | Nulle part (seulement le texte de la réponse) | — |
| Contexte utilisé (référentiel, fichier modèle) | Nulle part | — |
| Lien vers la procédure enregistrée dans le référentiel | `workflow_db_id`, recopié par le navigateur | Navigateur |

À chaque message, le navigateur renvoie toute la liste des procédures au serveur, qui la croit.

**Conséquences constatées**
1. Deux onglets ou deux appareils sur la même conversation : le dernier qui recopie gagne, sans prévenir.
2. Une modification perdue si l'onglet se ferme avant la recopie (1,5 s).
3. L'aiguillage raisonne sur ce que le navigateur dit, pas sur ce que le serveur a produit.
4. Aucune version d'une procédure de la conversation : seulement des points de restauration dans le navigateur, perdus au rechargement.
5. On ne sait pas si la procédure enregistrée dans le référentiel est à jour par rapport à la conversation.

---

## 2. Cible

**Le serveur garde les procédures de la conversation, avec une version à chaque changement.**
Le navigateur affiche ce que le serveur lui dit et lui envoie seulement les gestes de l'utilisateur.

### Deux tables (Supabase)

`conversation_procedures` — une ligne par procédure de la conversation

| Colonne | Rôle |
|---|---|
| `id`, `conversation_id`, `key` | la clé actuelle (`key`) est gardée : les messages et l'écran s'en servent déjà |
| `title`, `position` | titre courant, ordre des onglets |
| `status` | `active` ou `archivee` (remplace le drapeau `archived` d'aujourd'hui) |
| `current_version` | numéro de la version affichée |
| `workflow_db_id`, `saved_version` | lien vers le référentiel et version enregistrée → « modifiée depuis l'enregistrement » = `current_version > saved_version` |

`conversation_procedure_versions` — une ligne par version

| Colonne | Rôle |
|---|---|
| `procedure_id`, `version` | |
| `workflow_json`, `enrichments_json`, `metadata`, `bpmn_xml` | le contenu complet (le XML seulement quand le diagramme a été déplacé à la main) |
| `origine` | `generation`, `modification`, `transcription`, `reecriture`, `manuel`, `restauration`, `reprise` |
| `message_id` | le message du chat qui l'a produite (vide pour une correction à la main) |
| `resume` | ce qui a changé, en une phrase (« étape 5 : acteur Superviseur ») |

Même modèle que `procedure_versions` du référentiel, qui existe déjà : les deux historiques se ressembleront.

Les conversations restent rattachées à leur propriétaire (pas dans `ORG_TABLES`), comme aujourd'hui.

### Qui écrit quoi

| Geste | Aujourd'hui | Cible |
|---|---|---|
| Génération (aiguillage → rédaction) | copie dans le message, puis recopie par le navigateur | le serveur crée la procédure et sa version 1, liées au message |
| Modification par le chat | le navigateur applique les opérations | **le serveur applique les opérations** (la logique de `workflowOperations.ts` passe côté serveur — une copie fidèle existe déjà dans le banc de la modification) et crée une version |
| Réécriture, transcription, rédaction depuis un texte | idem génération | nouvelle version de la procédure visée, ou nouvelle procédure |
| Découper, déplacer, fusionner, retirer | archivage côté navigateur | le serveur archive et crée les nouvelles procédures dans le même geste |
| Correction à la main (tableau, diagramme) | recopie 1,5 s | envoi de la correction avec la version de départ ; les corrections à la main successives d'une même minute forment **une** version (pas une version par frappe) |
| Rétablir une version ou une procédure archivée | point de restauration du navigateur | nouvelle version « restauration » (rien n'est écrasé) |
| Enregistrer dans le référentiel | inchangé | inchangé, plus `saved_version` |

### Ce que lit l'aiguillage

Les procédures de la conversation **lues en base**, plus celles envoyées par le navigateur. Le formulaire
`conversation_procedures` ne sert plus qu'aux invités (sans conversation enregistrée).

### Deux écritures en même temps

Chaque correction à la main porte le numéro de version dont elle part. Si le serveur a avancé entre-temps
(un message du chat, un autre onglet), il refuse (409) et l'écran recharge la procédure en le disant :
« Cette procédure a changé pendant votre correction : voici la version à jour. »

---

## 3. Lots

| Lot | Contenu | Vérification |
|---|---|---|
| **A. Socle serveur** | les deux tables (script SQL), le magasin des procédures de la conversation, l'application des opérations côté serveur, les points d'accès : lire les procédures et leurs versions, corriger à la main, archiver, rétablir | tests unitaires (base simulée), dont les opérations comparées à celles de l'écran |
| **B. Le tour du chat écrit** | génération, modification, réécriture, transcription, découper / déplacer / retirer → versions liées au message ; l'aiguillage lit la base | tests du tour (modèle simulé) ; bancs décisions et modification inchangés |
| **C. L'écran suit le serveur** | chargement depuis le serveur, fin de la recopie toutes les 1,5 s, correction à la main avec version de départ et message en cas de conflit, cartes et restauration branchées sur les versions | parcours navigateur (scripts Playwright existants), deux onglets ouverts sur la même conversation |
| **D. Reprise de l'existant** | une conversation ancienne est reprise à sa première ouverture : son `state.procedures` devient la version 1 « reprise » de chaque procédure ; rien n'est migré d'un coup | test sur une copie d'une vraie conversation |

Un réglage (`CONVERSATION_PROCEDURES_SERVEUR`) permet de basculer et de revenir en arrière tant que le lot C n'est pas validé.
Les invités gardent le fonctionnement actuel (rien n'est enregistré pour eux).

### Ensuite (hors de cette étape)
- le panneau : **Sorties** (procédures avec leur état, versions), **Utilisés dans cette conversation** (sources, recherches, contexte), **Progression** ;
- **Tout enregistrer** et l'état « modifiée depuis l'enregistrement » avec « Mettre à jour » ;
- la trace des recherches sur internet et du contexte utilisé (une petite table de plus, même principe).

---

## 4. Ce qu'il faut décider

1. **Le script SQL** des deux tables est à appliquer en base de production (comme les précédents : je l'écris, tu l'appliques, ou je l'applique par le `.env` avec ton accord).
2. **Durée de vie des versions** : tout garder (proposé — une procédure de 40 étapes pèse quelques dizaines de Ko), ou ne garder que les 50 dernières par procédure.
3. **Les invités** restent sans historique côté serveur (proposé).

---

## 5. Réalisé (22/11/2026)

| Lot | Fait | Vérifié |
|---|---|---|
| A | `database/conversation_procedures_schema.sql`, `manager/conversation_procedures.py`, `manager/workflow_operations.py`, points d'accès dans `routers/conversations_router.py` | 14 tests (base simulée) : versions, conflit, corrections regroupées, restauration, archivage, lien au référentiel |
| B | fin de tour (`manager/turn_procedures.py`, `_record` du routeur) : réponse, versions, liste envoyée à l'écran (`conversation_procedures`) avant « done » ; l'aiguillage lit la base ; `/generate` a son propre contexte | tests : génération + archivage, modification appliquée par le serveur, création et réécriture par le chat |
| C | l'écran envoie l'id de son message, adopte la liste du serveur en fin de tour, envoie les corrections à la main procédure par procédure (jamais pendant une réponse, et juste avant un message), affiche la version à jour en cas de conflit, archive / rétablit et note la version enregistrée côté serveur | parcours navigateur : ouverture (0 écriture), tour, Rétablir, correction à la main (versions 1 puis 2), conflit ; anciens parcours (archives, enregistrement, accueil) inchangés |
| D | reprise d'une conversation d'avant à sa première ouverture (`ensure_seeded`) ; l'écran d'avant reste servi : seules les vraies différences deviennent des versions | tests |

**Mise en service** : le mode « le serveur fait foi » s'active tout seul quand les tables existent. Tant que le script n'est pas appliqué,
tout fonctionne comme avant. Pour couper : `CONVERSATION_PROCEDURES_SERVEUR=false` (backend).

**Limite connue** : un déplacement des formes sur le diagramme sans changement d'étape n'est pas une correction envoyée au serveur
(comme avant, la mise en page est gardée à l'écran ; elle est envoyée avec la prochaine correction de contenu).

## 6. Panneau « Cette conversation » (22/11/2026)

- **Sorties** : les procédures de la conversation avec leur état (brouillon, enregistrée, modifiée depuis l'enregistrement,
  remplacée), leur version, « Mettre à jour le référentiel », « Versions », « Rétablir », et « Tout enregistrer ».
- **Versions** d'une procédure : ce qui a changé à chaque message ou correction, comparaison avec l'état affiché,
  retour à une version (qui en crée une nouvelle).
- **Cartes des messages** : titre et étapes retenus par le serveur, état de chaque procédure, « Tout enregistrer » sous une
  génération de plusieurs procédures.
- **Tout enregistrer** : les procédures déjà enregistrées puis modifiées sont mises à jour à leur place ; les nouvelles sont
  rangées au même endroit (fenêtre « Enregistrer » en mode plusieurs procédures : un emplacement, chacune sous son nom).
- **Utilisés dans cette conversation** : sources jointes, et les fichiers désignés comme **modèles** de style.

Vérifié dans le navigateur (serveur simulé) : états, versions et retour, Tout enregistrer (mise à jour + création + version
enregistrée notée), cartes, fichier modèle ; parcours précédents inchangés.

**Constat** : l'action « recherche » du chat (`web_search`) ne cherche pas sur internet : elle rédige une procédure à partir des
connaissances du modèle, sans source. Aucune « recherche » n'est donc listée dans le panneau. Une vraie recherche (avec sources
citées) est une décision à prendre.
