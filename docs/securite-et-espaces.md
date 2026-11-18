# Sécurité, comptes et espaces de travail

État au 18/11/2026, branche `refonte-chat`.

## Le problème corrigé

Le frontend ne lit aucune table métier directement : tout passe par le backend `clinic`,
qui utilise la clé de service Supabase (elle ignore la RLS). Or ce backend ne vérifiait
presque jamais qui l'appelait :

- les routes métier répondaient sans connexion (procédures, campagnes, utilisateurs…) ;
- `PATCH /api/orchestration/users/{id}` permettait à n'importe qui de se donner le rôle admin ;
- `GET /api/orchestration/users` donnait la liste des e-mails ;
- les politiques RLS `allow_all_authenticated` (campagnes, outils, BIAN, Jira…) laissaient
  tout compte inscrit lire et modifier ces tables directement avec la clé publique ;
- un compte créé depuis l'accueil voyait tout le référentiel de l'organisation.

## Les niveaux d'accès

Toutes les requêtes `/api/*` passent par `clinic/manager/access_control.py`. La table `RULES`
classe chaque route ; une route absente de la table est réservée aux membres.

| Niveau | Qui | Exemples |
|---|---|---|
| Public | tout le monde | `/health` |
| Invité | sans compte, avec les limites invité | chat (`/api/studio/*`), dictée |
| Compte | tout compte connecté | conversations, projets personnels, outils sans base |
| Membre | compte **activé** par un admin (`status = active`) | référentiel, campagnes, orchestration, versions |
| Rôle | membre avec un rôle précis | gestion des comptes (admin) ; créer, lancer, clore ou supprimer une campagne (admin, responsable de processus) |

Le rôle « Lecteur » (`viewer`) est en lecture seule sur l'espace de l'organisation. Il garde
le chat et ses projets.

Un compte créé librement n'est **pas membre**. Il garde le chat, ses conversations et ses
projets. Son travail est conservé dans la conversation, mais il ne peut pas l'enregistrer
dans le référentiel. Un administrateur l'active depuis **Administration › Utilisateurs**
(`/admin`).

Protections qui s'appliquent quel que soit le réglage `AUTH_MODE` :

- seul un admin change un rôle ou un statut ;
- un admin ne peut pas modifier son propre rôle ;
- le dernier admin actif ne peut être ni rétrogradé ni suspendu ;
- un profil pré-créé n'est rattaché par son e-mail que si cet e-mail est confirmé.

## Mise en production, dans cet ordre

1. **Déployer** le backend et le frontend.
   - Le frontend ajoute le jeton à tous les appels (`frontend/src/lib/apiAuth.ts`).
   - Le backend démarre en `AUTH_MODE=report` : il laisse passer et journalise
     `[accès:report] … serait refusé`.
2. **Lire les journaux** du backend pendant un ou deux jours d'usage normal. Chaque ligne
   `serait refusé` est soit un appel légitime oublié dans la table `RULES`, soit un accès
   qui doit effectivement être bloqué.
3. **Vérifier les comptes** dans `/admin`.
   - Seuls les vrais membres de l'organisation doivent être « Actifs ».
   - Il faut au moins un admin actif.
4. **Fermer la porte** : `AUTH_MODE=enforce` sur DigitalOcean.
5. **Appliquer** `clinic/database/security_lockdown.sql`, qui :
   - retire toutes les politiques RLS et ne garde que « chacun lit sa ligne de `user_profiles` » ;
   - empêche un client de modifier un rôle ou un statut ;
   - crée tout profil issu de l'inscription en `viewer` / `invited` ;
   - garde le bucket de fichiers privé.

   Les vérifications à faire ensuite sont en fin de fichier : inscrire un compte de test
   et contrôler qu'il est bien `invited`.

**Retour arrière** : `AUTH_MODE=report` rouvre l'accès immédiatement, sans redéploiement.

La documentation interactive de l'API (`/docs`, `/openapi.json`) est coupée en production.

## Projets et campagnes : qui fait quoi

Les deux se ressemblaient : chacun regroupe du travail autour d'un thème. Ils ne sont pas
fusionnés, chacun garde un rôle unique.

| | Campagne | Projet |
|---|---|---|
| Sert à | dire **ce qu'il faut livrer** | être **l'endroit où l'on travaille** |
| Contient | procédures cibles, responsables, échéances, avancement, cycle de vie | instructions, sources partagées, conversations |
| Niveau | organisation (membres) | personnel, partageable |
| Où | Orchestration › Campagnes | Chat › Projets |

**Le lien** : une campagne a au plus un projet de travail (`projects.campaign_id`, unique).
On l'ouvre par le bouton « Espace de travail » de la campagne ; il est créé à la première
ouverture, avec des instructions préremplies (objectif, échéance).

- **Droits**, calculés depuis la campagne, sans liste de membres à tenir à jour :
  - admin, responsable de processus, coordinateur ou personne affectée à une procédure → éditeur ;
  - autre membre → lecture ;
  - compte non membre → aucun accès.
- **La page du projet** affiche l'avancement de la campagne et « Mes procédures ». Le bouton
  « Formaliser » ouvre le chat dans le projet, sur la procédure du référentiel
  (`/?projet=…&procedure=…`).
- **Les conversations** restent personnelles, comme dans Claude ou ChatGPT. Ce qui est
  partagé : les instructions et les sources du projet.
- **Un projet personnel** ne peut pas se rattacher lui-même à une campagne.

## Vérifié le 18/11/2026

- 124 tests backend (contrôle d'accès, administration des comptes, projets de campagne,
  conversion pour l'API Interactions, etc.).
- Serveur local avec de vrais appels Gemini, en `AUTH_MODE=enforce` :
  - appels sans jeton, ou avec un faux jeton, refusés (401) ;
  - chat invité : génération d'une procédure de 8 étapes ;
  - document PPTX de 5,8 Mo : 5 procédures trouvées via l'API Interactions ;
  - agent : appels d'outils réels, proposition de modification et point ouvert.
- Build Next (18 pages).

**Non vérifié** :

- aucun parcours dans un navigateur ;
- tables `conversations`, `projects`, `procedure_versions` et `guest_usage` absentes
  tant que les migrations ne sont pas appliquées ;
- `security_lockdown.sql` n'a pas été exécuté.
