"""
« Partir de mes sources » : proposer le référentiel d'une organisation (lot 3 de l'arrivée).

L'administrateur dépose ses sources (cartographie, manuels, présentations, code…) et dit ce
qu'il veut. Le modèle propose une structure Thème › Catégorie › Sous-catégorie, les noms des
procédures rangées dessous, et des remarques (doublons, manques, incohérences, conseils).
La proposition s'affine au fil de la conversation, puis s'applique au référentiel
(taxonomy_router.apply_referential), sans jamais rien supprimer.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_DEPTH = 3
MAX_NODES = 400
MAX_PROCEDURES = 600
REMARK_TYPES = ("doublon", "manque", "incoherence", "conseil")

STRUCTURE_PROMPT = """Tu aides l'administrateur d'une banque à construire le RÉFÉRENTIEL de ses processus dans ProcessMate.
Le référentiel est une arborescence Thème › Catégorie › Sous-catégorie ; sous chaque branche, les NOMS des procédures
(elles seront formalisées plus tard, une par une).

On te donne sa demande, l'historique récent, ses sources (cartographie, manuels, présentations, code…), un résumé du
référentiel actuel de son organisation et, s'il existe, ta proposition précédente.

Règles :
- Appuie-toi sur les sources. Une procédure ne figure que si les sources la décrivent ou la nomment ; si la demande
  te fait en ajouter d'autres, dis-le dans une remarque.
- Si une proposition précédente existe et que le message la corrige (« fusionne… », « ajoute le crédit-bail »,
  « renomme… », « enlève… »), repars d'elle, applique exactement la demande et garde tout le reste.
- Trois niveaux au plus (thème, catégorie, sous-catégorie). Noms courts, en français, sans numérotation.
- Range chaque procédure au niveau le plus précis possible. Nom de procédure = verbe + objet
  (« Ouvrir un compte sur livret », « Traiter une opposition sur carte »).
- Si le référentiel actuel contient déjà un thème ou une catégorie équivalents, reprends EXACTEMENT son nom :
  l'application rangera la proposition dedans au lieu d'en créer un doublon.
- Remarques : de 3 à 8, utiles et concrètes, une phrase chacune. Types : "doublon" (deux procédures ou branches
  qui se recouvrent), "manque" (une procédure attendue pour ce métier, absente des sources — tu peux t'appuyer sur
  les usages bancaires et le paysage BIAN), "incoherence" (rangement ou nom discutable, contradiction entre
  sources), "conseil" (découpage, ordre de formalisation, priorités).
