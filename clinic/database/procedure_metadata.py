"""
Contrat unique des métadonnées de procédure (workflows.procedure_metadata_json).

Une procédure est écrite par plusieurs chemins (création manuelle, import PDF,
import BIAN, Studio, sauvegarde du tableau). Chacun passe par
normalize_procedure_metadata avant écriture pour que les mêmes champs arrivent
partout sous les mêmes noms.

Règles :
- aucune clé n'est supprimée (les champs inconnus ou futurs sont conservés) ;
- les alias historiques sont synchronisés : l'extraction et l'export utilisent
  `perimeter`, la base et Workspace `perimetre`. Les deux sont écrits avec la
  même valeur pour que chaque lecteur la trouve.
"""
from typing import Any, Dict, Optional

# (nom canonique en base, alias encore lus ailleurs)
_ALIASES = (
    ("perimetre", "perimeter"),
)


def normalize_procedure_metadata(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(meta or {})
    for canonical, alias in _ALIASES:
        value = out.get(canonical) or out.get(alias) or ""
        if value or canonical in out or alias in out:
            out[canonical] = value
            out[alias] = value
    return out
