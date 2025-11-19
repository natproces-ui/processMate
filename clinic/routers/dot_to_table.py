"""
Router pour l'extraction de fichiers .dot (Graphviz) vers Table1Row[]
Utilise Gemini pour transformer le langage technique en langage métier
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import re
import logging
import json
import os
import google.generativeai as genai
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.warning("⚠️ GOOGLE_API_KEY non définie - l'enrichissement IA sera désactivé")
else:
    genai.configure(api_key=GOOGLE_API_KEY)

router = APIRouter(
    prefix="/api/dot-to-table",
    tags=["DOT Parser"]
)


class DotToTableRequest(BaseModel):
    """Requête pour convertir un fichier .dot en tableau"""
    dotSource: str = Field(..., description="Contenu du fichier .dot (Graphviz)")
    useAI: bool = Field(default=True, description="Utiliser Gemini pour enrichir en langage métier")


class Table1Row(BaseModel):
    """Structure identique à ProcessMate"""
    id: str
    étape: str
    typeBpmn: str = "Task"
    département: str = ""
    acteur: str = ""
    condition: str = ""
    outputOui: str = ""
    outputNon: str = ""
    outil: str = ""


class DotToTableResponse(BaseModel):
    """Réponse avec tableau et métadonnées"""
    success: bool
    rows: List[Table1Row]
    warnings: List[str] = []
    metadata: Optional[Dict[str, Any]] = None


def parse_dot_file(dot_source: str) -> Dict[str, Any]:
    """
    Parse un fichier .dot et extrait les nœuds et arêtes
    
    Returns:
        Dict avec nodes, edges, et metadata
    """
    nodes = {}
    edges = []
    warnings = []
    
    # Nettoyer le contenu
    dot_source = dot_source.strip()
    
    # Extraire le nom du graphe
    graph_name_match = re.search(r'digraph\s+(\w+)\s*\{', dot_source)
    graph_name = graph_name_match.group(1) if graph_name_match else "unnamed"
    
    # Pattern pour les nœuds : node_id [label="Label" shape="box"]
    node_pattern = r'(\w+)\s*\[([^\]]+)\]'
    node_matches = re.finditer(node_pattern, dot_source)
    
    for match in node_matches:
        node_id = match.group(1)
        attributes_str = match.group(2)
        
        # Extraire les attributs
        label_match = re.search(r'label\s*=\s*"([^"]*)"', attributes_str)
        shape_match = re.search(r'shape\s*=\s*"?(\w+)"?', attributes_str)
        
        label = label_match.group(1) if label_match else node_id
        shape = shape_match.group(1) if shape_match else "box"
        
        # Déterminer le type BPMN basé sur la forme ou le label
        bpmn_type = infer_bpmn_type(label, shape, node_id)
        
        nodes[node_id] = {
            "id": node_id,
            "label": label,
            "shape": shape,
            "typeBpmn": bpmn_type
        }
    
    # Pattern pour les arêtes : node1 -> node2 [label="condition"]
    edge_pattern = r'(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?'
    edge_matches = re.finditer(edge_pattern, dot_source)
    
    for match in edge_matches:
        source = match.group(1)
        target = match.group(2)
        attributes_str = match.group(3) if match.group(3) else ""
        
        # Extraire le label de l'arête (condition)
        label_match = re.search(r'label\s*=\s*"([^"]*)"', attributes_str)
        condition = label_match.group(1) if label_match else ""
        
        edges.append({
            "source": source,
            "target": target,
            "condition": condition
        })
    
    # Vérifications
    if not nodes:
        warnings.append("Aucun nœud détecté dans le fichier .dot")
    
    if not edges:
        warnings.append("Aucune arête détectée - le processus n'a pas de flux")
    
    return {
        "graph_name": graph_name,
        "nodes": nodes,
        "edges": edges,
        "warnings": warnings
    }


def infer_bpmn_type(label: str, shape: str, node_id: str) -> str:
    """
    Détermine le type BPMN basé sur le label, la forme ou l'ID
    """
    label_lower = label.lower()
    
    # Détection des événements de début
    if any(keyword in label_lower for keyword in ['début', 'start', 'commencer', 'démarrer', 'initial']):
        return "StartEvent"
    
    # Détection des événements de fin
    if any(keyword in label_lower for keyword in ['fin', 'end', 'terminer', 'terminé', 'clôture', 'succès', 'erreur']):
        return "EndEvent"
    
    # Détection des gateways (décisions)
    if any(keyword in label_lower for keyword in ['?', 'si ', 'if ', 'vérifier', 'check', 'décision', 'choix', 'condition']):
        return "ExclusiveGateway"
    
    if shape in ['diamond', 'rhombus']:
        return "ExclusiveGateway"
    
    # Détection basée sur l'ID
    if node_id.lower().startswith(('start', 'begin', 'debut')):
        return "StartEvent"
    
    if node_id.lower().startswith(('end', 'finish', 'fin', 'sortie')):
        return "EndEvent"
    
    if node_id.lower().startswith(('gateway', 'decision', 'check')):
        return "ExclusiveGateway"
    
    # Par défaut: Task
    return "Task"


def build_table_rows(parsed_data: Dict[str, Any]) -> List[Table1Row]:
    """
    Construit les Table1Row à partir des données parsées
    """
    nodes = parsed_data["nodes"]
    edges = parsed_data["edges"]
    
    # Créer un mapping des outputs pour chaque nœud
    outputs_map = {}
    conditions_map = {}
    
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        condition = edge["condition"]
        
        if source not in outputs_map:
            outputs_map[source] = {"yes": [], "no": []}
        
        # Si l'arête a un label "Non" / "No" / "False", c'est le outputNon
        if condition and any(keyword in condition.lower() for keyword in ['non', 'no', 'false', 'ko', 'échec', 'erreur']):
            outputs_map[source]["no"].append(target)
            if source not in conditions_map:
                conditions_map[source] = ""
        # Sinon, c'est le outputOui
        else:
            outputs_map[source]["yes"].append(target)
            if condition and source not in conditions_map:
                conditions_map[source] = condition
    
    # Construire les lignes
    rows = []
    
    for node_id, node_data in nodes.items():
        # Déterminer les outputs
        outputs = outputs_map.get(node_id, {"yes": [], "no": []})
        output_oui = outputs["yes"][0] if outputs["yes"] else ""
        output_non = outputs["no"][0] if outputs["no"] else ""
        
        # Condition (uniquement pour les gateways)
        condition = ""
        if node_data["typeBpmn"] == "ExclusiveGateway":
            condition = conditions_map.get(node_id, node_data["label"])
        
        row = Table1Row(
            id=node_id,
            étape=node_data["label"],
            typeBpmn=node_data["typeBpmn"],
            département="",
            acteur="",
            condition=condition,
            outputOui=output_oui,
            outputNon=output_non,
            outil=""
        )
        
        rows.append(row)
    
    # Trier les lignes pour avoir un ordre logique (start → tasks → end)
    def sort_priority(row: Table1Row) -> int:
        if row.typeBpmn == "StartEvent":
            return 0
        elif row.typeBpmn == "EndEvent":
            return 100
        else:
            return 50
    
    rows.sort(key=sort_priority)
    
    return rows


async def enrich_with_gemini(rows: List[Table1Row], graph_name: str) -> List[Table1Row]:
    """
    Enrichit le tableau avec Gemini pour transformer le langage technique en métier
    """
    if not GOOGLE_API_KEY:
        logger.warning("⚠️ Gemini non configuré - enrichissement IA ignoré")
        return rows
    
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        # Préparer le contexte pour Gemini
        rows_json = [row.model_dump() for row in rows]
        
        prompt = f"""Tu es un expert en analyse de processus métier. 