- "reply" : une ou deux phrases naturelles qui résument la proposition (pas de jargon d'interface).

Réponds UNIQUEMENT avec ce JSON :
{
  "reply": "texte",
  "titre": "Référentiel proposé — …",
  "arbre": [
    {"nom": "Thème", "procedures": [], "enfants": [
      {"nom": "Catégorie", "procedures": [], "enfants": [
        {"nom": "Sous-catégorie", "procedures": [{"nom": "Ouvrir un compte sur livret", "source": "fichier, p. 3"}], "enfants": []}
      ]}
    ]}
  ],
  "remarques": [{"type": "manque", "texte": "…"}]
}
"""


def current_summary(max_chars: int = 5000) -> str:
    """Thèmes et catégories du référentiel de l'organisation (pour éviter les doublons)."""
    try:
        from database.supabase_client import get_supabase
        rows = get_supabase().table("process_taxonomy").select("id,parent_id,name,level").execute().data or []
    except Exception as e:  # invité, base indisponible : la proposition se fait sans
        logger.info(f"Référentiel actuel non lu : {str(e)[:100]}")
        return ""
    themes = [r for r in rows if r.get("level") == "theme"]
    lines = []
    for t in themes:
        cats = [r["name"] for r in rows if r.get("parent_id") == t["id"]]
        lines.append(f"- {t['name']} : {', '.join(cats) if cats else '(aucune catégorie)'}")
    text = "\n".join(lines)
    return text[:max_chars] + ("…" if len(text) > max_chars else "")


def _clean_name(value: Any, limit: int = 120) -> str:
    name = re.sub(r"\s+", " ", str(value or "")).strip(" -•.\t")
    name = re.sub(r"^\d+([.)]\d*)*[.)]?\s+", "", name)  # « 1.2 Crédits » → « Crédits »
    return name[:limit]


def clean_tree(nodes: Any, depth: int = 1, budget: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
    """Arbre sûr : 3 niveaux au plus, noms nettoyés, pas de doublon entre frères, tailles bornées.
    Au-delà du 3e niveau, les procédures remontent dans la sous-catégorie."""
    budget = budget if budget is not None else {"nodes": MAX_NODES, "procedures": MAX_PROCEDURES}
    out: List[Dict[str, Any]] = []
    seen: Dict[str, Dict[str, Any]] = {}
    for raw in nodes if isinstance(nodes, list) else []:
        if not isinstance(raw, dict):
            continue
        name = _clean_name(raw.get("nom") or raw.get("name"))
        if not name or budget["nodes"] <= 0:
            continue
        procs = _procedures(raw.get("procedures"), budget)
        children = raw.get("enfants") or raw.get("children") or []
        if depth >= MAX_DEPTH:
            procs += _flatten_procedures(children, budget)
            kids: List[Dict[str, Any]] = []
        else:
            kids = clean_tree(children, depth + 1, budget)
        key = name.lower()
        if key in seen:  # même nom chez deux frères : on les réunit
            seen[key]["procedures"] += procs
            seen[key]["enfants"] += kids
            continue
        budget["nodes"] -= 1
        node = {"nom": name, "procedures": procs, "enfants": kids}
        seen[key] = node
        out.append(node)
    return out


def _procedures(items: Any, budget: Dict[str, int]) -> List[Dict[str, str]]:
    out, seen = [], set()
    for p in items if isinstance(items, list) else []:
        nom = _clean_name(p.get("nom") or p.get("name") if isinstance(p, dict) else p, 200)
        if not nom or nom.lower() in seen or budget["procedures"] <= 0:
            continue
        seen.add(nom.lower())
        budget["procedures"] -= 1
        source = _clean_name(p.get("source"), 200) if isinstance(p, dict) else ""
        out.append({"nom": nom, **({"source": source} if source else {})})
    return out


def _flatten_procedures(nodes: Any, budget: Dict[str, int]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for n in nodes if isinstance(nodes, list) else []:
        if isinstance(n, dict):
            out += _procedures(n.get("procedures"), budget)
            out += _flatten_procedures(n.get("enfants") or n.get("children"), budget)
    return out


def stats(tree: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {"themes": 0, "categories": 0, "sous_categories": 0, "procedures": 0}
    keys = ("themes", "categories", "sous_categories")

    def walk(nodes, depth):
        for n in nodes:
            counts[keys[depth - 1]] += 1
            counts["procedures"] += len(n.get("procedures") or [])
            walk(n.get("enfants") or [], depth + 1)
    walk(tree, 1)
    return counts


def normalize(data: Dict[str, Any]) -> Dict[str, Any]:
    tree = clean_tree(data.get("arbre") or data.get("tree") or [])
    remarks = []
    for r in data.get("remarques") or []:
        if isinstance(r, dict) and str(r.get("texte") or "").strip():
            kind = r.get("type") if r.get("type") in REMARK_TYPES else "conseil"
            remarks.append({"type": kind, "texte": str(r["texte"]).strip()[:400]})
    return {
        "titre": _clean_name(data.get("titre"), 160) or "Proposition de référentiel",
        "arbre": tree,
        "remarques": remarks[:10],
        "stats": stats(tree),
        "reply": str(data.get("reply") or "").strip()[:600],
    }


def build(message: str, files: List[Dict[str, Any]], history: Optional[List[Dict[str, str]]] = None,
          previous: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Appel synchrone (dans asyncio.to_thread) : la proposition normalisée."""
    from google.genai import types
    from manager.model_manager import GeminiModel, generate_content
    from processor.studio_planner import file_to_parts, _parse_json
    ctx = {
        "demande": message or "(aucun message : construire le référentiel à partir des sources)",
        "historique_recent": [{"role": h.get("role"), "contenu": str(h.get("content") or "")[:800]} for h in (history or [])[-6:]],
        "referentiel_actuel": current_summary() or "(vide)",
        "proposition_precedente": {k: previous.get(k) for k in ("titre", "arbre", "remarques")} if previous else None,
    }
    parts: list = [STRUCTURE_PROMPT, "CONTEXTE :\n" + json.dumps(ctx, ensure_ascii=False)]
    for f in files:
        parts.append(f"--- Fichier : {f['filename']} ---")
        parts.extend(file_to_parts(f))
    response = generate_content(
        parts, config=types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"),
        task_name="Proposition de référentiel", models=[GeminiModel.FLASH, GeminiModel.LITE])
    try:
        data = _parse_json(response.text)
    except Exception as e:
        logger.warning(f"⚠️ Proposition de référentiel illisible ({e}) : {(response.text or '')[:200]}")
        data = {}
    return normalize(data)
