# clinic/routers/dot_to_table.py
"""
Router DOT to Table - Version BPMN avec Swimlanes correctes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
import logging
import json
import os
from google import genai
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("❌ GOOGLE_API_KEY non définie - module inutilisable")
else:
    client = genai.Client(api_key=GOOGLE_API_KEY)

router = APIRouter(
    prefix="/api/dot-to-table",
    tags=["DOT Parser"]
)


# ============================================================================
# MODÈLES PYDANTIC
# ============================================================================

class DotToTableRequest(BaseModel):
    dotSource: str = Field(..., description="Contenu du fichier .dot (Graphviz)")


class Table1Row(BaseModel):
    id: str
    étape: str
    typeBpmn: str = "Task"
    département: str = ""
    acteur: str = ""
    condition: str = ""
    outputOui: str = ""
    outputNon: str = ""
    outil: str = ""
    actions: str = ""
    
    @field_validator('département', 'acteur', 'condition', 'outputOui', 'outputNon', 'outil', 'actions', mode='before')
    @classmethod
    def convert_none_to_empty(cls, v):
        return "" if v is None else v


class DotToTableResponse(BaseModel):
    success: bool
    rows: List[Table1Row]
    warnings: List[str] = []
    metadata: Optional[Dict[str, Any]] = None


# ============================================================================
# PROMPT INTELLIGENT - BPMN SWIMLANES
# ============================================================================

PROMPT_TEMPLATE = """Tu es un expert en modélisation BPMN métier. Transforme ce fichier Graphviz .dot en tableau de processus BPMN avec swimlanes correctes.

FICHIER .DOT:
```
{dot_source}
```

═══════════════════════════════════════════════════════════════
🏊 SWIMLANES BPMN - RÈGLES STRICTES
═══════════════════════════════════════════════════════════════

