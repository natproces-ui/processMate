# Refonte du chat processMate : prompts pour Claude Code

Six prompts, à lancer **dans l'ordre**, une session Claude Code par prompt. Chaque prompt regroupe des tâches liées et se termine par un rapport. Ne passe au suivant qu'après avoir relu ce rapport et testé.

| # | Lot | Dépend de |
|---|---|---|
| 1 | Socle : sécuriser `/api/studio`, quotas invités, ne plus perdre le chat | — |
| 2 | Choix du modèle selon la source et le niveau (Rapide / Normale / Approfondie) | 1 |
| 3 | Conversations persistées, sources cumulatives, API Interactions | 1 |
| 4 | Le chat comme porte d'entrée, projets, mode invité | 3 |
| 5 | Versions, points de restauration, points ouverts | 3 |
| 6 | Agent outillé | 2, 3, 5 |

---

## Règles communes (chaque prompt y renvoie)

Copie-les telles quelles si tu lances un prompt hors de ce fichier.

```
RÈGLES COMMUNES — à respecter pendant tout le lot

Langue : réponds et commente en français.

Avant de coder
- Fais d'abord un état des lieux écrit : fichiers concernés, appelants réels, risques.
  Ce dépôt contient des implémentations parallèles et du code mort : vérifie par les
  imports (grep) qu'un fichier est vraiment utilisé avant de le modifier ou de t'en servir.
- Présente un plan court et ATTENDS MON ACCORD avant : toute migration SQL, toute
  suppression de fichier ou de route, tout changement de contrat d'API utilisé ailleurs.

Périmètre
- Backend : uniquement clinic/. Ne touche ni sfd/ ni backend/ sans me demander.
- Deux éditeurs de procédure partagent le chat : le Studio (SttPanel) et l'espace de travail
  (ProcedureEditor). Toute modification de ChatInterface doit fonctionner dans les deux.
- Tailwind : ne code jamais en dur relative/absolute dans un composant qui accepte className.

Principes produit (non négociables)
- Pas de mémoire implicite. L'assistant ne sait que ce qui est visible : historique de la
  conversation, sources du projet, instructions du projet.
- L'utilisateur choisit Rapide / Normale / Approfondie. Il ne voit JAMAIS le nom d'un modèle
  (ni dans l'interface, ni dans les messages d'erreur, ni dans les événements SSE).
- Les identifiants de modèles Gemini n'existent que dans clinic/config.py (surchargeables
  par variables d'environnement). Nulle part ailleurs.
- Gemini change vite : relis la doc officielle avant de coder ce qui la concerne
  (https://ai.google.dev/gemini-api/docs/models et
  https://ai.google.dev/gemini-api/docs/interactions-overview). N'invente aucun identifiant.

Ne rien casser
- Toute nouveauté risquée passe derrière un drapeau (variable d'environnement) désactivable,
  avec l'ancien comportement par défaut tant que je n'ai pas validé.
- Garde les anciennes routes et URL en redirection plutôt que de les supprimer.
- Migrations SQL : nouveaux fichiers dans clinic/database/, idempotentes (IF NOT EXISTS),
  avec RLS. Ne les applique pas toi-même : donne-les-moi.

Vérifications obligatoires en fin de lot
- Backend : clinic/.venv/Scripts/python.exe -m pytest clinic/tests (tous verts, nouveaux
  tests ajoutés pour ce que tu as écrit).
- Frontend (dans frontend/) : npx tsc --noEmit, npm run lint, npm run build.
- Scénarios de non-régression à dérouler (manuellement ou par script) et à cocher dans
  le rapport :
  1. Studio : joindre un PDF contenant plusieurs procédures → proposition → générer 2 → onglets.
  2. Studio : modifier une procédure par le chat (patch) → tableau et BPMN à jour.
  3. Studio : dictée vocale → texte dans le composeur.
  4. Studio : Enregistrer, puis Soumettre pour vérification.
  5. Espace de travail : ouvrir une procédure, utiliser le chat de ProcedureEditor.
  6. Fiche & export d'une procédure.
  7. Connexion, déconnexion, inscription.

Livraison
- Ne commite pas et ne pousse pas sans mon accord.
- Rapport final : ce qui a changé (fichiers), résultats des vérifications (sortie réelle),
  ce qui n'a pas pu être vérifié, migrations SQL à appliquer, drapeaux ajoutés et leur valeur
  par défaut, points à décider.
```

