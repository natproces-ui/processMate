"""
Router FastAPI — Taxonomie des processus
Hiérarchie : Thème → Catégorie → Sous-catégorie → Procédure
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import asyncio
import logging
import uuid

from database.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orchestration", tags=["taxonomy"])

VALID_LEVELS = {"theme", "category", "subcategory"}

# ─── BIAN Service Landscape v4.0 ─────────────────────────────

BIAN_SEED = [
    # ── 1. Données de Référence ────────────────────────────────
    {
        "name": "Données de Référence",
        "categories": [
            {"name": "Tiers", "subcategories": [
                "Gestion des Données Tiers",
                "Profil Client",
            ]},
            {"name": "Agences Externes", "subcategories": [
                "Administration Fournisseur d'Informations",
                "Gestion des Syndicats",
                "Gestion Relations Interbancaires",
                "Gestion Réf. Banques Correspondantes",
                "Gestion Données Banques Correspondantes",
                "Convention Sous-Dépositaire",
                "Agence de Services Produits",
                "Convention Courtier Produits",
                "Convention Prestataire/Fournisseur",
            ]},
            {"name": "Données de Marché", "subcategories": [
                "Opérations Fournisseur d'Informations",
                "Gestion Informations de Marché",
                "Analyse Marchés Financiers",
                "Recherche Marchés Financiers",
                "Modèle Quantitatif",
                "Admin. Commutateur Données de Marché",
                "Ops. Commutateur Données de Marché",
                "Gestion Données Réf. Inst. Financières",
                "Administration Contrepartie",
                "Normes Publiques",
                "Gestion Données Géographiques",
            ]},
            {"name": "Gestion des Produits", "subcategories": [
                "Conception Produit",
                "Combinaison Produits",
                "Déploiement Produit",
                "Formation Produit",
                "Assurance Qualité Produit",
                "Tarification et Remises",
            ]},
        ],
    },

    # ── 2. Ventes & Service Client ────────────────────────────
    {
        "name": "Ventes & Service Client",
        "categories": [
            {"name": "Canaux Spécifiques", "subcategories": [
                "Gestion des Agences",
                "Gestion Centre de Contact",
                "Gestion Réseau d'Agences",
                "Gestion Agence Digitale",
                "Gestion Services Vocaux Avancés",
                "Gestion Réseau GAB",
                "Opérations Centre de Contact",
                "Opérations en Agence",
                "Opérations Agence Digitale",
                "Opérations Services Vocaux Avancés",
                "Opérations Réseau GAB",
                "Gestion Monnaie en Agence",
                "Distribution Monnaie en Agence",
                "Gestion Stock Produits",
                "Distribution Stock Produits",
            ]},
            {"name": "Multi-Canal", "subcategories": [
                "Authentification Tiers",
                "Autorisation de Transaction",
                "Point de Service",
                "Activité Événement Service",
                "Analyse Activité Service",
                "Routage des Contacts",
                "Gestion Session Contact Client",
                "Aide Interactive",
                "Gestion des Contacts",
                "Espace de Travail Client",
            ]},
            {"name": "Gestion Client", "subcategories": [
                "Gestion Relation Client",
                "Éligibilité Produits/Services Client",
                "Accord Client",
                "Accord Produit Commercial",
                "Droits d'Accès Client",
                "Analyse Sensibilités Client",
                "Notation Crédit Client",
                "Portefeuille Client",
                "Recouvrement de Compte",
                "Historique Événements Client",
            ]},
            {"name": "Service Client", "subcategories": [
                "Demande de Service",
                "Gestion des Dossiers Client",
                "Analyse Cause Racine Dossier",
                "Analyse Comportement Client",
                "Dossier Carte",
                "Commande Client",
                "Ordre de Paiement",
            ]},
            {"name": "Marketing", "subcategories": [
                "Développement Commercial",
                "Gestion de la Marque",
                "Publicité",
                "Événements Promotionnels",
                "Gestion Campagne Prospects",
                "Conception Campagne Prospects",
                "Gestion Campagne Client",
                "Conception Campagne Client",
                "Enquêtes Client",
            ]},
            {"name": "Ventes", "subcategories": [
                "Exécution Campagne Prospects",
                "Gestion des Prospects",
                "Gestion Leads/Opportunités",
                "Exécution Campagne Client",
                "Offre Client",
                "Planification Commerciale",
                "Souscription",
                "Accord de Commission",
                "Commission",
                "Appariement Produits",
                "Support Expert Vente Produits",
                "Support Commercial Produits",
                "Produit Commercial",
            ]},
        ],
    },

    # ── 3. Opérations & Exécution ─────────────────────────────
    {
        "name": "Opérations & Exécution",
        "categories": [
            # PSF colonne 1
            {"name": "Crédits & Dépôts", "subcategories": [
                "Crédit",
                "Crédit-Bail",
                "Compte Courant",
                "Compte de Dépôt",
                "Compte Courant Entreprise",
            ]},
            {"name": "Cartes", "subcategories": [
                "Carte de Crédit/Débit",
                "Autorisation Carte",
                "Capture Carte",
                "Facturation & Paiements Carte",
                "Relations Commerçants",
            ]},
            {"name": "Services aux Particuliers", "subcategories": [
                "Services Fiduciaires Entreprises",
                "Transfert de Fonds",
                "Change de Devises",
                "Ordres Bancaires & Chèques",
                "Produit Courtage",
                "Investissements Particuliers",
                "Gestion Fiscale Client",
            ]},
            {"name": "Opérations de Marché", "subcategories": [
                "Administration Fonds Communs de Placement",
                "Administration Fonds Alternatifs",
                "Administration Fonds d'Investissement",
                "Appariement Confirmation Opérations",
                "Allocation d'Ordres",
                "Gestion Obligations de Règlement",
                "Gestion Droits & Reçus Titres",
                "Traitement Défauts Titres",
                "Reporting Opérations/Prix",
                "Opérations sur Titres",
                "Évaluation Instruments Financiers",
            ]},
            # PSF colonne 2
            {"name": "Gestion des Investissements", "subcategories": [
                "Planification Portefeuille d'Investissement",
                "Analyse Portefeuille d'Investissement",
                "Gestion Portefeuille d'Investissement",
                "Plateforme eTrading",
            ]},
            {"name": "Trading Corporate", "subcategories": [
                "Supervision Carnet de Trading",
                "Modèles de Trading",
                "Espace de Travail Dealer",
                "Gestion des Cotations",
                "Vérification d'Adéquation",
                "Opérations Risque de Crédit",
                "Tenue de Marché",
                "ECM/DCM",
                "Trading Algorithmique",
                "Gestion Positions Tradées",
                "Ordre de Marché",
                "Exécution Ordre de Marché",
            ]},
            # PSF colonne 3
            {"name": "Banque de Commerce International", "subcategories": [
                "Lettre de Crédit",
                "Garantie Bancaire",
                "Financement du Commerce",
                "Gestion du Crédit",
                "Ligne de Crédit",
                "Financement de Projet",
                "Gestion Limites & Expositions",
                "Crédit Syndiqué",
                "Gestion de Trésorerie & Comptes",
                "Mandat de Prélèvement",
                "Boîte Postale Chèques",
                "Affacturage",
            ]},
            {"name": "Financement & Conseil Entreprises", "subcategories": [
                "Finance d'Entreprise",
                "Conseil Fusions & Acquisitions",
                "Conseil Fiscal Entreprises",
                "Offre Publique",
                "Placement Privé",
                "Modèles de Contribution",
            ]},
            # CPO colonne 1
            {"name": "Paiements", "subcategories": [
                "Exécution des Paiements",
                "Analyse Messages Financiers",
                "Passerelle Messages Financiers",
                "Paiement Banque Correspondante",
                "Traitement des Chèques",
                "Gestion Centrale des Espèces",
            ]},
            {"name": "Gestion des Garanties", "subcategories": [
                "Traitement des Garanties",
                "Administration Actifs en Garantie",
                "Recouvrement",
            ]},
            # CPO colonne 2
            {"name": "Gestion des Comptes", "subcategories": [
                "Tenue de Position",
                "Compte Points de Fidélité",
                "Compte Passerelle Financière",
                "Créances Clients",
                "Réconciliation de Compte",
                "Risque Contrepartie",
                "Gestion des Positions",
                "Détection de Fraude",
                "Moteur de Transaction",
            ]},
            # CPO colonne 3
            {"name": "Services Opérationnels", "subcategories": [
                "Administration Équipements Émis",
                "Suivi Équipements Émis",
                "Décaissement",
                "Gestion Éléments en Suspens",
                "Administration Articles en Crédit-Bail",
                "Relance Client",
                "Facturation Client",
                "Attribution & Échange Points Fidélité",
                "Analyse Activité Canal",
                "Historique Activité Canal",
            ]},
        ],
    },

    # ── 4. Risque & Conformité ────────────────────────────────
    {
        "name": "Risque & Conformité",
        "categories": [
            {"name": "Portefeuille Bancaire & Trésorerie", "subcategories": [
                "Analyse Trésorerie d'Entreprise",
                "Trésorerie d'Entreprise",
                "Titrisation d'Actifs",
                "Gestion Actif/Passif (ALM)",
                "Analyse Portefeuille Bancaire",
                "Administration Portefeuille Bancaire",
                "Prêt de Titres/Repos",
            ]},
            {"name": "Modèles de Risque", "subcategories": [
                "Modèles Risque de Marché",
                "Modèles Valorisation Inst. Financières",
                "Analyse des Écarts",
                "Modèles Risque de Crédit",
                "Modèles Risque de Liquidité",
                "Capital Économique",
                "Modèles Risque Métier",
                "Modèles Comportement Client",
                "Modèles de Fraude",
                "Gestion Crédit/Marge",
                "Modèles Risque de Production",
                "Modèles Risque Opérationnel",
                "Modèles de Contribution",
            ]},
            {"name": "Analyse Métier", "subcategories": [
                "Direction des Segments",
                "Portefeuille Produits",
                "Portefeuille Client",
                "Portefeuille Agences",
                "Portefeuille Canaux",
                "Analyse Concurrentielle",
                "Étude de Marché",
                "Analyse de Marché",
                "Analyse de Contribution",
            ]},
            {"name": "Réglementation & Conformité", "subcategories": [
                "Conformité aux Directives",
                "Conformité Réglementaire",
                "Reporting de Conformité",
                "Reporting Réglementaire",
                "Résolution Fraude/LCB-FT",
                "Comptabilité Financière",
            ]},
        ],
    },

    # ── 5. Fonctions Support ──────────────────────────────────
    {
        "name": "Fonctions Support",
        "categories": [
            # Colonne gauche
            {"name": "Gestion des Systèmes d'Information", "subcategories": [
                "Direction Systèmes d'Information",
                "Normes & Directives SI",
                "Administration des Systèmes",
                "Environnement de Développement",
                "Développement Systèmes",
                "Mise en Production",
                "Déploiement Systèmes",
                "Opérations Systèmes",
                "Opérations Plateforme",
                "Support Systèmes",
                "Assurance Systèmes",
                "Opérations Réseau Interne",
            ]},
            {"name": "Services RH & Entreprise", "subcategories": [
                "Conformité Juridique",
                "Audit Interne",
                "Conseil en Sécurité",
                "Assurance Sécurité",
                "Annuaire Fournisseurs Agréés",
                "Achats",
                "Facturation & Paiements Entreprise",
                "Registre des Immobilisations",
            ]},
            {"name": "Gestion Connaissances & Propriété Intellectuelle", "subcategories": [
                "Manuel de Management",
                "Portefeuille Propriété Intellectuelle",
                "Partage des Connaissances",
            ]},
            {"name": "Bâtiments, Équipements & Installations", "subcategories": [
                "Portefeuille Immobilier",
                "Opérations des Sites",
                "Administration des Sites",
                "Administration des Équipements",
                "Maintenance des Équipements",
                "Administration des Services Généraux",
                "Maintenance des Bâtiments",
            ]},
            {"name": "Relations Institutionnelles", "subcategories": [
                "Communication d'Entreprise",
                "Franchise Relations Entreprises",
                "Relations Entreprises",
                "Autorités Réglementaires & Juridiques",
                "Relations Investisseurs",
            ]},
            {"name": "Pilotage & Contrôle", "subcategories": [
                "Direction d'Entreprise",
                "Direction Organisationnelle",
                "Analyse Financière Unité Métier",
                "Opérations Financières Unité Métier",
                "Comptabilité Unité Métier",
                "Direction Unité Métier",
                "Gestion Unité Métier",
            ]},
            {"name": "Direction Stratégique", "subcategories": [
                "Stratégie d'Entreprise",
                "Politiques d'Entreprise",
                "Direction Produits & Services",
                "Architecture Métier",
                "Plan de Continuité d'Activité",
            ]},
            {"name": "Gestion Documentaire & Archives", "subcategories": [
                "Services Documentaires",
                "Services d'Archivage",
                "Correspondance",
            ]},
            # Colonne droite
            {"name": "Finance", "subcategories": [
                "États Financiers",
                "Contrôle Financier",
                "Conformité Financière",
                "Administration Fiscale d'Entreprise",
            ]},
            {"name": "Gestion des Ressources Humaines", "subcategories": [
                "Direction Politique RH",
                "Affectation des Collaborateurs",
                "Gestion Données Collaborateurs",
                "Contrat Employé/Prestataire",
                "Certification des Collaborateurs",
                "Évaluation des Collaborateurs",
                "Rémunération & Incentives",
                "Voyages & Notes de Frais",
                "Accès Collaborateurs",
                "Avantages Collaborateurs",
                "Formation des Collaborateurs",
                "Recrutement",
            ]},
        ],
    },
]


# ─── Modèles ──────────────────────────────────────────────────

class TaxonomyCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    level: str
    parent_id: Optional[str] = None
    order_index: Optional[int] = 0


class TaxonomyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    parent_id: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_tree(nodes: List[Dict]) -> List[Dict]:
    """Transforme une liste plate en arbre imbriqué."""
    by_id = {n["id"]: {**n, "children": []} for n in nodes}
    roots = []
    for node in by_id.values():
        pid = node.get("parent_id")
        if pid and pid in by_id:
            by_id[pid]["children"].append(node)
        else:
            roots.append(node)
    # Tri par order_index
    def sort_tree(nodes):
        nodes.sort(key=lambda n: n.get("order_index", 0))
        for n in nodes:
            sort_tree(n["children"])
    sort_tree(roots)
    return roots


def _count_procedures(db, node_ids: List[str]) -> Dict[str, int]:
    """Compte les procédures liées à chaque nœud de taxonomie."""
    if not node_ids:
        return {}
    rows = (
        db.table("workflows")
        .select("taxonomy_id")
        .in_("taxonomy_id", node_ids)
        .execute()
        .data or []
    )
    counts: Dict[str, int] = {}
    for r in rows:
        tid = r.get("taxonomy_id")
        if tid:
            counts[tid] = counts.get(tid, 0) + 1
    return counts


# ─── Endpoints ────────────────────────────────────────────────

@router.get("/taxonomy")
async def list_taxonomy(flat: bool = False):
    """Retourne l'arbre complet de taxonomie."""
    try:
        db = get_supabase()
        rows = (
            db.table("process_taxonomy")
            .select("*")
            .order("order_index")
            .execute()
            .data or []
        )
        # Enrichir avec le nombre de procédures
        all_ids = [r["id"] for r in rows]
        counts = _count_procedures(db, all_ids)
        for r in rows:
            r["procedure_count"] = counts.get(r["id"], 0)

        if flat:
            return {"success": True, "nodes": rows}
        return {"success": True, "tree": _build_tree(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Carte « Enchaînement des process » : disposition par thème ───
# (database/process_maps_schema.sql) — positions des procédures et dernière vue,
# enregistrées par le front quand l'utilisateur quitte la carte.

class ProcessMapLayout(BaseModel):
    layout: Dict[str, Any]


@router.get("/taxonomy/{theme_id}/map")
async def get_process_map(theme_id: str):
    try:
        rows = get_supabase().table("process_maps").select("layout, updated_at").eq("theme_id", theme_id).execute().data
        return {"success": True, "layout": rows[0]["layout"] if rows else None,
                "updated_at": rows[0]["updated_at"] if rows else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/taxonomy/{theme_id}/map")
async def save_process_map(theme_id: str, body: ProcessMapLayout):
    try:
        get_supabase().table("process_maps").upsert({
            "theme_id": theme_id, "layout": body.layout,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/taxonomy/{node_id}")
async def get_taxonomy_node(node_id: str):
    """Retourne un nœud avec ses enfants directs."""
    try:
        db = get_supabase()
        row = db.table("process_taxonomy").select("*").eq("id", node_id).execute().data
        if not row:
            raise HTTPException(status_code=404, detail="Nœud introuvable")
        node = row[0]
        children = (
            db.table("process_taxonomy")
            .select("*")
            .eq("parent_id", node_id)
            .order("order_index")
            .execute()
            .data or []
        )
        node["children"] = children
        return {"success": True, "node": node}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/taxonomy")
async def create_taxonomy_node(body: TaxonomyCreate):
    """Crée un nœud de taxonomie."""
    if body.level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail=f"level invalide. Valeurs : {VALID_LEVELS}")
    # Validation parent
    if body.level == "theme" and body.parent_id:
        raise HTTPException(status_code=400, detail="Un thème ne peut pas avoir de parent")
    if body.level == "category" and not body.parent_id:
        raise HTTPException(status_code=400, detail="Une catégorie doit avoir un thème parent")
    if body.level == "subcategory" and not body.parent_id:
        raise HTTPException(status_code=400, detail="Une sous-catégorie doit avoir une catégorie parente")
    try:
        db = get_supabase()
        now = _now()
        node = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "description": (body.description or "").strip(),
            "level": body.level,
            "parent_id": body.parent_id or None,
            "order_index": body.order_index or 0,
            "created_at": now,
            "updated_at": now,
        }
        result = db.table("process_taxonomy").insert(node).execute()
        return {"success": True, "node": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/taxonomy/{node_id}")
async def update_taxonomy_node(node_id: str, body: TaxonomyUpdate):
    """Modifie le nom, la description ou l'ordre d'un nœud."""
    try:
        db = get_supabase()
        updates: Dict[str, Any] = {"updated_at": _now()}
        if body.name is not None:
            updates["name"] = body.name.strip()
        if body.description is not None:
            updates["description"] = body.description.strip()
        if body.order_index is not None:
            updates["order_index"] = body.order_index
        if body.parent_id is not None:
            updates["parent_id"] = body.parent_id
        db.table("process_taxonomy").update(updates).eq("id", node_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/taxonomy/{node_id}")
async def delete_taxonomy_node(node_id: str, procedures: Optional[str] = None):
    """
    Supprime une branche et ses sous-branches. Ses procédures ne restent jamais orphelines
    (« Non classées ») : sans ?procedures=supprimer, la suppression est refusée tant que la
    branche en contient ; avec, elles sont supprimées avec elle — seulement si elles sont
    vides et hors campagne (une procédure rédigée se déplace d'abord).
    """
    db = get_supabase()
    nodes = db.table("process_taxonomy").select("id,parent_id").execute().data or []
    subtree, frontier = {node_id}, [node_id]
    while frontier:
        nxt = [n["id"] for n in nodes if n.get("parent_id") in frontier and n["id"] not in subtree]
        subtree.update(nxt)
        frontier = nxt
    procs = [w for w in db.table("workflows").select("id,title,session_id,taxonomy_id,workflow_json").execute().data or []
             if w.get("taxonomy_id") in subtree]
    if procs and procedures != "supprimer":
        raise HTTPException(409, f"Cette branche contient {len(procs)} procédure{'s' if len(procs) > 1 else ''}.")
    if procs:
        in_camp = {s["procedure_id"] for s in db.table("campaign_procedures").select("procedure_id").execute().data or []}
        kept = [w["title"] for w in procs if (w.get("workflow_json") or []) or w["id"] in in_camp]
        if kept:
            names = ", ".join(f"« {t} »" for t in kept[:5]) + ("…" if len(kept) > 5 else "")
            raise HTTPException(409, f"{len(kept)} procédure{'s' if len(kept) > 1 else ''} rédigée{'s' if len(kept) > 1 else ''} "
                                     f"ou en campagne ({names}) : déplacez-les ou supprimez-les d'abord.")
        from routers.orchestration_router import _delete_procedure_cascade
        for w in procs:
            _delete_procedure_cascade(w["session_id"])
    ids = list(subtree)
    for i in range(0, len(ids), 200):  # sous-branches comprises (la base le fait aussi en cascade)
        db.table("process_taxonomy").delete().in_("id", ids[i:i + 200]).execute()
    return {"success": True, "procedures_supprimees": len(procs), "branches_supprimees": len(ids)}


# ─── Migration données existantes ─────────────────────────────

@router.post("/taxonomy/migrate")
async def migrate_existing_categories(
    theme_name: str = "Thème Opérationnel ou Métier",
    category_name: str = "Gestion des opérations à l'international",
):
    """
    Migration one-shot : crée Thème → Catégorie → Sous-catégories
    depuis les valeurs existantes du champ 'category' des procédures,
    puis lie chaque procédure à sa sous-catégorie via taxonomy_id.
    """
    try:
        db = get_supabase()
        now = _now()
        created: Dict[str, Any] = {"theme": None, "category": None, "subcategories": []}

        # 1. Créer le Thème
        theme_id = str(uuid.uuid4())
        db.table("process_taxonomy").insert({
            "id": theme_id, "name": theme_name, "level": "theme",
            "description": "", "parent_id": None, "order_index": 0,
            "created_at": now, "updated_at": now,
        }).execute()
        created["theme"] = theme_name

        # 2. Créer la Catégorie
        cat_id = str(uuid.uuid4())
        db.table("process_taxonomy").insert({
            "id": cat_id, "name": category_name, "level": "category",
            "description": "", "parent_id": theme_id, "order_index": 0,
            "created_at": now, "updated_at": now,
        }).execute()
        created["category"] = category_name

        # 3. Récupérer toutes les procédures et grouper par category
        workflows = (
            db.table("workflows")
            .select("id, procedure_metadata_json")
            .execute()
            .data or []
        )

        subcat_map: Dict[str, str] = {}  # category_name → subcategory_id
        idx = 0
        for wf in workflows:
            meta = wf.get("procedure_metadata_json") or {}
            cat_val = (
                meta.get("category")
                or meta.get("pole")
                or meta.get("direction")
                or "Non classé"
            )
            if cat_val not in subcat_map:
                sub_id = str(uuid.uuid4())
                db.table("process_taxonomy").insert({
                    "id": sub_id, "name": cat_val, "level": "subcategory",
                    "description": "", "parent_id": cat_id,
                    "order_index": idx, "created_at": now, "updated_at": now,
                }).execute()
                subcat_map[cat_val] = sub_id
                created["subcategories"].append(cat_val)
                idx += 1

        # 4. Lier chaque procédure à sa sous-catégorie
        linked = 0
        for wf in workflows:
            meta = wf.get("procedure_metadata_json") or {}
            cat_val = (
                meta.get("category")
                or meta.get("pole")
                or meta.get("direction")
                or "Non classé"
            )
            sub_id = subcat_map.get(cat_val)
            if sub_id:
                db.table("workflows").update(
                    {"taxonomy_id": sub_id}
                ).eq("id", wf["id"]).execute()
                linked += 1

        return {
            "success": True,
            "created": created,
            "procedures_linked": linked,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Seed BIAN référentiel ────────────────────────────────────

@router.post("/taxonomy/seed-bian")
async def seed_bian_taxonomy(force: bool = False):
    """
    Charge le référentiel BIAN Service Landscape v4.0 dans la taxonomie.
    force=true : supprime les nœuds BIAN existants avant de re-seeder.
    """
    try:
        return seed_bian(force)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def seed_bian(force: bool = False) -> Dict[str, Any]:
    """Référentiel par défaut (structure BIAN) dans la taxonomie de l'organisation courante.
    Aussi appelé à la création d'un espace (dans org_scope de la nouvelle organisation)."""
    db = get_supabase()

    # Déjà chargé ? (un thème du modèle, ou son ancien nom anglais) : jamais de doublon
    bian_names = [t["name"] for t in BIAN_SEED] + ["Reference Data"]
    existing = (
        db.table("process_taxonomy")
        .select("id")
        .in_("name", bian_names)
        .eq("level", "theme")
        .execute()
        .data
    )
    if existing and not force:
        return {
            "success": True,
            "seeded": False,
            "message": "BIAN taxonomy already seeded",
            "themes_created": 0,
            "categories_created": 0,
            "subcategories_created": 0,
        }

    # If force, delete existing BIAN themes (cascade deletes categories + subcategories)
    if existing and force:
        bian_names = [t["name"] for t in BIAN_SEED]
        bian_theme_ids = (
            db.table("process_taxonomy")
            .select("id")
            .in_("name", bian_names)
            .eq("level", "theme")
            .execute()
            .data
        )
        for row in bian_theme_ids:
            db.table("process_taxonomy").delete().eq("id", row["id"]).execute()

    now = _now()
    theme_rows: List[Dict] = []
    cat_rows: List[Dict] = []
    subcat_rows: List[Dict] = []

    for ti, theme_data in enumerate(BIAN_SEED):
        theme_id = str(uuid.uuid4())
        theme_rows.append({
            "id": theme_id,
            "name": theme_data["name"],
            "level": "theme",
            "description": "BIAN v4.0 Domain",
            "parent_id": None,
            "order_index": ti,
            "created_at": now,
            "updated_at": now,
        })

        for ci, cat_data in enumerate(theme_data["categories"]):
            cat_id = str(uuid.uuid4())
            cat_rows.append({
                "id": cat_id,
                "name": cat_data["name"],
                "level": "category",
                "description": "",
                "parent_id": theme_id,
                "order_index": ci,
                "created_at": now,
                "updated_at": now,
            })

            for si, subcat_name in enumerate(cat_data["subcategories"]):
                subcat_rows.append({
                    "id": str(uuid.uuid4()),
                    "name": subcat_name,
                    "level": "subcategory",
                    "description": "",
                    "parent_id": cat_id,
                    "order_index": si,
                    "created_at": now,
                    "updated_at": now,
                })

    db.table("process_taxonomy").insert(theme_rows).execute()
    db.table("process_taxonomy").insert(cat_rows).execute()
    db.table("process_taxonomy").insert(subcat_rows).execute()

    return {
        "success": True,
        "seeded": True,
        "themes_created": len(theme_rows),
        "categories_created": len(cat_rows),
        "subcategories_created": len(subcat_rows),
    }


# ─── Référentiel de l'organisation : état, partir de rien, référentiel par défaut ───
# (page d'accueil de l'organisation, pour l'admin et le pilote)

DEFAULT_THEME_NAMES = {t["name"] for t in BIAN_SEED} | {"Reference Data", "Sales & Service", "Operations & Execution",
                                                       "Risk & Compliance", "Business Support"}


def referential_state() -> Dict[str, Any]:
    db = get_supabase()
    nodes = db.table("process_taxonomy").select("id,name,level").execute().data or []
    ids = {n["id"] for n in nodes}
    wfs = db.table("workflows").select("id,taxonomy_id,workflow_json").execute().data or []
    slots = db.table("campaign_procedures").select("id,taxonomy_id").execute().data or []
    camps = db.table("formalization_campaigns").select("id,status").execute().data or []
    themes = [n for n in nodes if n.get("level") == "theme"]
    classees = sum(1 for w in wfs if w.get("taxonomy_id") in ids)
    rangees_campagne = sum(1 for s in slots if s.get("taxonomy_id") in ids)
    if not nodes:
        origine = "vide"
    elif themes and all(t["name"] in DEFAULT_THEME_NAMES for t in themes):
        origine = "defaut"
    else:
        origine = "personnalise"
    return {
        "themes": len(themes),
        "categories": sum(1 for n in nodes if n.get("level") == "category"),
        "sous_categories": sum(1 for n in nodes if n.get("level") == "subcategory"),
        "procedures": len(wfs),
        "procedures_classees": classees,
        "procedures_redigees": sum(1 for w in wfs if w.get("workflow_json")),
        "origine": origine,
        # On ne vide qu'un référentiel où rien n'est encore rangé
        "peut_vider": bool(nodes) and classees == 0 and rangees_campagne == 0,
        "campagnes": {"total": len(camps), "en_cours": sum(1 for c in camps if c.get("status") == "active")},
    }


@router.get("/referentiel/etat")
async def get_referential_state():
    return await asyncio.to_thread(referential_state)


@router.post("/referentiel/vider")
def empty_referential():
    """Partir de rien : supprime la taxonomie, tant qu'aucune procédure ni campagne n'y est rangée."""
    state = referential_state()
    if not state["peut_vider"]:
        raise HTTPException(409, "Des procédures ou des campagnes sont déjà rangées dans ce référentiel : "
                                 "on l'adapte (renommer, supprimer des branches), on ne le vide plus.")
    db = get_supabase()
    ids = [n["id"] for n in db.table("process_taxonomy").select("id").execute().data or []]
    for table, column in (("equipe_branches", "taxonomy_id"), ("process_maps", "theme_id")):
        try:
            db.table(table).delete().in_(column, ids).execute()
        except Exception as e:  # table absente (migration non appliquée)
            logger.info(f"{table} ignorée : {str(e)[:80]}")
    for i in range(0, len(ids), 200):
        db.table("process_taxonomy").delete().in_("id", ids[i:i + 200]).execute()
    return {"supprimes": len(ids), "etat": referential_state()}


@router.post("/referentiel/defaut")
def load_default_referential():
    """Charge le référentiel par défaut (structure BIAN), sans jamais le dupliquer."""
    r = seed_bian()
    return {**r, "etat": referential_state()}


class ApplyReferential(BaseModel):
    arbre: List[Dict[str, Any]]


def _norm_name(text: Optional[str]) -> str:
    import re
    import unicodedata
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def apply_referential(tree: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Applique une proposition de référentiel : les branches de même nom au même endroit sont
    réutilisées, les procédures déjà présentes (même nom) ne sont pas recréées, rien n'est supprimé."""
    from processor.referential_builder import clean_tree, ensure_levels
    from routers.orchestration_router import create_procedure_shell
    tree = ensure_levels(clean_tree(tree))  # toujours thème › catégorie › sous-catégorie
    db = get_supabase()
    nodes = db.table("process_taxonomy").select("id,parent_id,name,level,order_index").execute().data or []
    index = {(n.get("parent_id"), _norm_name(n["name"])): n["id"] for n in nodes}
    order = {}
    for n in nodes:
        order[n.get("parent_id")] = max(order.get(n.get("parent_id"), -1), n.get("order_index") or 0)
    existing_procs = set()
    for w in db.table("workflows").select("title,procedure_metadata_json").execute().data or []:
        existing_procs.add(_norm_name((w.get("procedure_metadata_json") or {}).get("nom") or w.get("title")))
    created = {"themes": 0, "categories": 0, "sous_categories": 0, "procedures": 0}
    reused, skipped = 0, []
    levels = ("theme", "category", "subcategory")
    keys = ("themes", "categories", "sous_categories")
    now = _now()

    def walk(items, parent_id, depth):
        nonlocal reused
        for item in items:
            key = (parent_id, _norm_name(item["nom"]))
            node_id = index.get(key)
            if node_id:
                reused += 1
            else:
                node_id = str(uuid.uuid4())
                order[parent_id] = order.get(parent_id, -1) + 1
                db.table("process_taxonomy").insert({
                    "id": node_id, "name": item["nom"], "level": levels[depth], "description": "",
                    "parent_id": parent_id, "order_index": order[parent_id], "created_at": now, "updated_at": now,
                }).execute()
                index[key] = node_id
                created[keys[depth]] += 1
            for p in item.get("procedures") or []:
                n = _norm_name(p["nom"])
                if n in existing_procs:
                    skipped.append(p["nom"])
                    continue
                create_procedure_shell(p["nom"], None, node_id, created_from="referentiel")
                existing_procs.add(n)
                created["procedures"] += 1
            walk(item.get("enfants") or [], node_id, depth + 1)

    walk(tree, None, 0)
    return {"crees": created, "branches_reprises": reused, "procedures_deja_presentes": skipped,
            "etat": referential_state()}


@router.post("/referentiel/appliquer")
def post_apply_referential(body: ApplyReferential):
    if not body.arbre:
        raise HTTPException(400, "La proposition est vide.")
    return apply_referential(body.arbre)
