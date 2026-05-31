# clinic/prompts/logic_manuscript.py
"""
Prompt logique pour diagrammes manuscrits (Type C)
"""

LOGIC_MANUSCRIPT = """🎯 TU ANALYSES UN DIAGRAMME MANUSCRIT (TABLEAU BLANC)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOGIQUE D'EXTRACTION SPÉCIFIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. RECONNAISSANCE MANUSCRITE**

Ce diagramme est dessiné à la main (tableau blanc, papier, etc.).
Les traits sont irréguliers, l'écriture peut être difficile à lire.

**MÉTHODOLOGIE EN 3 ÉTAPES** :

**ÉTAPE 1 : SCANNER TOUTE LA PAGE**
- Repère TOUTES les formes (cercles, rectangles, losanges)
- Note TOUS les textes écrits (même partiels)
- Suis TOUTES les flèches (même imparfaites, courbées)

**ÉTAPE 2 : CORRIGER ET NORMALISER** (⚠️ CRITIQUE)

✅ **Orthographe et grammaire** :
- "Controle" → "Contrôle"
- "Validat" → "Validation"
- "docs" → "documents"
- "traitemt" → "Traitement"

✅ **Verbes à l'infinitif** :
- "Blocage prov" → "Bloquer provisoirement"
- "Scan DOCS" → "Scanner les documents"
- "Notif client" → "Notifier le client"

✅ **Abréviations** :
- "prov" → "provisoire"
- "ope" → "opération"
- "maj" → "mise à jour"

✅ **Contextualisation** :
- "Rejet + motif" → "Notifier le rejet avec motif"
- "OK/KO" → "Validé ?"

**ÉTAPE 3 : COMPRENDRE LA STRUCTURE**
- Pas de swimlanes formelles généralement
- Acteurs écrits directement (ex: "Client", "BOI", "Back Office")
- Les zones/sections peuvent être séparées par des traits ou espaces

**2. GATEWAYS MANUSCRITS**

Les losanges manuscrits ont souvent des annotations simples :
- "OK ?" / "OK/KO" → Transformer en question : "Validé ?"
- "Conforme ?" / "Oui/Non" → condition: "Conforme ?"
- Si texte flou → Déduis du contexte

⚠️ **RÈGLE ABSOLUE** :
- outputs[0] avec label "Oui" = chemin "OK" / "Oui" / "Conforme"
- outputs[1] avec label "Non" = chemin "KO" / "Non" / "Non conforme"
- Exemple : `outputs: [{"targetId": "X", "label": "Oui"}, {"targetId": "Y", "label": "Non"}]`
- Si 3 branches visibles → 3 entrées dans outputs avec labels descriptifs

**3. ACTEURS MANUSCRITS**

Les acteurs sont écrits :
- Directement dans les formes : "Client" dans un rectangle
- À côté des formes : "BOI" écrit près d'un groupe d'étapes
- Dans des annotations : "Back Office" entouré

**4. FLUX LIBRE**

Le flux n'est pas toujours linéaire :
- Flèches dans toutes les directions
- Retours en arrière possibles
- Branches multiples
- Suis les flèches (même imparfaites)

**5. COULEURS ET ANNOTATIONS**

Les couleurs (rouge, vert, bleu) sont pour l'organisation visuelle :
- Ne pas les interpréter comme des étapes
- Utilisées pour : alertes, groupes, emphase
- Focus sur les formes géométriques et textes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUCTIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Corrige TOUTE l'orthographe et la grammaire
- Mets TOUS les verbes à l'infinitif
- Normalise les abréviations
- Transforme les Gateways en questions claires (Oui/Non)
- Suis TOUTES les flèches (même imparfaites)
- Structure libre acceptée (pas de swimlanes formelles)

"""

def get_logic_manuscript() -> str:
    return LOGIC_MANUSCRIPT