---

## Prompt 1 — Socle : sécuriser `/api/studio`, quotas invités, ne plus perdre le chat

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.

Contexte vérifié
- clinic/routers/studio_router.py n'a aucune vérification d'authentification :
  /api/studio/turn et /api/studio/generate sont appelables par n'importe qui, sans quota.
- Le seul modèle d'authentification existant côté clinic est require_admin dans
  clinic/routers/demo_files_router.py (jeton Supabase « Authorization: Bearer », vérifié par
  db.auth.get_user). Le frontend envoie ce jeton dans frontend/src/lib/demoFilesApi.ts.
- Dans frontend/src/components/processmate/SttPanel.tsx, l'assistant est rendu
  conditionnellement ({chatOpen && <aside>…<ChatInterface/>}) : masquer l'assistant démonte
  ChatInterface et efface toute la conversation (état local useState dans
  frontend/src/components/ChatInterface.tsx).

Tâches
1. Authentification facultative
   - Crée une dépendance FastAPI réutilisable (ex. clinic/manager/auth.py) :
     get_optional_user → utilisateur Supabase ou None ; require_user → 401 si absent.
     Factorise require_admin pour qu'il s'appuie dessus, sans changer son comportement.
   - Branche get_optional_user sur toutes les routes de studio_router (et la dictée si elle
     y est). Recense toutes les autres routes clinic sans authentification et liste-les dans
     le rapport SANS les modifier (audit séparé).
   - Frontend : un helper unique qui ajoute le jeton Supabase aux appels /api/studio/*
     (même logique que demoFilesApi.ts), utilisé par ChatInterface et SttPanel.
2. Quotas et limites invités (utilisateur None)
   - Limites configurables par variables d'environnement, avec valeurs par défaut :
     GUEST_MAX_FILES=1, GUEST_MAX_FILE_MB=5, GUEST_MAX_PAGES=15, GUEST_TURNS_PER_DAY=10,
     GUEST_GENERATIONS_PER_DAY=2. Niveau forcé à Rapide ou Normale pour un invité
     (pas d'Approfondie).
   - Compteur par jour, clé = identifiant d'appareil (en-tête X-Device-Id généré et gardé
     côté navigateur) ET adresse IP. Le backend tourne sur DigitalOcean App Platform, donc
     potentiellement plusieurs instances : stocke les compteurs dans une table Supabase
     (migration à me soumettre), avec repli en mémoire si la base est indisponible.
     Lis l'IP réelle derrière le proxy (X-Forwarded-For) correctement.
   - Réponses claires en français quand une limite est atteinte (HTTP 429 + message),
     affichées proprement dans le chat, avec l'invitation à créer un compte.
   - Utilisateurs connectés : aucun changement de comportement dans ce lot.
3. Ne plus perdre le chat
   - Dans SttPanel, garde ChatInterface monté quand l'assistant est masqué (masquage CSS /
     attribut hidden), en conservant la largeur mémorisée et le redimensionnement.
   - Sur le bouton « Assistant » affiché quand il est masqué : un indicateur discret
     (nombre de messages, point animé si une génération est en cours).
   - Vérifie qu'une génération lancée puis masquée continue et que les onglets se remplissent.
   - Vérifie que ProcedureEditor n'a pas le même défaut ; corrige-le de la même façon si oui.

Tests à ajouter
- Backend : jeton valide / absent / invalide ; dépassement de chaque limite invité ;
  niveau Approfondie refusé ou rabattu pour un invité ; utilisateur connecté non limité.
- Le scénario « masquer puis rouvrir l'assistant » dans la liste de non-régression.
```

---

## Prompt 2 — Choisir le modèle selon la source et le niveau

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.

Objectif produit
L'utilisateur garde le choix Rapide / Normale / Approfondie et ne voit jamais le modèle.
Mais chaque famille de tâches a ses meilleurs modèles (images, documents, code, audio,
synthèse…), et pour chacune il existe un modèle rapide, moyen et approfondi. Comme nous
détectons déjà le type des sources, le système doit choisir le modèle selon
(type de tâche × type de source × niveau choisi).

Contexte vérifié
- clinic/manager/model_manager.py : _MODELS_BY_LEVEL associe seulement le niveau à une
  chaîne (FAST → LITE puis FLASH, NORMAL → FLASH puis LITE, DEEP → PRO puis FLASH).
  generate_content / generate_content_stream acceptent déjà un paramètre models.
- clinic/config.py : GEMINI_MODEL_PRO, _FLASH, _LITE, _TRANSCRIBE (surchargeables par env).
- La détection de type existe dans clinic/routers/studio_router.py::_read_files
  (pdf, image, docx, pptx) et le parcours « code source » passe par l'analyse de code.
- Environ 22 fichiers de clinic/ appellent generate_content.

Tâches
1. Inventaire
   - Recense TOUS les appels aux modèles dans clinic/ (hors .venv et tests) : fichier,
     fonction, ce que fait la tâche, type d'entrée, modèle ou chaîne utilisé aujourd'hui,
     code mort ou vivant (vérifié par les imports). Mets ce tableau dans le rapport.
2. Doc officielle
   - Relis la page des modèles Gemini. Relève les identifiants disponibles, leur statut
     (stable / preview / sans statut) et les retraits annoncés. Un modèle sans statut
     affiché ou en preview ne devient pas un choix par défaut ; il peut être proposé en
     variable d'environnement.
3. Table de routage
   - Crée clinic/manager/model_routing.py avec :
     • un enum TaskKind (au minimum : intent / aiguillage, extraction_texte,
       extraction_pdf_texte, extraction_pdf_scanné, extraction_image, extraction_office,
       analyse_code, génération_procédure, modification_procédure, relecture_critique,
       synthèse_courte, transcription, embedding) ;
     • une table (TaskKind × ProcessingLevel) → liste ordonnée (principal puis secours),
       dont les valeurs sont des clés de config, jamais des identifiants en dur ;
     • une fonction resolve_models(task, source_kinds, level) qui gère les entrées mixtes
       (ex. PDF + image) en prenant le profil le plus exigeant.
   - Ajoute dans clinic/config.py les variables nécessaires (une par profil distinct), avec
     des valeurs par défaut prudentes tirées de la doc, et un commentaire daté.
   - Distingue PDF texte et PDF scanné par une heuristique simple et testée (proportion de
     pages avec une couche texte), sans dépendance lourde.
4. Branchement progressif
   - get_models_for_request() garde exactement son comportement actuel quand aucune tâche
     n'est fournie. Ajoute un paramètre task / source_kinds facultatif.
   - Branche le routage d'abord sur le parcours Studio (aiguillage, découpage en
     procédures, génération, modification, relecture) puis sur les autres appels vivants.
     Drapeau MODEL_ROUTING_ENABLED (défaut : false) pour revenir à l'ancien comportement.
   - Le niveau choisi par l'utilisateur reste respecté : Rapide ne monte jamais sur un
     modèle approfondi, sauf secours en cas d'erreur.
5. Confidentialité des modèles
   - Vérifie qu'aucun identifiant de modèle n'apparaît côté utilisateur : réponses API,
     événements SSE, messages d'erreur, frontend. Corrige ce que tu trouves.
6. Mesure
   - Journalise pour chaque appel : tâche, types de sources, niveau, modèle utilisé, secours
     déclenché ou non, durée, jetons si disponibles. Pas de contenu utilisateur dans les logs.
   - Écris un script clinic/bench/eval_models.py (non lancé automatiquement) qui exécute
     une tâche donnée sur un dossier de fichiers d'exemple avec plusieurs profils et sort un
     tableau comparatif (durée, jetons, nombre d'étapes, erreurs). Je le lancerai sur les
     22 procédures CMC.

Tests à ajouter
- Table de routage complète (chaque TaskKind × niveau a au moins un modèle).
- Entrées mixtes, PDF scanné vs texte, drapeau désactivé = comportement identique à avant,
  aucun identifiant de modèle hors config.py (test qui grep le code).
```

---

## Prompt 3 — Conversations persistées, sources cumulatives, API Interactions

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.
Prérequis : le lot 1 est en place (get_optional_user / require_user).

Contexte vérifié
- ChatInterface crée un session_id local (crypto.randomUUID) et garde les messages dans un
  useState. L'historique envoyé au serveur ne contient que le texte des messages
  (buildHistory) : ni la relecture (remarks), ni les propositions, ni les générations.
- studio_router garde les sessions en mémoire (_sessions, durée de vie 4 h) : perdues au
  redéploiement et non partagées entre instances.
- Joindre de nouveaux fichiers REMPLACE les précédents (« nouveaux fichiers = nouveau
  contexte ») : impossible d'ajouter un compte rendu d'entretien à un premier document.
- Rouvrir une procédure (workflowId) donne un chat vide : aucun lien conversation ↔ procédure.
- Doc Gemini (à relire) : l'API Interactions est GA depuis juin 2026 et recommandée ;
  previous_interaction_id permet de continuer côté serveur et favorise le cache implicite ;
  stockage par défaut 55 jours (payant), 1 jour (gratuit) ; store=false = rien conservé ;
  system_instruction, tools et generation_config doivent être renvoyés à chaque tour ;
  le cache explicite n'y est pas encore disponible.

Décisions de conception (à respecter)
- Supabase est la source de vérité de l'historique. previous_interaction_id n'est qu'une
  optimisation : si l'interaction a expiré ou échoue, on reconstruit le contexte depuis la base.
- Pas de mémoire implicite : le contexte envoyé au modèle = instructions + sources de la
  conversation + historique de la conversation (résumé si trop long). Rien d'autre.
- Invités : rien n'est écrit en base, store=false côté Gemini.

Tâches
1. Schéma (migration à me soumettre avant de l'utiliser)
   - conversations (id, owner_id, title, procedure_ids, project_id nullable pour le lot 4,
     created_at, updated_at, archived_at)
   - conversation_messages (id, conversation_id, role, content, payload jsonb pour les
     étapes / propositions / générations / relecture / suggestions, interaction_id,
     created_at)
   - conversation_sources (id, conversation_id, filename, type, size, storage_path, pages,
     added_at, removed_at)
   - Fichiers dans un bucket Supabase Storage privé. RLS : chacun ne voit que ses
     conversations.
2. API (nouveau routeur clinic/routers/conversations_router.py, require_user)
   - lister (récentes d'abord), créer, lire avec messages et sources, renommer, archiver,
     supprimer, ajouter / retirer une source, retrouver la dernière conversation d'une
     procédure.
3. Tour de conversation
   - /api/studio/turn accepte conversation_id. Utilisateur connecté : charge historique et
     sources depuis la base, enregistre le message et la réponse complète (payload compris)
     à la fin du flux, y compris en cas d'arrêt par l'utilisateur.
   - Sources cumulatives : un nouveau fichier s'AJOUTE aux sources (dédoublonnage par nom +
     taille + empreinte), dans la limite MAX_FILES. L'utilisateur peut en retirer une.
     La proposition de procédures porte sur toutes les sources actives.
   - L'historique pour le modèle est construit côté serveur et inclut les résumés des
     propositions, générations et relectures. Au-delà d'un seuil, résume les anciens tours
     (modèle rapide via le routage du lot 2) et garde le résumé en base.
   - Remplace _sessions par la base ; garde au besoin un cache mémoire court.
4. API Interactions
   - Fais passer le chat du Studio par l'API Interactions (SDK google-genai déjà en 2.8.0),
     avec previous_interaction_id mémorisé par message. Renvoie à chaque tour les
     instructions et les outils. Repli automatique sur generate_content en cas d'erreur.
   - Drapeau STUDIO_USE_INTERACTIONS (défaut : false).
   - Ne migre pas les autres appels du backend dans ce lot ; liste-les dans le rapport.
5. Frontend
   - ChatInterface charge une conversation par identifiant (paramètre d'URL ?c=…), crée la
     conversation au premier message, affiche la liste des sources actives avec retrait.
   - Rouvrir une procédure enregistrée rouvre sa dernière conversation (Studio ET
     ProcedureEditor).
   - « Nouvelle conversation » crée bien une nouvelle conversation, l'ancienne reste
     retrouvable.
   - Invité : comportement actuel (conversation dans le navigateur uniquement), sans erreur.

Tests à ajouter
- Reprise après redémarrage du serveur ; ajout puis retrait de sources ; reconstruction du
  contexte quand previous_interaction_id est invalide ; arrêt en cours de flux enregistré ;
  isolation entre deux utilisateurs (RLS) ; invité sans écriture en base.
```

---

## Prompt 4 — Le chat comme porte d'entrée, projets, mode invité

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.
Prérequis : lots 1 et 3 en place.

Objectif produit
Comme Claude ou ChatGPT : l'utilisateur arrive directement dans le chat. Sans compte, il
peut formaliser une première procédure (texte, image ou document de taille limitée) mais
rien n'est enregistré. La page commerciale devient « En savoir plus / Se former / Guide »,
avec connexion, inscription et un peu de blog.

Contexte vérifié
- frontend/src/app/page.tsx (≈ 580 lignes) est la page commerciale actuelle, avec des liens
  vers /orchestration?tab=… .
- L'application est sous frontend/src/app/(processmate)/ protégée par AuthGuard ;
  /orchestration est le shell (barre latérale ProcessMateSidebar : Orchestration, Studio,
  Procédures, Mon espace de travail, Suivi des tâches, Campagnes, Analyse,
  Spécifications, Tableau de bord, Guide). Le Studio s'ouvre via ?module=stt.
- Navigation centralisée dans frontend/src/lib/processmate-navigation.ts.

Tâches
1. Routes
   - Déplace la page commerciale vers /decouvrir sans perte de contenu ; ajoute /guide (ou
     réutilise GuidePanel) et /blog (liste d'articles à partir de fichiers locaux simples,
     un article d'exemple). Mets à jour tous les liens internes.
   - / devient la page de chat, HORS AuthGuard, accessible connecté ou non.
   - Drapeau NEXT_PUBLIC_CHAT_HOME (défaut : false = ancienne page d'accueil sur /).
   - /orchestration et tous ses paramètres continuent de fonctionner à l'identique.
2. Page de chat
   - Réutilise ChatInterface et le panneau de procédure du Studio (Tableau / BPMN / Fiche)
     qui s'ouvre à droite dès qu'une procédure existe. Ne réécris pas un troisième éditeur :
     extrais si nécessaire de SttPanel un composant réutilisable, sans changer le
     comportement du Studio actuel.
   - Barre latérale façon Claude : Nouvelle conversation, Projets, Récents (conversations du
     lot 3), puis des liens vers l'existant : Référentiel (procédures), À faire (suivi des
     tâches), Campagnes, Analyse. Aucun module existant n'est supprimé.
   - En-tête : Connexion / Inscription pour un invité, menu profil sinon. Lien « Découvrir ».
3. Mode invité
   - Limites du lot 1 affichées avant envoi (taille, nombre de fichiers) et refus côté
     client avant d'appeler le serveur.
   - Conversation et procédure gardées dans le navigateur (IndexedDB, avec try/catch :
     navigation privée possible). Bandeau « Rien n'est enregistré. Créez un compte pour
     conserver ce travail. »
   - À l'inscription ou à la connexion : proposition d'importer la conversation et la
     procédure de l'invité dans son compte (endpoint d'import, require_user), puis nettoyage
     du stockage local.
   - Export autorisé ou non pour un invité : NE DÉCIDE PAS, mets un drapeau
     GUEST_EXPORT_ENABLED (défaut : false) et signale-le dans le rapport.
4. Projets
   - Table projects (id, owner_id, name, instructions, created_at…) + project_members ;
     conversations.project_id ; sources rattachables au projet (partagées par ses
     conversations). Migration à me soumettre.
   - Un projet = sources + instructions + conversations. Pas de mémoire implicite.
   - Campagnes : NE LES FUSIONNE PAS. Ajoute seulement un lien facultatif
     projects.campaign_id et liste dans le rapport ce qu'une fusion impliquerait.

Tests à ajouter
- Parcours invité complet jusqu'à l'import ; drapeau désactivé = ancienne page d'accueil ;
  anciens liens /orchestration?… toujours valides ; mobile (largeur 375 px) sans
  défilement horizontal.
```

---

## Prompt 5 — Versions, points de restauration, points ouverts

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.
Prérequis : lot 3 en place.

Contexte vérifié
- Aucune table de versions de procédure n'existe. La sauvegarde passe par
  orchestrationApi.saveWorkflowData (workflow_json, enrichments_json avec __bpmn_xml__,
  métadonnées).
- Une modification par le chat régénère tout le BPMN (SttPanel.tsx, safeGenerateBpmn) :
  les positions faites à la main sont perdues, et rien ne permet d'annuler.
- metadata.recent_ai_changes surligne déjà les étapes touchées par l'IA.

Tâches
1. Versions
   - Table procedure_versions (procedure_id, version, workflow_json, enrichments_json,
     bpmn_xml, metadata, source : 'manuel' | 'ia' | 'restauration', author_id,
     conversation_message_id nullable, created_at). Migration à me soumettre.
   - Une version à chaque enregistrement manuel ET avant chaque modification appliquée par
     l'IA (y compris dans ProcedureEditor).
   - Historique des versions dans la vue Fiche : liste, comparaison simple (étapes
     ajoutées / supprimées / modifiées), restauration.
2. Points de restauration dans le chat
   - Sur chaque message de l'assistant qui a modifié une procédure : bouton « Restaurer
     l'état d'avant ». La restauration crée une nouvelle version (on ne détruit rien).
3. BPMN préservé
   - Quand le chat modifie une procédure, applique les changements au diagramme existant
     (ajout / suppression / renommage d'éléments) au lieu de tout régénérer, en conservant
     les positions des éléments inchangés. Si ce n'est pas faisable proprement pour un cas,
     repli sur la régénération actuelle, et le dire à l'utilisateur.
4. Points ouverts
   - Table open_points (procedure_id, step_id nullable, question, type : 'acteur à
     confirmer' | 'outil à confirmer' | 'étape implicite' | 'règle à préciser' | autre,
     acteur à interroger, statut : ouvert / répondu / abandonné, réponse, source,
     conversation_id, timestamps).
   - À la génération, l'IA relève les points ouverts explicites des sources (« à confirmer »,
     « ? », « outil ? »…) et ceux qu'elle détecte, en les distinguant.
   - Vue « Points ouverts » par procédure et par projet ; export de la liste (texte prêt à
     envoyer) ; répondre à un point propose la modification correspondante dans le chat.
   - Repère visuel sur les étapes concernées (tableau et BPMN), cohérent dans le Studio et
     dans l'espace de travail.

Tests à ajouter
- Version créée avant chaque modification IA ; restauration ; diagramme préservé après un
  patch simple (positions inchangées) ; cycle complet d'un point ouvert.
```

---

## Prompt 6 — Agent outillé

```
Lis docs/prompts-refonte-chat.md, section « Règles communes », et applique-les.
Prérequis : lots 2, 3 et 5 en place.

Objectif
Remplacer l'aiguillage par intentions (generate / patch / regen / web_search / clarify /
explain dans ChatInterface et studio_router) par UN agent outillé qui planifie, agit avec
des outils, vérifie et pose des questions. Pas de système multi-agents à ce stade.

Contexte
- Relis la doc Interactions (appel de fonctions, mode arrière-plan background=true pour les
  tâches longues, limites : appel de fonctions automatique non disponible, MCP distant non
  supporté par Gemini 3).
- Le format d'opérations de modification existe déjà (applyOperations dans
  frontend/src/logic/workflowOperations.ts) : réutilise-le pour l'outil de modification.

Tâches
1. Outils (fonctions déclarées au modèle, exécutées par le backend)
   lire_source, chercher_dans_sources, lire_procédure, proposer_modification (opérations),
   créer_procédure, lister_points_ouverts, créer_point_ouvert, répondre_point_ouvert,
   créer_tâche (orchestration existante), consulter_bian, lancer_analyse (irritants,
   complexité), générer_spécification. Chaque outil vérifie les droits de l'utilisateur.
2. Règle d'écriture
   - Aucun outil n'écrit directement une procédure : il produit une PROPOSITION affichée dans
     le chat (aperçu des changements), que l'utilisateur accepte ou refuse. Accepter crée une
     version (lot 5).
3. Boucle
   - Nombre maximal d'étapes et de jetons par tour (configurables), arrêt par l'utilisateur,
     progression visible (réutilise les événements « status » du flux SSE).
   - Le modèle de chaque étape vient du routage du lot 2 (le niveau choisi par l'utilisateur
     reste respecté).
   - Tâches longues (plusieurs procédures, gros documents) en mode arrière-plan, avec reprise
     si l'utilisateur ferme la page.
4. Transition
   - Drapeau STUDIO_AGENT_ENABLED (défaut : false). L'ancien aiguillage reste le chemin par
     défaut tant que je n'ai pas comparé les deux sur les 22 procédures CMC
     (clinic/bench/eval_models.py du lot 2, étendu à l'agent).

Tests à ajouter
- Chaque outil (droits compris) ; aucune écriture sans acceptation ; limite d'étapes ;
  arrêt utilisateur ; tous les scénarios de non-régression avec le drapeau activé ET
  désactivé.
```