Tu dois transformer un processus technique extrait d'un fichier .dot (Graphviz) en langage métier compréhensible.

**NOM DU PROCESSUS**: {graph_name}

**DONNÉES ACTUELLES** (format technique):
{json.dumps(rows_json, indent=2, ensure_ascii=False)}

**TA MISSION**:
1. **Reformuler les étapes** en langage métier clair (sans termes techniques comme "API", "MD5", "POST", "variables")
2. **Identifier le département** responsable (ex: Commercial, KYC, Opérations, Direction, Client)
3. **Identifier l'acteur** précis (ex: Conseiller clientèle, Agent KYC, Manager, Client)
4. **Identifier les outils** métier utilisés (ex: CRM, Système bancaire, Portail client, Email - PAS de termes techniques)
5. **Pour les gateways**, reformuler la condition en question métier simple

**RÈGLES STRICTES**:
- Utilise UNIQUEMENT du vocabulaire métier (finance, banque, relation client)
- INTERDICTION d'utiliser: API, endpoint, MD5, signature, base de données, POST, GET, JSON, variable, fonction, code
- Remplace "Appeler l'API" par "Générer le numéro de compte dans le système"
- Remplace "Vérifier si l'appel API a réussi" par "Vérifier si le compte a été créé"
- Remplace "Enregistrer en base" par "Enregistrer dans le système"
- Les étapes doivent être des actions concrètes (verbe à l'infinitif)
- Garde les IDs et les connexions (outputOui, outputNon) EXACTEMENT comme ils sont
- Ne change PAS les typeBpmn (StartEvent, Task, ExclusiveGateway, EndEvent)

**FORMAT DE RÉPONSE** (JSON strict):
{{
  "rows": [
    {{
      "id": "start",
      "étape": "Début du processus de souscription de compte",
      "typeBpmn": "StartEvent",
      "département": "Commercial",
      "acteur": "Conseiller clientèle",
      "condition": "",
      "outputOui": "rdv",
      "outputNon": "",
      "outil": "CRM"
    }},
    ...
  ]
}}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après."""

        response = model.generate_content(prompt)
        result_text = response.text.strip()
        
        # Nettoyer les balises markdown si présentes
        if result_text.startswith("```json"):
            result_text = result_text.replace("```json", "").replace("```", "").strip()
        elif result_text.startswith("```"):
            result_text = result_text.replace("```", "").strip()
        
        # Parser la réponse
        enriched_data = json.loads(result_text)
        
        # Convertir en Table1Row
        enriched_rows = [Table1Row(**row) for row in enriched_data["rows"]]
        
        logger.info(f"✅ {len(enriched_rows)} lignes enrichies par Gemini")
        return enriched_rows
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ Erreur parsing JSON Gemini: {e}")
        logger.error(f"Réponse brute: {result_text[:500]}")
        return rows
    except Exception as e:
        logger.error(f"❌ Erreur enrichissement Gemini: {str(e)}")
        return rows


@router.post("/", response_model=DotToTableResponse)
async def dot_to_table(request: DotToTableRequest):
    """
    Convertit un fichier .dot (Graphviz) en tableau Table1Row[]
    
    - Parse les nœuds et arêtes
    - Infère les types BPMN (StartEvent, Task, Gateway, EndEvent)
    - Crée les connexions (outputOui, outputNon)
    - **Enrichit avec Gemini** pour transformer en langage métier
    - Retourne un tableau éditable prêt pour la génération BPMN
    """
    try:
        logger.info("📄 Début de l'extraction du fichier .dot")
        
        if not request.dotSource or not request.dotSource.strip():
            raise HTTPException(status_code=400, detail="Le fichier .dot est vide")
        
        # 1. Parser le fichier .dot
        parsed_data = parse_dot_file(request.dotSource)
        
        if not parsed_data["nodes"]:
            raise HTTPException(
                status_code=400,
                detail="Aucun nœud détecté dans le fichier .dot. Vérifiez le format."
            )
        
        # 2. Construire les lignes du tableau (version technique)
        rows = build_table_rows(parsed_data)
        
        logger.info(f"✅ {len(rows)} lignes extraites du fichier .dot")
        
        # 3. Enrichir avec Gemini si demandé
        if request.useAI and GOOGLE_API_KEY:
            logger.info("🤖 Enrichissement avec Gemini...")
            rows = await enrich_with_gemini(rows, parsed_data["graph_name"])
        else:
            logger.info("⏭️ Enrichissement IA ignoré (useAI=False ou API key manquante)")
        
        return DotToTableResponse(
            success=True,
            rows=rows,
            warnings=parsed_data["warnings"],
            metadata={
                "graph_name": parsed_data["graph_name"],
                "nodes_count": len(parsed_data["nodes"]),
                "edges_count": len(parsed_data["edges"]),
                "extracted_at": datetime.now().isoformat(),
                "ai_enrichment": request.useAI and GOOGLE_API_KEY is not None,
                "start_events": sum(1 for r in rows if r.typeBpmn == "StartEvent"),
                "end_events": sum(1 for r in rows if r.typeBpmn == "EndEvent"),
                "gateways": sum(1 for r in rows if r.typeBpmn == "ExclusiveGateway"),
                "tasks": sum(1 for r in rows if r.typeBpmn == "Task")
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'extraction du .dot: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'extraction du fichier .dot: {str(e)}"
        )


@router.get("/info")
async def dot_parser_info():
    """Informations sur le parser .dot"""
    return {
        "module": "DOT to Table1Row Converter with Gemini AI",
        "version": "2.0.0",
        "description": "Convertit les fichiers Graphviz .dot en tableaux BPMN métier avec enrichissement IA",
        "features": [
            "✅ Parse les nœuds et arêtes",
            "✅ Détection automatique des types BPMN",
            "✅ Extraction des conditions (gateways)",
            "✅ Création des flux (outputOui/outputNon)",
            "🤖 Enrichissement Gemini (langage métier)",
            "📋 Identification des départements et acteurs",
            "🔧 Détection des outils métier"
        ],
        "ai_status": {
            "gemini_configured": GOOGLE_API_KEY is not None,
            "model": "gemini-2.0-flash-exp",
            "capabilities": [
                "Reformulation en langage métier",
                "Identification des acteurs et départements",
                "Détection des outils métier",
                "Reformulation des conditions de décision"
            ]
        },
        "workflow": [
            "1. Upload fichier .dot",
            "2. Extraction automatique → Table1Row[] (technique)",
            "3. Enrichissement Gemini → Langage métier",
            "4. Édition manuelle (optionnel)",
            "5. Génération BPMN final"
        ],
        "example_transformation": {
            "before": "Appeler l'API du système central (POST /newid)",
            "after": "Générer le numéro de compte dans le système bancaire"
        }
    }