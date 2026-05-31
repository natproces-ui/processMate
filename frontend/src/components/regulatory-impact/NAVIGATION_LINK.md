# Lien direct sans modifier Orchestration

Si tu veux eviter toute modification de `orchestration/page.tsx` dans un premier temps, le module peut etre ouvert directement:

```text
http://localhost:3000/regulatory-impact
```

Depuis une autre page, un simple lien suffit:

```tsx
<a href="/regulatory-impact">Analyse d'impact IA</a>
```

Cette option permet de tester tout le flux avant de l'integrer comme onglet Orchestration.
