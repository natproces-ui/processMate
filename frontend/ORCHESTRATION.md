# ProcessMate Orchestration - Back-Office Bancaire

## Lancer l'application

```bash
cd frontend
npm run dev
```

Ouvrir: `http://localhost:3000/orchestration`

## 6 Onglets Disponibles

1. **Tableau de Bord** - KPIs, blocages, performance équipe
2. **Procédures** - Gestion des 4 procédures bancaires (PF, CAU, REF, OC)
3. **Flux de Travail** - Timeline des étapes (Initiation → Approbation)
4. **Responsabilités** - Matrice RACI (7 procédures × 5 personnes)
5. **Validation** - Hub avec erreurs bancaires et corrections
6. **Envois Email** - Système d'envoi automatique avec roadmap complète

## Contexte

- Procédures: Préfinancement, Cautions Douanières, Refinancement, Office des Changes
- Équipe: Karim Al-Mansouri, Nadia Zaoui, Hassan Tabbakh, Youssef Bennani, Fatima Alaoui
- Domaines: Financement CT, Garanties, Change & Trésorerie, Opérations Spéciales
- Palette: Bleu professionnel, gris, blanc (pas de violet)

## Système d'Envoi Automatique

**Flux complet:**
- Procédure finalisée → Envoi auto → Validateur reçoit → Retour d'erreurs → Hub de correction
