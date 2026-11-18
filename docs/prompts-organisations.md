# Organisations, campagnes et validation : prompts pour Claude Code

Sept prompts à lancer **dans l'ordre**, une session Claude Code par prompt. Chaque prompt
regroupe des tâches liées et se termine par un rapport. Ne passe au suivant qu'après avoir
relu ce rapport et testé.

| # | Lot | Dépend de |
|---|---|---|
| 1 | Socle : organisations, appartenance, contrôle d'accès par organisation | — |
| 2 | Cloisonnement de toutes les données + tests d'étanchéité | 1 |
| 3 | Console plateforme : créer un espace client et le remettre à son admin | 1 |
| 4 | Administration de l'organisation : comptes, rôles, équipes | 1, 2 |
| 5 | Campagnes : emplacements, RACI, sources d'ajout, cycle de vie | 2, 4 |
| 6 | Du chat à la campagne : enregistrer, relire, valider (nom et date) | 5 |
| 7 | Tâches et points ouverts produits par le processus ; couverture BIAN | 5, 6 |

---

## Décisions déjà prises (ne pas les rediscuter)

- **Création d'un espace.** Une organisation demande l'ouverture de son espace. Le
  super-admin de processMate le crée, avec le compte de l'admin de l'organisation, et lui
  envoie un lien. L'admin se connecte avec ces identifiants et gère son espace.
- **Une personne appartient à une seule organisation.** Un consultant reçoit de
  l'organisation un compte de cette organisation. Il n'y a donc pas de sélecteur d'espace,
  ni de notion d'invité externe dans une campagne.
- **Comptes libres.** Un compte créé librement depuis l'accueil n'appartient à aucune
  organisation. Il garde son espace personnel : chat, conversations, projets.
- **Base unique et partagée.** Une seule base Supabase pour tous les clients, cloisonnée
  par `organisation_id`. Pas de base séparée par client.
- **Conversations privées.** Les conversations restent visibles par leur seul auteur. Le
  pilote ne les voit jamais, y compris dans une campagne.
- **Validation.** Une validation enregistre le nom de la personne qui valide et la date.
  Pas de signature électronique.
- **Le super-admin plateforme n'est membre d'aucune organisation.** Il ne voit pas les
  procédures des clients. Il voit les organisations, leurs comptes admin, leur
  consommation et le journal d'audit de la plateforme.
- **La procédure appartient à l'organisation, pas à la campagne.** Une campagne est un
  effort limité dans le temps, qui porte sur des procédures attendues (les emplacements) ou
  existantes.

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
- Lis docs/securite-et-espaces.md et clinic/manager/access_control.py : tout le contrôle
  d'accès passe par là. Ne crée pas de second mécanisme parallèle.
- Présente un plan court et ATTENDS MON ACCORD avant : toute migration SQL, toute
  suppression de fichier ou de route, tout changement de contrat d'API utilisé ailleurs.

Périmètre
- Backend : uniquement clinic/. Ne touche ni sfd/ ni backend/ sans me demander.
- Deux éditeurs de procédure partagent le chat : le Studio (SttPanel) et l'espace de travail
  (ProcedureEditor). Toute fonctionnalité liée à une procédure doit marcher dans les deux,
  via des composants partagés.
- Tailwind : ne code jamais en dur relative/absolute dans un composant qui accepte className.

Sécurité (non négociable)
- Le backend utilise la clé de service Supabase (RLS contournée) et le frontend ne lit
  aucune table métier : CHAQUE requête métier du backend doit être filtrée par
  l'organisation de l'appelant. Une donnée d'une autre organisation doit répondre 404
  (pas 403 : on ne confirme pas son existence).
- L'organisation vient TOUJOURS du compte connecté (côté serveur), jamais d'un paramètre
  envoyé par le frontend.
