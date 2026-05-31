"""
Router FastAPI — Taxonomie des processus
Hiérarchie : Thème → Catégorie → Sous-catégorie → Procédure
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from database.supabase_client import get_supabase

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
async def delete_taxonomy_node(node_id: str):
    """
    Supprime un nœud. La cascade ON DELETE CASCADE supprime
    automatiquement tous les enfants en DB.
    Les procédures liées voient leur taxonomy_id mis à NULL (ON DELETE SET NULL).
    """
    try:
        db = get_supabase()
        # Compter les procédures directement liées
        procs = (
            db.table("workflows")
            .select("id")
            .eq("taxonomy_id", node_id)
            .execute()
            .data or []
        )
        db.table("process_taxonomy").delete().eq("id", node_id).execute()
        return {
            "success": True,
            "detached_procedures": len(procs),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        db = get_supabase()

        # Idempotency check
        existing = (
            db.table("process_taxonomy")
            .select("id")
            .eq("name", "Reference Data")
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
