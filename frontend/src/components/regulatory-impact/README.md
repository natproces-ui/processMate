# Regulatory Impact UI

Standalone UI for AI-assisted regulatory impact analysis.

Created files only:

- `src/lib/regulatoryImpactApi.ts`
- `src/components/regulatory-impact/RegulatoryImpactWorkspace.tsx`
- `src/app/regulatory-impact/page.tsx`

Manual backend hook to add when ready:

```python
from routers import regulatory_impact_router
app.include_router(regulatory_impact_router.router)
```

Manual orchestration menu hook to add when ready:

- Add a tab id such as `regulatory-impact`.
- Add a sidebar item pointing to that tab or link directly to `/regulatory-impact`.
- Render `RegulatoryImpactWorkspace` for the new tab.

Before testing the page, run the Supabase SQL script:

`clinic/database/regulatory_impact_schema.sql`
