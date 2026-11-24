"""Matière de la mise à niveau d'un TO BE : les pistes retenues pour son AS IS, avec le constat et les étapes visées.

Le chat s'en sert quand on lui demande de créer le TO BE « à partir des pistes retenues » ou de le mettre à niveau.
Lecture seule, dans l'organisation de l'utilisateur.
"""
from typing import Any, Dict, List

from database.supabase_client import get_supabase


def retained_pistes(asis_id: str) -> List[Dict[str, Any]]:
    """Les pistes « retenue » des défaillances de l'AS IS, chacune avec son axe, son constat et ses étapes."""
    db = get_supabase()
    out: List[Dict[str, Any]] = []
    irritants = db.table("irritants").select("id,titre").eq("procedure_id", asis_id).execute().data or []
    for irr in irritants:
        findings = db.table("findings").select("*").eq("irritant_id", irr["id"]).order("ordre").execute().data or []
        for f in findings:
            pistes = db.table("pistes").select("*").eq("finding_id", f["id"]).order("ordre").execute().data or []
            for p in pistes:
                if (p.get("statut") or "").lower().startswith("retenu"):
                    out.append({"irritant": irr.get("titre") or "", "axe": f.get("categorie") or "",
                                "etapes": f.get("etapes") or [], "constat": f.get("constat") or "",
                                "titre": p.get("titre") or "", "description": p.get("description") or ""})
    return out


def as_material(pistes: List[Dict[str, Any]]) -> str:
    """Les pistes retenues, à la suite de la demande de l'utilisateur."""
    if not pistes:
        return ("\n\n(Aucune piste n'est retenue pour l'AS IS : n'applique que les changements demandés dans ce message ; "
                "s'il n'en demande aucun, dis qu'il faut d'abord retenir des pistes dans « Irritants et pistes ».)")
    lines = ["\n\nMISE À NIVEAU DU TO BE. Le TO BE décrit le fonctionnement cible, pas l'existant :",
             "- change vraiment les étapes quand une piste le demande (acteur, outil, étape ajoutée, supprimée, fusionnée ou "
             "automatisée, contrôle déplacé), pas seulement leurs descriptions ;",
             "- une description du TO BE ne garde rien de ce que la piste supprime (suivi manuel, ressaisie, envoi par mail…) ;",
             "- ce qu'un système fait seul (contrôle, relance, calcul, reprise de données) devient une règle de gestion "
             "(\"regles_gestion_ajout\"), pas une étape ; l'étape garde ce que fait l'équipe (suivre, traiter les exceptions, "
             "valider), avec le système dans \"outil\" ; si l'équipe n'y fait plus rien, l'étape est supprimée. La règle "
             "nomme l'applicatif par son nom exact, celui du champ « outil » ou de la piste (jamais « le système » ni une "
             "périphrase), et dit ce qu'il fait, quand, et pour qui ou sous quelle forme ;",
             "- \"explanation\" : pour cette mise à niveau, une phrase par piste appliquée, qui cite son titre entre guillemets "
             "et dit les étapes changées (jamais un numéro de piste : l'utilisateur ne voit pas cette liste).",
             "",
             "PISTES RETENUES POUR L'AS IS :"]
    for i, p in enumerate(pistes, 1):
        steps = f" (étapes {', '.join(str(e) for e in p['etapes'])})" if p["etapes"] else ""
        lines.append(f"- « {p['titre']} »{steps}. {p['description']}".strip())
        if p["constat"]:
            lines.append(f"   Constat{f', axe {p['axe']}' if p['axe'] else ''} : {p['constat']}")
    return "\n".join(lines)