- Sécurisé par défaut : une route nouvelle ou oubliée est refusée, pas ouverte.
- Toute action sensible (création d'espace, rôle, statut, validation, suppression) est
  écrite dans le journal d'audit (qui, quoi, quand, sur quoi).

Principes produit
- Pas de mémoire implicite. L'assistant ne sait que ce qui est visible : historique de la
  conversation, sources et instructions du projet.
- L'utilisateur ne voit jamais le nom d'un modèle. Les identifiants de modèles n'existent
  que dans clinic/config.py.
- Les conversations restent privées à leur auteur, même pour le pilote et l'admin.
- Vocabulaire de l'interface, en français : organisation, espace, campagne, emplacement
  (« procédure attendue »), équipe, pilote, contributeur, lecteur, à faire.

Ne rien casser
- Toute nouveauté risquée passe derrière un drapeau (variable d'environnement), avec
  l'ancien comportement par défaut tant que je n'ai pas validé.
- Garde les anciennes routes et URL en redirection plutôt que de les supprimer.
- Migrations SQL : nouveaux fichiers dans clinic/database/, idempotentes (IF NOT EXISTS),
  avec la reprise des données existantes. Ne les applique pas toi-même : donne-les-moi,
  avec l'ordre d'application et les requêtes de vérification.

Vérifications obligatoires en fin de lot
- Backend : clinic/.venv/Scripts/python.exe -m pytest clinic/tests (tous verts, nouveaux
  tests pour ce que tu as écrit).
- Frontend (dans frontend/) : npx tsc --noEmit, npm run lint, npm run build. Pas d'erreur
  nouvelle par rapport à l'état de départ (compte-les avant de commencer).
- Scénarios de non-régression à dérouler (manuellement ou par script) et à cocher :
  1. Invité : chat d'accueil, une procédure générée, rien d'enregistré.
  2. Compte libre : conversations et projets personnels, aucun accès au référentiel.
  3. Membre : Studio, joindre un PDF → proposition → générer 2 → onglets.
  4. Membre : modifier une procédure par le chat → tableau et BPMN à jour.
  5. Membre : Enregistrer, puis Soumettre pour vérification.
  6. Espace de travail : ouvrir une procédure, utiliser le chat de ProcedureEditor.
  7. Étanchéité : un membre de l'organisation A ne voit, par aucune route, une procédure,
     une campagne, une tâche ou un compte de l'organisation B.
  8. Connexion, déconnexion, mot de passe oublié.

Livraison
- Ne commite pas et ne pousse pas sans mon accord.
- Rapport final : ce qui a changé (fichiers), résultats des vérifications (sortie réelle),
  ce qui n'a pas pu être vérifié, migrations SQL à appliquer dans l'ordre, drapeaux ajoutés
  et leur valeur par défaut, points à décider.
```

---

## Prompt 1 — Socle : organisations, appartenance, contrôle d'accès par organisation

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les.

Contexte vérifié
- processMate n'a qu'une organisation implicite : toutes les tables métier sont communes
  (workflows, process_taxonomy, formalization_campaigns, campaign_procedures,
  procedure_tasks, procedure_assignments, irritants, tools…, specifications, jira_links,
  process_maps, procedure_versions…).
- Les droits viennent de user_profiles.global_role (admin, process_owner, validator,
  contributor, viewer) et user_profiles.status (active, invited, suspended).
- clinic/manager/access_control.py classe chaque route /api (PUBLIC, GUEST, USER, MEMBER,
  rôles). MEMBER veut dire aujourd'hui « status = active ». AUTH_MODE = report | enforce.
- GET /api/me (clinic/routers/account_router.py) renvoie les droits ;
  frontend/src/context/AuthContext.tsx les expose (access) ; MemberGuard protège
  l'orchestration ; /admin gère les comptes.
- Les projets d'une campagne (projects.campaign_id) calculent leurs droits depuis la
  campagne (clinic/manager/project_store.py).

Tâches
1. Modèle (migration à me soumettre, rien d'appliqué)
   - organisations : id, nom, slug unique, statut (active, suspendue), créée par, dates.
   - organisation_members : organisation_id, user_id UNIQUE (une personne = une
     organisation), rôle d'organisation (admin, pilote, contributeur, lecteur), statut
     (active, invitee, suspendue), dates.
   - platform_admins : user_id (super-admins processMate). Ils ne sont membres d'aucune
     organisation.
   - Reprise : crée UNE organisation pour les données actuelles (nom à me demander),
     rattache tous les profils actifs avec ce mapping, que tu me fais valider :
     admin → admin ; process_owner → pilote ; validator et contributor → contributeur ;
     viewer → lecteur. Le rôle « validator » disparaît : la validation est portée par le A
     du RACI (prompt 6). Explique-moi l'impact avant de l'appliquer.
   - Ne supprime pas user_profiles.global_role ni status dans ce lot : ils deviennent
     obsolètes (commentaire SQL), retirés plus tard.
2. Contrôle d'accès
   - access_control : le profil chargé devient l'appartenance (organisation_id, rôle,
     statut) ; MEMBER = membre actif d'une organisation active. Les rôles des règles
     passent au vocabulaire d'organisation (admin, pilote…). Ajoute un niveau PLATFORM
     (super-admin) pour la console du prompt 3.
   - Pose l'organisation de l'appelant dans le contexte de la requête (request.state +
     une dépendance FastAPI current_org() réutilisable par les routeurs). Jamais depuis un
     paramètre du client.
   - Organisation suspendue → 403 explicite pour tous ses membres, sauf /api/me.
   - /api/me renvoie : organisation (id, nom), rôle, droits dérivés (is_org_admin,
     can_manage_campaigns, read_only, is_platform_admin).
3. Frontend
   - AuthContext.access : organisation et nouveaux droits ; nom de l'organisation affiché
     dans la barre latérale du chat et l'orchestration.
   - MemberGuard et la page /admin suivent les nouveaux droits. Le compte libre (sans
     organisation) garde exactement le comportement actuel.
4. Journal d'audit
   - Table audit_log (organisation_id nullable, acteur, action, cible, détails JSON, date)
     et une fonction unique audit(...) côté backend, utilisée dès ce lot pour les
     changements de rôle et de statut.

Tests à ajouter
- Règles : membre actif / invité / suspendu ; organisation suspendue ; super-admin sans
  accès aux routes MEMBER ; compte libre limité à USER.
- Reprise : script de vérification du mapping des rôles (sur une base simulée).
```

---

## Prompt 2 — Cloisonnement de toutes les données + tests d'étanchéité

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Le prompt 1 est fait : organisations, current_org(),
audit_log.

Contexte vérifié
- Une trentaine de routeurs dans clinic/routers/ interrogent Supabase directement
  (get_supabase().table(...)). Les plus gros : orchestration_router.py,
  orchestration_tasks_router.py, campaigns_router.py, taxonomy_router.py,
  tools_router.py, irritants_router.py, analysis_router.py, specifications_router.py,
  jira_router.py, reports_router.py, versions_router.py, process_generation.py
  (save_workflow) et clinic/database/supabase_client.py.
- bian_scenarios est un catalogue de référence : il reste COMMUN à toutes les
  organisations (lecture seule pour elles).

Tâches
1. Inventaire écrit d'abord : pour chaque table métier, qui la lit et qui l'écrit (fichier,
   fonction, route). Classe chaque table : propre à une organisation, commune (catalogue)
   ou personnelle (conversations, projets).
2. Migration (à me soumettre) : organisation_id NOT NULL sur chaque table « propre à une
   organisation », rempli avec l'organisation reprise au prompt 1, index
   (organisation_id, …) adaptés aux requêtes réelles ; les tables filles peuvent hériter
   du parent si toutes leurs requêtes passent par lui (justifie chaque cas).
   Les références uniques (ex. ref de procédure, slug de taxonomie) deviennent uniques
   PAR organisation.
3. Accès aux données : ne disperse pas des .eq("organisation_id", …) dans 200 requêtes à
   la main sans filet. Crée un accès unique (ex. clinic/database/org_db.py :
   org_table(nom) qui ajoute le filtre en lecture et la valeur en écriture, à partir de
   current_org()) et fais passer toutes les tables propres à une organisation par lui.
   Une lecture par identifiant d'une autre organisation renvoie « introuvable ».
4. Filet : un test qui parcourt le code (grep/AST) et échoue si une table propre à une
   organisation est encore interrogée par get_supabase().table(...) en direct.
5. Comptes : la liste des utilisateurs (/api/orchestration/users, sélecteurs de
   personnes, RACI) ne montre que les membres de l'organisation de l'appelant.
6. Fichiers de stockage : préfixe par organisation pour les fichiers propres à une
   organisation ; conversations et projets personnels inchangés.
7. Projets de campagne : les droits dérivés de la campagne vérifient aussi que la
   personne est membre de l'organisation de la campagne.

Tests à ajouter
- Suite d'étanchéité avec deux organisations simulées A et B : pour chaque route
  métier (liste, lecture par id, modification, suppression), un membre de A n'obtient
  jamais une donnée de B (404 ou liste vide), et ne peut rien écrire dans B.
- Le test de filet du point 4.
```

---

## Prompt 3 — Console plateforme : créer un espace client et le remettre à son admin

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Le prompt 1 est fait (platform_admins, niveau PLATFORM,
audit_log).

Le parcours voulu
- Une organisation demande l'ouverture de son espace (hors application : e-mail, appel).
- Le super-admin ouvre la console, crée l'organisation (nom, slug) et son admin (nom,
  e-mail). L'application crée le compte Supabase de l'admin et produit un LIEN
  D'INVITATION (définir son mot de passe) que le super-admin copie et envoie lui-même.
  Pas d'envoi d'e-mail automatique dans ce lot (option à proposer).
- L'admin de l'organisation ouvre le lien, choisit son mot de passe, arrive dans son
  espace vide, avec un parcours de démarrage (créer la taxonomie, inviter les comptes,
  créer une campagne).

Tâches
1. Backend (routes PLATFORM uniquement, auditées)
   - Lister les organisations : nom, statut, date, admin(s), nombre de membres,
     consommation IA du mois.
   - Créer une organisation + son admin : compte Supabase via l'API d'administration
     (vérifie la doc actuelle de supabase-py : invitation ou lien de type invite/recovery),
     organisation_members (admin, active), lien renvoyé une seule fois. Si l'e-mail a
     déjà un compte dans une autre organisation : refus explicite.
   - Régénérer un lien d'invitation pour l'admin (lien expiré).
   - Suspendre / réactiver une organisation (ses membres perdent l'accès, rien n'est
     supprimé).
   - Consommation IA par organisation : chaque appel au modèle enregistre déjà tâche,
     modèle, temps et jetons (manager/model_manager.py, _log_call) ; enregistre ces
     mesures dans une table ai_usage (organisation_id, jour, tâche, jetons), agrégée par
     jour, sans contenu.
2. Frontend : page /plateforme (protégée PLATFORM), liste + création + fiche
   d'organisation (statut, admins, consommation, lien à régénérer, suspension). Le lien
   s'affiche avec un bouton Copier et l'avertissement qu'il ne sera plus montré.
3. Démarrage de l'espace : à la première connexion d'un admin d'organisation, un écran
   « Bienvenue » avec les 3 premières actions et leur état (fait / à faire).
4. Sécurité : le super-admin n'a AUCUN accès aux routes MEMBER (pas de procédures, pas de
   campagnes clients). Le premier super-admin s'ajoute par SQL (dans la migration, en
   commentaire, avec l'e-mail à me demander).

Tests à ajouter
- Création d'organisation : compte admin, appartenance, audit, refus si e-mail déjà pris.
- Super-admin refusé sur les routes métier ; membre refusé sur les routes plateforme.
- Organisation suspendue : ses membres refusés, les autres non.
```

---

## Prompt 4 — Administration de l'organisation : comptes, rôles, équipes

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Les prompts 1 à 3 sont faits.

Contexte vérifié
- La page frontend/src/app/(processmate)/admin/page.tsx liste les comptes et permet
  d'activer, suspendre et changer le rôle (PATCH /api/orchestration/users/{id}, protégé
  admin, dernier admin protégé, pas de changement de son propre rôle).
- Dans la pratique, l'organisation fournit les identifiants à ses collaborateurs et
  consultants : c'est l'admin de l'organisation qui crée les comptes.

Tâches
1. Comptes (admin d'organisation, audités)
   - Créer un compte : nom, e-mail, poste, service, rôle, équipe(s) → compte Supabase
     + appartenance + lien d'invitation à copier (même mécanisme que le prompt 3).
     Refus explicite si l'e-mail appartient déjà à une autre organisation.
   - Régénérer le lien, suspendre, réactiver, changer de rôle. Garde les protections
     existantes (dernier admin, pas son propre rôle).
   - Retirer quelqu'un de l'organisation : il perd l'accès ; ses procédures, tâches et
     validations restent attribuées à son nom (historique intact). Les tâches ouvertes à
     son nom sont listées pour réaffectation.
   - Les comptes libres déjà inscrits ne peuvent PAS être rattachés par un simple e-mail
     sans action de la personne : propose une solution (lien de rattachement à accepter)
     et attends mon accord.
2. Équipes
   - Tables equipes (organisation_id, nom, responsable) et equipe_membres.
   - Une équipe peut être responsable d'une branche de la taxonomie (process_taxonomy) :
     c'est la valeur par défaut proposée pour le R des procédures de cette branche
     (prompt 5).
3. Rôles d'organisation, et ce qu'ils permettent (à afficher dans l'aide de la page) :
   - admin : comptes, équipes, rôles, paramètres de l'espace, tout le reste ;
   - pilote : créer et piloter des campagnes, affecter, voir tout l'avancement ;
   - contributeur : formaliser, relire et valider ce qui lui est affecté par le RACI ;
   - lecteur : consulter le référentiel publié.
4. Frontend : /admin devient « Administration de l'organisation » avec deux onglets,
   Comptes et Équipes. Responsive, accessible (libellés, focus, aria).

Tests à ajouter
- Création de compte, refus si autre organisation, retrait avec historique conservé,
  équipes (CRUD, rattachement à une branche), droits de chaque rôle.
```

---

## Prompt 5 — Campagnes : emplacements, RACI, sources d'ajout, cycle de vie

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Les prompts 1 à 4 sont faits.

Contexte vérifié
- clinic/database/campaigns_schema.sql : formalization_campaigns (statuts draft, active,
  completed, archived ; le routeur gère aussi blocked et on_hold) et campaign_procedures
  avec procedure_id NOT NULL : une campagne ne peut contenir que des procédures qui
  EXISTENT déjà. C'est le manque principal.
- clinic/routers/campaigns_router.py : stats calculées depuis le cycle de vie des
  workflows (_enrich_campaign), lancement, clôture, synchronisation, rapport Word
  (reports_router.py).
- frontend/src/components/orchestration/CampaignsPanel.tsx : pilotage (1000 lignes),
  ajout de procédures existantes par la taxonomie.
- Une campagne a déjà son projet de travail (projects.campaign_id unique,
  POST /api/projects/for-campaign/{id}) avec la page /projet qui liste « Mes procédures »
  et un bouton « Formaliser » (/?projet=…&procedure=…).
- RACI par procédure : procedure_assignments (raci_role R, A, C, I) dans
  orchestration_router.py ; vue RACI : components/orchestration/RACIMatrix.tsx.
- Le planificateur du Studio (clinic/processor/studio_planner.py, plan_turn) sait
  trouver les procédures d'un document (ex. 5 procédures dans un PPTX d'une diapositive
  par procédure).

Tâches
1. Emplacements (« procédures attendues »)
   - Fais évoluer campaign_procedures en emplacements : procedure_id devient FACULTATIF ;
     ajoute titre, référence, branche de taxonomie, équipe, échéance, statut
     (a_faire, en_cours, soumise, en_relecture, validee, ecartee), notes, origine
     (referentiel, document, bian, analyse, proposition). Migration avec reprise des
     lignes existantes (procedure_id rempli = emplacement déjà relié).
   - Relier un emplacement à une procédure : à la création de la procédure (prompt 6) ou à
     la main (choisir une procédure existante).
2. RACI par emplacement
   - Une seule source de vérité : tant que l'emplacement n'a pas de procédure, le RACI vit
     sur l'emplacement ; quand il est relié, il est porté par procedure_assignments et
     l'emplacement le lit. Écris le transfert et teste-le.
   - Valeurs proposées par défaut : R = équipe responsable de la branche de taxonomie
     (prompt 4) ; A = pilote de la campagne. Modifiable en masse (sélection multiple).
   - Règle : exactement un A par emplacement, au moins un R.
3. Ajouter des emplacements depuis
   - le référentiel (procédures existantes à revoir : sélecteur par taxonomie existant) ;
   - un document : dépôt d'un fichier → plan_turn trouve les procédures → liste à cocher →
     emplacements créés (titre, origine = document, fichier gardé dans les sources du
     projet de la campagne) ;
   - BIAN : domaines de service sans procédure (le calcul de couverture est au prompt 7 ;
     prévois seulement le point d'entrée) ;
   - une saisie libre (titre seul).
   Doublons : prévenir si un titre ou une référence existe déjà dans la campagne ou le
   référentiel.
4. Cycle de vie
   - brouillon (cadrage : périmètre, RACI, échéances) → lancée → (en pause / bloquée) →
     clôturée → archivée. Lancer exige : au moins un emplacement, un R et un A sur chacun,
     une échéance de campagne.
   - Au lancement : création du projet de travail s'il n'existe pas, et des tâches
     « Formaliser » pour chaque R (via le mécanisme de tâches existant ; l'automatisation
     complète est au prompt 7).
   - Seuls admin et pilote créent, lancent, mettent en pause, clôturent ou suppriment.
5. Frontend (CampaignsPanel, à découper en composants si nécessaire)
   - Vue de cadrage : tableau des emplacements (titre, branche, R, A, échéance, statut,
     origine), sélection multiple, actions en masse, boutons « Ajouter depuis… ».
   - Vue de suivi : avancement par statut, par équipe, retards ; filtres.
   - La page /projet de la campagne affiche les emplacements de l'utilisateur (R) avec
     « Formaliser ».

Tests à ajouter
- Emplacement sans procédure, reprise des lignes existantes, transfert du RACI,
  règles de lancement, ajout depuis document (plan_turn simulé), doublons, droits.
```

---

## Prompt 6 — Du chat à la campagne : enregistrer, relire, valider (nom et date)

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Les prompts 1 à 5 sont faits.

Contexte vérifié
- Le chat d'accueil (frontend/src/components/home/ChatHome.tsx) ouvre SttPanel ;
  ?projet= et ?procedure= sont déjà lus. Les conversations sont enregistrées et privées
  (clinic/manager/conversation_store.py).
- Enregistrer dans le référentiel : SttPanel.handleSave → orchestrationApi.createProcedure
  / saveWorkflowData ; chaque enregistrement crée une version
  (clinic/manager/version_store.py, table procedure_versions).
- « Soumettre pour vérification » existe (tâches procedure_tasks, transitions dans
  orchestration_tasks_router.py).

Le parcours voulu
1. Le contributeur (R) ouvre « Formaliser » sur son emplacement. Le chat s'ouvre dans le
   projet de la campagne, RATTACHÉ à cet emplacement (?emplacement=…).
2. Il travaille : le brouillon vit dans la conversation, rien n'est écrit dans le
   référentiel.
3. « Enregistrer dans la campagne » (emplacement présélectionné) : crée la procédure ou
   une nouvelle version, relie l'emplacement, statut → soumise, et déclenche le RACI :
   tâche « Relire » pour chaque C, puis « Valider » pour le A.
4. Relecture : C commente ou renvoie (statut en_relecture → retour à R avec une tâche
   « Corriger »).
5. Validation : le A valide → la version est marquée validée avec le NOM et la DATE de la
   personne qui valide (pas de signature électronique), l'emplacement passe à validee,
   la procédure est publiée dans le référentiel.

Tâches
1. États de version : brouillon (dans la conversation, pas en base), soumise,
   en_relecture, validee, publiee, obsolete. Une version publiée rend la précédente
   obsolète. Ajoute à procedure_versions (ou à une table liée, à justifier) :
   statut, soumise_par/le, validee_par (id + nom figé au moment de la validation)/le,
   commentaire. Le nom est figé : si la personne quitte l'organisation ou change de nom,
   la validation garde le nom d'origine.
2. Droits
   - Seul R (ou le pilote) enregistre une version de l'emplacement ; les autres membres
     passent par des propositions (comme les propositions de l'agent) que R accepte.
   - Seul le A valide. Un A ne valide pas une version qu'il a lui-même soumise, sauf si
     l'admin a activé cette tolérance (paramètre d'organisation, désactivé par défaut).
   - Le pilote suit les statuts ; il ne voit jamais les conversations.
3. Hors campagne : depuis un projet personnel ou une conversation d'un membre, bouton
   « Proposer au référentiel » → file « Procédures proposées » du pilote, qui choisit :
   ajouter à une campagne (crée un emplacement relié), verser au référentiel (le pilote
   devient A), ou refuser avec un motif. Rien n'entre au référentiel sans validation.
4. Interface (composants partagés SttPanel / ProcedureEditor)
   - Bandeau de l'emplacement dans l'éditeur : campagne, statut, R, A, échéance.
   - Bouton principal selon le contexte : « Enregistrer dans la campagne » / « Proposer
     au référentiel » / « Enregistrer » (référentiel direct, réservé aux droits
     existants).
   - Écran de validation : différences avec la version publiée (logic/workflowDiff.ts
     existe), commentaire, bouton « Valider » qui affiche « Validé par <nom> le <date> ».
   - Fiche et export de la procédure : mention « Validée par … le … ».
5. Audit : soumission, renvoi, validation, publication, refus de proposition.

Tests à ajouter
- Parcours complet R → C → A sur base simulée ; nom figé à la validation ; refus de
  validation par quelqu'un d'autre que A ; auto-validation refusée par défaut ;
  proposition hors campagne et ses trois issues ; conversations jamais exposées au
  pilote (aucune route).
```

---

## Prompt 7 — Tâches et points ouverts produits par le processus ; couverture BIAN

```
Lis docs/prompts-organisations.md, sections « Décisions déjà prises » et « Règles
communes », et applique-les. Les prompts 1 à 6 sont faits.

Contexte vérifié
- Tâches : procedure_tasks, commentaires, événements, notifications, transitions
  (clinic/routers/orchestration_tasks_router.py : /tasks/my, /tasks/{id}/transition,
  /notifications…), synchronisation Jira (/tasks/sync-jira).
- Points ouverts : enregistrés dans les métadonnées de la procédure (open_points), relevés
  à la génération (clinic/prompts/open_points_prompt.py) et proposés par l'agent
  (clinic/processor/studio_agent.py) ; panneau frontend
  components/shared/OpenPointsPanel.tsx.
- BIAN : catalogue bian_scenarios (commun) et import de scénario
  (clinic/routers/bian_scenarios_router.py) ; carte components/orchestration/
  BianServiceMap.tsx.

Tâches
1. Tâches produites par les événements (une seule fonction côté backend, appelée par les
   événements, idempotente)
   - Lancement de campagne → « Formaliser » pour R.
   - Soumission → « Relire » pour C ; puis « Valider » pour A.
   - Renvoi → « Corriger » pour R.
   - Point ouvert adressé à quelqu'un → « Répondre » pour cette personne ; sa réponse
     revient dans la procédure (pas dans la conversation de R, qui reste privée) et
     ferme la tâche.
   - Échéance proche (paramètre d'organisation, défaut 3 jours) → relance, une seule fois.
   - Clôture de campagne → tâches ouvertes de la campagne annulées avec motif.
   Les tâches manuelles restent possibles.
2. Une boîte « À faire » unique, toutes campagnes confondues, triée par échéance, avec
   l'origine de chaque tâche et un lien direct vers l'endroit où la faire. Compteur dans
   la barre latérale du chat.
3. Points ouverts : on peut les adresser à une personne ou une équipe de l'organisation ;
   le pilote voit le nombre de points ouverts par emplacement (pas leur conversation).
   Si tu proposes de les sortir des métadonnées vers une table, justifie-le et attends
   mon accord.
4. Notifications : e-mail facultatif (route existante frontend/src/app/api/notify/email)
   pour « Valider », « Répondre » et les relances, désactivable par chaque personne.
5. BIAN
   - Le catalogue reste commun (géré par la plateforme).
   - Correspondance procédure ↔ domaine de service BIAN propre à chaque organisation
     (table à créer, organisation_id), saisie manuelle ou suggérée par l'assistant
     (proposition à accepter, jamais appliquée seule).
   - Carte de couverture : domaines couverts (procédures publiées), en cours (emplacements
     de campagne), non couverts.
   - Depuis les domaines non couverts : « Créer des emplacements » dans une campagne
     (point d'entrée du prompt 5).

Tests à ajouter
- Chaque événement crée la bonne tâche pour la bonne personne, une seule fois ;
  annulation à la clôture ; réponse à un point ouvert ; correspondances BIAN cloisonnées
  par organisation ; couverture calculée sur une base simulée.
```
