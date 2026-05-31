# ProcessMate task orchestration draft

Ces composants sont une base non branchee pour la future couche de suivi:

- `TaskOrchestrationHub`: vue globale admin ou "mes taches" selon l'utilisateur selectionne.
- `ProcedureTaskPanel`: panneau de taches filtre sur une procedure.
- `ActorSwitcher`: simulation de connexion via "agir en tant que" avec role plateforme admin/user.
- `TaskTable`: tableau operationnel des taches, delais et statuts.
- `TaskFormDrawer`: creation manuelle d'une tache.
- `TaskTimeline`: tracabilite d'une tache.
- `NotificationsPanel`: notifications utilisateur, notamment pour les affectations RACI I.

Important:

- Le role plateforme est seulement `admin` ou `user`.
- Le role RACI (`R`, `A`, `C`, `I`) est contextuel: il depend de la procedure et de la tache.
- Un meme utilisateur peut etre `R` sur une procedure, `I` sur une autre, puis `A` ailleurs.

Fichiers lies:

- `frontend/src/lib/orchestrationTasksApi.ts`: types et client API dedie.
- `clinic/routers/orchestration_tasks_router.py`: routeur FastAPI a brancher plus tard.
- `scripts/orchestration_tasks_schema.sql`: brouillon de tables Supabase.

Integration prevue plus tard:

- ajouter une entree `tasks` dans `orchestration/page.tsx`;
- ajouter un item "Suivi des taches" dans `Sidebar.tsx`;
- ajouter un bouton "Gerer les taches" dans `RACIMatrix.tsx` et `ProcedureList.tsx`;
- relier les transitions de taches aux statuts procedure et au hub de validation.
