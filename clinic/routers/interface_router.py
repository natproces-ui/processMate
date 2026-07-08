# routers/interface_router.py
"""
Router pour la détection des interfaces applicatives
depuis un workflow Table1Row[]

Entrée  : POST /api/interfaces/detect → { workflow: Table1Row[] }
Sortie  : { interfaces: [...], resume: {...}, metadata: {...} }
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
import logging

from processor.interface_processor import InterfaceProcessor

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/interfaces",
    tags=["Interfaces Applicatives"]
)

# ─── Modèle d'entrée ───
class InterfaceDetectRequest(BaseModel):
    """
    Reçoit le workflow Table1Row[] tel quel depuis le frontend.
    Aucun champ supplémentaire requis.

    Exemple :
    {
      "workflow": [
        {
          "id": "1",
          "étape": "Début du processus",
          "typeBpmn": "StartEvent",
          "département": "Front Office",
          "acteur": "Client",
          "condition": "",
          "outputOui": "2",
          "outputNon": "",
          "outil": "Portail web"
        },
        ...
      ]
    }
    """
    workflow: List[dict]


# ─── Instance unique du processor (lazy) ───
_processor = None

def _get_processor() -> InterfaceProcessor:
    global _processor
    if _processor is None:
        _processor = InterfaceProcessor()
    return _processor


# ─────────────────────────────────────────────
# ENDPOINT PRINCIPAL
# ─────────────────────────────────────────────

@router.post("/detect")
async def detect_interfaces(request: InterfaceDetectRequest):
    """
    Détecte les interfaces applicatives dans un workflow BPMN.

    ┌─────────────────────────────────────────────────┐
    │  ENTRÉE  (JSON body)                            │
    │  { "workflow": Table1Row[] }                    │
    │                                                 │
    │  Table1Row = {                                  │
    │    id, étape, typeBpmn, département,            │
    │    acteur, condition, outputOui,                │
    │    outputNon, outil                             │
    │  }                                              │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │  SORTIE  (JSON response)                        │
    │  {                                              │
    │    "success": true,                             │
    │    "interfaces": [                              │
    │      {                                          │
    │        "id_interface": "INT-001",               │
    │        "id_tache": "21",                        │
    │        "nom_etape": "Créer le compte",          │
    │        "application_cible": "Core Banking",     │
    │        "description_fonctionnelle": "...",      │
    │        "type_developpement": "Progiciel",       │
    │        "type_flux": "Lecture/Écriture BDD",     │
    │        "sens_flux": "Bidirectionnel",           │
    │        "flux_intra_module": "Non",              │
    │        "flux_vers_CBS": "Oui",                  │
    │        "interface_jetable": "Non",              │
    │        "niveau_confiance": "Confirmée",         │
    │        "champs_a_completer": []                 │
    │      }                                          │
    │    ],                                           │
    │    "resume": {                                  │
    │      "total_interfaces": 5,                     │
    │      "confirmees": 3,                           │
    │      "suggerees": 1,                            │
    │      "incertaines": 1,                          │
    │      "taches_avec_interface": ["21","22","25"], │
    │      "taches_sans_interface": ["3","4","5"]     │
    │    },                                           │
    │    "metadata": {                                │
    │      "model_used": "gemini-2.5-flash",          │
    │      "attempts": 1,                             │
    │      "taches_analysees": 28,                    │
    │      "total_etapes_workflow": 34                │
    │    }                                            │
    │  }                                              │
    └─────────────────────────────────────────────────┘
    """
    try:
        if not request.workflow or len(request.workflow) == 0:
            raise HTTPException(
                status_code=400,
                detail="Le workflow ne peut pas être vide"
            )

        logger.info(
            f"📥 Détection interfaces — "
            f"{len(request.workflow)} étapes reçues"
        )

        result = await _get_processor().detect_interfaces(request.workflow)

        logger.info(
            f"✅ Détection terminée — "
            f"{result['resume']['total_interfaces']} interface(s) trouvée(s)"
        )

        return JSONResponse(content={
            "success": True,
            "interfaces": result["interfaces"],
            "resume": result["resume"],
            "metadata": result["metadata"]
        })

    except ValueError as e:
        logger.error(f"❌ Erreur métier: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")




# ─────────────────────────────────────────────
# ENDPOINT INFO
# ─────────────────────────────────────────────

@router.get("/info")
async def get_info():
    """
    Informations sur le module de détection des interfaces
    """
    return {
        "module": "Interface Applicative Detector",
        "version": "1.0.0",
        "status": "active",
        "ai_model": "Gemini 2.5 Flash",
        "description": "Détecte automatiquement les interfaces applicatives dans un workflow BPMN",
        "input": {
            "endpoint": "POST /api/interfaces/detect",
            "body": {
                "workflow": "Table1Row[] — tableau complet avec id, étape, typeBpmn, département, acteur, condition, outputOui, outputNon, outil"
            }
        },
        "output_fields": {
            "id_interface": "Identifiant unique (INT-001, INT-002...)",
            "id_tache": "ID de la tâche source dans le workflow",
            "nom_etape": "Libellé exact de la tâche",
            "application_cible": "Système applicatif identifié",
            "description_fonctionnelle": "Description métier de l'interface",
            "type_developpement": "Développement Interne | Externe | Progiciel | Inconnu",
            "type_flux": "API REST | Webservice | Flux fichier | Lecture/Écriture BDD | Email | Inconnu",
            "sens_flux": "Sortant | Entrant | Bidirectionnel | Inconnu",
            "flux_intra_module": "Oui | Non | Inconnu",
            "flux_vers_CBS": "Oui | Non | Inconnu",
            "interface_jetable": "Oui | Non | Inconnu",
            "niveau_confiance": "Confirmée | Suggérée | Incertaine",
            "champs_a_completer": "Liste des champs que l'agent n'a pas pu renseigner"
        },
        "confiance_levels": {
            "Confirmée": "Outil explicite + verbe d'échange clair",
            "Suggérée": "Signal moyen (libellé ou acteur) sans outil explicite",
            "Incertaine": "Signal faible, contexte métier uniquement"
        }
    }