En BPMN, ACTEUR = SWIMLANE (la ligne horizontale qui montre QUI fait l'action).

┌─────────────────────────────────────────────────────────────┐
│ DÉPARTEMENT    → Direction/Service organisationnel          │
│ ACTEUR         → Rôle/Poste qui EXÉCUTE (swimlane BPMN)    │
│ OUTIL          → Application/Logiciel UTILISÉ               │
└─────────────────────────────────────────────────────────────┘

📋 DÉPARTEMENT (Structure organisationnelle):
   • Direction RH
   • Direction IT / Informatique
   • Direction Commerciale
   • Direction Financière / Comptabilité
   • Direction Conformité / Risques
   • Direction Opérations
   • Direction Marketing
   • Direction Juridique
   • Service Support / Helpdesk
   
   ⚠️ Le département est STABLE pour plusieurs étapes d'un même processus

👤 ACTEUR (Rôle/Poste - Swimlane BPMN):
   
   🔹 FRONT OFFICE (contact client):
   • Conseiller Commercial
   • Chargé de Clientèle
   • Conseiller Patrimonial
   • Agent d'Accueil
   • Téléconseiller
   
   🔹 BACK OFFICE (traitement):
   • Gestionnaire Back Office
   • Agent de Saisie
   • Comptable
   • Analyste Risques
   • Gestionnaire Conformité
   • Agent Support
   
   🔹 MIDDLE OFFICE (contrôle):
   • Superviseur
   • Manager d'Équipe
   • Responsable Conformité
   • Contrôleur de Gestion
   
   🔹 MANAGEMENT:
   • Directeur Commercial
   • Directeur des Opérations
   • Directeur Financier
   • Responsable de Service
   
   🔹 AUTOMATIQUE (pas humain):
   • Système Automatisé
   • Application
   • Robot / RPA
   
   ⚠️ L'acteur CHANGE selon qui fait l'étape
   ⚠️ Si c'est humain → Poste précis (Conseiller, Gestionnaire, Manager...)
   ⚠️ Si c'est automatique → "Système Automatisé" ou "Application"

🖥️ OUTIL (Application/Logiciel utilisé):
   • CRM Salesforce
   • SAP
   • Oracle Financials
   • Portail Web Interne
   • Microsoft Dynamics
   • Plateforme Bancaire Core
   • Système de Gestion de Documents (GED)
   • Référentiel Produits
   • Base de Données Clients
   • API Service de Numérotation
   • Système de Workflow
   • Suite Office (Excel, Word...)
   
   ⚠️ Toujours préciser le nom de l'application/système
   ⚠️ "API système central" → "Plateforme Bancaire Core" ou "API Gestion Comptes"

═══════════════════════════════════════════════════════════════
📊 EXEMPLES CONCRETS (AVANT/APRÈS)
═══════════════════════════════════════════════════════════════

❌ AVANT (confusion):
- département: "Informatique"
- acteur: "Application"
- outil: "Base de données"

✅ APRÈS (correct):
- département: "Direction IT"
- acteur: "Système Automatisé"
- outil: "API Service de Numérotation"



─────────────────────────────────────────────────────────────

❌ AVANT (confusion):
- département: "Conformité"
- acteur: "Application"
- outil: "Système de conformité"

✅ APRÈS (correct):
- département: "Direction Conformité"
- acteur: "Gestionnaire Conformité"
- outil: "Plateforme de Contrôle Réglementaire"

─────────────────────────────────────────────────────────────

❌ AVANT (confusion):
- département: "Commercial"
- acteur: "Conseiller"
- outil: "Portail web"

✅ APRÈS (correct):
- département: "Direction Commerciale"
- acteur: "Conseiller Commercial"
- outil: "Portail Web Interne - Module Souscription"

═══════════════════════════════════════════════════════════════
🎯 RÈGLES DE TRANSFORMATION
═══════════════════════════════════════════════════════════════

1️⃣ TYPES BPMN:
   • StartEvent → Premier nœud (shape=circle, label "début"/"start")
   • EndEvent → Dernier nœud (shape=circle, label "fin"/"end"/"succès")
   • ExclusiveGateway → shape=diamond OU nœud avec 2 sorties (oui/non)
   • Task → Toute autre action métier

2️⃣ REGROUPEMENT INTELLIGENT:
   
   🎯 REGROUPE si les nœuds consécutifs sont:
   • font la meme action métier globale pour le meme acteur et departement


   
  
   
   ✅ Exemples à regrouper:
   - "Ajouter infos banque" + "Ajouter infos compte" + "Ajouter infos produit"
     → "Collecter les informations du compte"
     → Même acteur: Gestionnaire Back Office
     → Même outil: Système de Gestion Bancaire
   
   ❌ NE REGROUPE PAS si:
   • Changement d'acteur (Front → Back Office)
   • Changement de département
   • Changement d'outil majeur

3️⃣ ÉTAPE (langage métier):
   • Verbes d'action: Saisir, Vérifier, Valider, Générer, Enregistrer, Notifier
   • Supprime le jargon technique
   
   Exemples:
   • "Rechercher produit dans gProduit" → "Rechercher le produit sélectionné"
   • "Appeler API POST /newid" → "Générer le numéro de compte"
   • "Définir profil tiers" → "Définir le profil du client"

4️⃣ ACTIONS (détails concrets):
    • STRING avec retours à la ligne (\\n)
    • Liste à puces des sous-étapes
    • Maximum 2-3 actions par étape
    • FORMAT OBLIGATOIRE : "• Action 1\\n• Action 2\\n• Action 3"
    • Détails précis de l'étape
    • Liste à puces des actions concretes, sans aller a plusieurs aussi dans de vastes details techniques
    • cest comme des sous etapes de l'étape
    • eviter de surcharger

═══════════════════════════════════════════════════════════════
📝 EXEMPLE COMPLET
═══════════════════════════════════════════════════════════════

ENTRÉE .DOT:
```
start [label="Début"];
saisie [label="Saisir infos client"];
recherche [label="Rechercher produit"];
validation [label="Valider éligibilité"];
prep [label="Préparer requête"];
appel_api [label="Appel API génération ID"];
verif_api [label="Vérifier réponse API", shape=diamond];
enregistrement [label="Enregistrer compte"];
notification [label="Notifier client"];
end_ok [label="Fin succès"];
end_ko [label="Fin échec"];

start -> saisie;
saisie -> recherche;
recherche -> validation;
validation -> prep;
prep -> appel_api;
appel_api -> verif_api;
verif_api -> enregistrement [label="Succès"];
verif_api -> end_ko [label="Échec"];
enregistrement -> notification;
notification -> end_ok;
```

SORTIE JSON:
{{
  "rows": [
    {{
      "id": "1",
      "étape": "Démarrer la souscription",
      "typeBpmn": "StartEvent",
      "département": "Direction Commerciale",
      "acteur": "Conseiller Commercial",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "",
      "actions": "Le client initie une demande de souscription de compte"
    }},
    {{
      "id": "2",
      "étape": "Saisir les informations du client",
      "typeBpmn": "Task",
      "département": "Direction Commerciale",
      "acteur": "Conseiller Commercial",
      "condition": "",
      "outputOui": "3",
      "outputNon": "",
      "outil": "CRM Salesforce",
      "actions": "• Saisir l'identité du client\\n• Saisir les coordonnées\\n• Vérifier les pièces justificatives"
    }},
    {{
      "id": "3",
      "étape": "Rechercher le produit sélectionné",
      "typeBpmn": "Task",
      "département": "Direction Commerciale",
      "acteur": "Conseiller Commercial",
      "condition": "",
      "outputOui": "4",
      "outputNon": "",
      "outil": "CRM Salesforce - Module Produits",
      "actions": "Rechercher dans le référentiel le produit correspondant à la demande du client"
    }},
    {{
      "id": "4",
      "étape": "Valider l'éligibilité du client",
      "typeBpmn": "Task",
      "département": "Direction Conformité",
      "acteur": "Gestionnaire Conformité",
      "condition": "",
      "outputOui": "5",
      "outputNon": "",
      "outil": "Plateforme de Contrôle Réglementaire",
      "actions": "• Vérifier les critères d'éligibilité\\n• Contrôler la conformité réglementaire\\n• Valider le profil de risque"
    }},
    {{
      "id": "5",
      "étape": "Préparer la demande de création",
      "typeBpmn": "Task",
      "département": "Direction Opérations",
      "acteur": "Gestionnaire Back Office",
      "condition": "",
      "outputOui": "6",
      "outputNon": "",
      "outil": "Système de Gestion Bancaire",
      "actions": "• Compiler les informations du client\\n• Structurer les données pour l'API\\n• Calculer la signature MD5"
    }},
    {{
      "id": "6",
      "étape": "Générer le numéro de compte",
      "typeBpmn": "Task",
      "département": "Direction IT",
      "acteur": "Système Automatisé",
      "condition": "",
      "outputOui": "7",
      "outputNon": "",
      "outil": "API Service de Numérotation",
      "actions": "Appel automatique à l'API POST /newid pour obtenir un numéro séquentiel unique"
    }},
    {{
      "id": "7",
      "étape": "Vérifier la réussite de la génération",
      "typeBpmn": "ExclusiveGateway",
      "département": "Direction IT",
      "acteur": "Système Automatisé",
      "condition": "Le numéro a-t-il été généré avec succès ?",
      "outputOui": "8",
      "outputNon": "10",
      "outil": "Système de Gestion Bancaire",
      "actions": "Contrôler le statut de la réponse API (success/error)"
    }},
    {{
      "id": "8",
      "étape": "Enregistrer le compte en base",
      "typeBpmn": "Task",
      "département": "Direction Opérations",
      "acteur": "Gestionnaire Back Office",
      "condition": "",
      "outputOui": "9",
      "outputNon": "",
      "outil": "Système de Gestion Bancaire",
      "actions": "• Enregistrer le compte avec son numéro\\n• Générer l'IBAN\\n• Créer les liens Tiers-Compte\\n• Tracer l'événement d'ouverture"
    }},
    {{
      "id": "9",
      "étape": "Notifier le client de la création",
      "typeBpmn": "Task",
      "département": "Direction Commerciale",
      "acteur": "Conseiller Commercial",
      "condition": "",
      "outputOui": "10",
      "outputNon": "",
      "outil": "CRM Salesforce - Module Emailing",
      "actions": "• Envoyer un email de confirmation au client\\n• Fournir les détails du compte (numéro, IBAN)\\n• Informer des prochaines étapes"
    }},
    {{
      "id": "10",
      "étape": "Finaliser la souscription",
      "typeBpmn": "EndEvent",
      "département": "Direction Commerciale",
      "acteur": "Conseiller Commercial",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": "",
      "actions": "La souscription est terminée avec succès"
    }},
    {{
      "id": "11",
      "étape": "Traiter l'échec de génération",
      "typeBpmn": "EndEvent",
      "département": "Service Support",
      "acteur": "Agent Support",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": "Système de Ticketing",
      "actions": "Créer un ticket d'incident pour investigation technique"
    }}
  ]
}}

═══════════════════════════════════════════════════════════════
⚠️ RÈGLES ABSOLUES
═══════════════════════════════════════════════════════════════

✅ DÉPARTEMENT = Direction/Service (Direction RH, Direction IT...)
✅ ACTEUR = Rôle/Poste (Conseiller Commercial, Gestionnaire Back Office, Système Automatisé...)
✅ OUTIL = Application précise (CRM Salesforce, API Service de Numérotation...)
✅ IDs séquentiels (1, 2, 3...)
✅ "" pour champs vides, JAMAIS null
✅ "actions" est TOUJOURS une STRING, JAMAIS un array
✅ Utilise "\\n" pour les retours à la ligne dans actions
✅ Format actions: "• Action 1\\n• Action 2\\n• Action 3"
✅ Regroupe si MÊME acteur + MÊME département + MÊME outil + MÊME action métier
✅ eviter de forcer le regroupement si on voit clairement des contextes differents malgre que meme acteur/departement/outil
✅ Langage métier dans "étape", détails dans "actions"
✅ au niveau de action, maximum 2 ou 3 pour ne pas surcharger
✅ JAMAIS de format ["action1", "action2"] pour actions

Réponds UNIQUEMENT avec le JSON (pas de texte avant/après)."""


# ============================================================================
# GEMINI FAIT TOUT
# ============================================================================

def dot_to_table_with_gemini(dot_source: str) -> List[Table1Row]:
    """Gemini transforme directement le .dot en tableau BPMN"""
    
    if not GOOGLE_API_KEY:
        raise ValueError("Google API Key non configurée")
    
    try:
        prompt = PROMPT_TEMPLATE.format(dot_source=dot_source)
        
        logger.info("🤖 Gemini transforme le .dot en tableau BPMN...")
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        result_text = response.text.strip()
        
        # Nettoyage
        result_text = result_text.replace("```json", "").replace("```", "").strip()
        result_text = result_text.replace(': null', ': ""')
        
        # Parse
        data = json.loads(result_text)
        
        # ✅ POST-TRAITEMENT : Convertir les arrays en strings
        for row in data["rows"]:
            # Si actions est une liste, la convertir en string avec \n
            if isinstance(row.get("actions"), list):
                row["actions"] = "\n".join(f"• {action}" for action in row["actions"])
            
            # Pareil pour d'autres champs si nécessaire
            for field in ['département', 'acteur', 'condition', 'outputOui', 'outputNon', 'outil', 'étape']:
                if isinstance(row.get(field), list):
                    row[field] = "\n".join(row[field])
        
        rows = [Table1Row(**row) for row in data["rows"]]
        
        logger.info(f"✅ {len(rows)} lignes générées par Gemini")
        return rows
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON invalide: {e}")
        logger.error(f"Réponse: {result_text[:500]}")
        raise ValueError(f"Gemini a retourné un JSON invalide: {e}")
    except Exception as e:
        logger.error(f"❌ Erreur Gemini: {e}")
        raise ValueError(f"Erreur lors de la transformation: {e}")


# ============================================================================
# ENDPOINT
# ============================================================================

@router.post("/", response_model=DotToTableResponse)
async def dot_to_table(request: DotToTableRequest):
    """Transforme un fichier .dot en tableau BPMN avec swimlanes correctes"""
    try:
        logger.info("📄 Réception fichier .dot...")
        
        if not request.dotSource or not request.dotSource.strip():
            raise HTTPException(status_code=400, detail="Fichier .dot vide")
        
        if not GOOGLE_API_KEY:
            raise HTTPException(
                status_code=503, 
                detail="Service d'enrichissement IA non configuré (GOOGLE_API_KEY manquante)"
            )
        
        rows = dot_to_table_with_gemini(request.dotSource)
        
        if not rows:
            raise HTTPException(status_code=400, detail="Aucune étape générée")
        
        logger.info(f"✅ {len(rows)} lignes prêtes")
        
        return DotToTableResponse(
            success=True,
            rows=rows,
            warnings=[],
            metadata={
                "extracted_at": datetime.now().isoformat(),
                "rows_count": len(rows),
                "start_events": sum(1 for r in rows if r.typeBpmn == "StartEvent"),
                "end_events": sum(1 for r in rows if r.typeBpmn == "EndEvent"),
                "gateways": sum(1 for r in rows if r.typeBpmn == "ExclusiveGateway"),
                "tasks": sum(1 for r in rows if r.typeBpmn == "Task")
            }
        )
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")


@router.get("/info")
async def dot_parser_info():
    """Informations sur le parser"""
    return {
        "module": "DOT to Table Converter",
        "version": "5.0.0 - BPMN Swimlanes",
        "model": "gemini-2.5-flash",
        "description": "Transformation avec swimlanes BPMN correctes (Département/Acteur/Outil distincts)",
        "swimlanes": {
            "département": "Direction/Service organisationnel (Direction RH, IT, Commercial...)",
            "acteur": "Rôle/Poste qui exécute (Conseiller, Gestionnaire, Manager, Système...)",
            "outil": "Application/Logiciel utilisé (CRM, SAP, API...)"
        },
        "workflow": [
            "1. Upload fichier .dot",
            "2. Gemini analyse les contextes métier",
            "3. Identifie département, acteur (swimlane) et outil",
            "4. Regroupe si même acteur + département + outil",
            "5. Génère tableau BPMN conforme"
        ]
    }