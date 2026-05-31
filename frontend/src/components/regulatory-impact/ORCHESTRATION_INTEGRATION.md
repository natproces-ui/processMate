# Integration Orchestration - Analyse d'impact IA

Ce module est deja disponible en page autonome via:

```text
/regulatory-impact
```

Pour l'afficher dans l'espace Orchestration existant, ajouter manuellement les changements ci-dessous.

## 1. Ajouter le composant dans `src/app/orchestration/page.tsx`

Ajouter l'import:

```tsx
import RegulatoryImpactWorkspace from '@/components/regulatory-impact/RegulatoryImpactWorkspace';
```

Etendre le type `Tab`:

```tsx
type Tab =
  | 'dashboard'
  | 'procedures'
  | 'pipeline'
  | 'workflow'
  | 'raci'
  | 'validation'
  | 'tasks'
  | 'irritants'
  | 'regulatory-impact'
  | 'applicatifs'
  | 'settings';
```

Ajouter le rendu de section au meme niveau que les autres sections:

```tsx
<div className={section(activeTab === 'regulatory-impact')}>
  <RegulatoryImpactWorkspace />
</div>
```

URL cible apres integration:

```text
/orchestration?tab=regulatory-impact
```

## 2. Ajouter le menu dans `src/components/orchestration/Sidebar.tsx`

Ajouter l'icone dans les imports lucide:

```tsx
FileSearch,
```

Ajouter l'item dans `MENU_ITEMS`, idealement apres `Irritants`:

```tsx
{
  id: 'regulatory-impact',
  label: "Analyse d'impact",
  icon: FileSearch,
  color: 'text-indigo-600'
},
```

## 3. Backend deja branche

Si ce n'est pas deja fait, le routeur backend doit etre inclus dans `clinic/main.py`:

```python
from routers import regulatory_impact_router
app.include_router(regulatory_impact_router.router)
```

## 4. Flux de test

1. Demarrer le backend.
2. Demarrer le frontend.
3. Ouvrir `/regulatory-impact` pour tester la page autonome.
4. Creer une campagne.
5. Coller un texte de loi ou uploader un PDF.
6. Selectionner des procedures.
7. Cliquer sur `Analyser`.
8. Valider/rejeter les impacts proposes.

## 5. Points d'attention

- L'analyse IA appelle `/api/regulatory-impact/campaigns/{id}/analyze`.
- Le backend a besoin de `GOOGLE_API_KEY`.
- Les tables Supabase attendues sont `regulatory_campaigns` et `regulatory_impacts`.
- La transformation en taches utilise `procedure_tasks`; elle necessite des `user_id` valides pour `assigned_by` et `default_assigned_to`.
