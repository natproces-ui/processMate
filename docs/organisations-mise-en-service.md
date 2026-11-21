# Organisations, campagnes, validation — mise en service

Branche `organisations` (7 lots, issus de `docs/prompts-organisations.md`), construite sur
`refonte-chat`. Tout est éteint par défaut : sans les drapeaux, le comportement actuel est
conservé.

## 1. Migrations

Toutes sont dans `clinic/database/`. Les appliquer dans cet ordre, après celles de la
refonte du chat (guest_usage, conversations, projects, procedure_versions).

| # | Fichier | Contenu |
|---|---|---|
| 1 | `organisations_schema.sql` | Organisations, membres, super-admins, journal d'audit, reprise des comptes existants. **Remplacer « Organisation principale » par le vrai nom avant d'appliquer.** |
| 2 | `organisations_cloisonnement.sql` | `organisation_id` sur les 32 tables métier, rempli avec l'organisation reprise. Le fichier **liste** aussi les contraintes d'unicité globales à revoir (messages NOTICE). |
| 3 | `plateforme_schema.sql` | Consommation IA par organisation |
| 4 | `equipes_schema.sql` | Équipes, branches de taxonomie, invitations de rattachement |
| 5 | `campagnes_emplacements.sql` | Procédures attendues, RACI avant rattachement, nouveaux statuts |
| 6 | `circuit_validation.sql` | États de version, validation nom + date, propositions |
| 7 | `taches_bian.sql` | Préférences d'e-mail, correspondances BIAN |
| 8 | `security_lockdown.sql` | Fermeture de la RLS (déjà livrée), **en dernier** |

Après la migration 1, ajouter le premier super-admin à la main. La requête est en
commentaire dans le fichier ; il ne doit être membre d'aucune organisation.

## 2. Drapeaux

| Variable | Où | Effet |
|---|---|---|
| `ORGANISATIONS_ENABLED=true` | backend | Appartenance lue dans `organisation_members`, cloisonnement de toutes les données, console `/plateforme` |
| `AUTH_MODE=enforce` | backend | Refus réels (sinon simple journalisation) |
| `CAMPAIGN_SLOTS_ENABLED=false` | backend | Coupe les emplacements (actifs par défaut) : nouveau lancement, annulation des tâches à la clôture, campagne guidée |
| `NEXT_PUBLIC_CAMPAIGN_SLOTS_ENABLED=false` | frontend | Coupe l’écran des emplacements (actif par défaut) |
| `CRON_TOKEN=<secret>` | backend | Relances par tâche planifiée : `POST /api/taches/relances`, en-tête `X-Cron-Token` |

Ordre conseillé :
1. Appliquer les migrations 1 à 7.
2. Vérifier la reprise (requêtes en fin de fichier).
3. Activer `ORGANISATIONS_ENABLED` avec `AUTH_MODE=report`, puis lire les journaux
   `[accès:report]`.
4. Passer en `AUTH_MODE=enforce`.
5. Activer les emplacements.
6. Appliquer `security_lockdown.sql`.

Retour arrière : `ORGANISATIONS_ENABLED=false`. Le code repasse alors sur l'ancien modèle.

## 3. Réglage Supabase

Ajouter `https://<domaine du frontend>/mot-de-passe/` aux **Redirect URLs**
(Authentication › URL Configuration). C'est la page où arrivent les liens d'invitation et
de réinitialisation.

## 4. Ce que fait chaque lot

1. **Organisations.**
   - Une personne appartient à une seule organisation.
   - Rôles : admin, pilote, contributeur, lecteur.
   - Une organisation peut être suspendue. Le super-admin n'est membre de rien.
   - Journal d'audit.
2. **Cloisonnement.**
   - `get_supabase()` filtre lui-même les 32 tables par l'organisation du compte connecté.
   - Une donnée d'une autre organisation est « introuvable ».
   - Un test échoue si une table est utilisée sans avoir été classée.
3. **Console plateforme.**
   - Crée l'espace et le compte de l'admin, puis donne le lien à transmettre.
   - Suspension, consommation IA du mois.
   - Page `/mot-de-passe` et lien « Mot de passe oublié ».
4. **Administration du client.**
   - Comptes créés avec un lien. Un compte déjà inscrit reçoit une invitation qu'il accepte.
   - Retrait d'un membre en conservant son nom sur l'historique.
   - Équipes et branches de taxonomie.
5. **Campagnes.**
   - Procédures attendues ajoutées depuis le référentiel, un document ou une saisie.
   - RACI à source unique, doublons signalés.
   - Le lancement crée les procédures vides et les tâches « Formaliser ».
6. **Circuit.**
   - R soumet, C relit, A valide.
   - Nom et date enregistrés, version publiée.
   - Pas d'auto-validation, sauf paramètre d'organisation.
   - Propositions au référentiel triées par le pilote.
7. **Tâches.**
   - Points ouverts adressés, réponse inscrite dans la procédure.
   - Relances, compteur « À faire », e-mail désactivable.
   - Couverture BIAN.

## 5. Corrections de sécurité faites au passage

- **Transitions de tâches :** la route faisait confiance à l'`actor_id` envoyé par le
  navigateur. L'acteur est désormais le compte connecté, seul l'assigné (ou un pilote) fait
  avancer une tâche, et seul le A désigné valide.
- **Métadonnées tenues par le serveur :** `validation` et `circuit` ne peuvent plus être
  écrits par l'éditeur. Un enregistrement n'efface plus une réponse à un point ouvert.

## 6. Vérifié / non vérifié

**Vérifié :**
- 199 tests backend. Une base simulée sert pour les deux organisations ; Jira, e-mail et
  Supabase sont interdits en test.
- TypeScript et lint au niveau de départ.
- Build Next : 20 pages, tous drapeaux activés.

**Non vérifié :**
- aucune migration appliquée ;
- aucun parcours dans un navigateur ;
- l'API d'administration Supabase (création de compte, lien) n'a été testée qu'en
  simulation ;
- les fonctions SQL `procedure_link_edges` et `screen_step_usages` ne sont pas cloisonnées.
  En mode organisations, le backend utilise donc son calcul Python, plus lent sur un gros
  référentiel.
