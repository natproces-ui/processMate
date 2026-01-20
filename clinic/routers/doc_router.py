"""
Router pour la génération de documents Word professionnels
Transforme les workflows BPMN en rapports formatés style MEGA HOPEX
Avec système de prévisualisation avant téléchargement
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Literal
import logging
import os
import tempfile
from pathlib import Path

from processor.doc_builder import DocumentBuilder

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/doc",
    tags=["Document Generation"]
)

# ============================================================================
# MODÈLES PYDANTIC
# ============================================================================

class ProcessMetadataModel(BaseModel):
    """Métadonnées globales du processus (Table 0)"""
    nom: str = Field(..., description="Nom du processus", min_length=1, max_length=200)
    version: str = Field(..., description="Version du processus", max_length=20)
    proprietaire: str = Field(..., description="Propriétaire/responsable", max_length=200)
    dateCreation: Optional[str] = Field(None, description="Date de création (ISO format)")
    dateModification: Optional[str] = Field(None, description="Date de dernière modification")

    @validator('nom')
    def validate_nom(cls, v):
        if not v.strip():
            raise ValueError("Le nom du processus ne peut pas être vide")
        return v.strip()


class WorkflowStepModel(BaseModel):
    """Étape du workflow (Table 1)"""
    id: str = Field(..., description="Identifiant unique de l'étape")
    étape: str = Field(..., description="Nom descriptif de l'étape")
    typeBpmn: Literal['StartEvent', 'EndEvent', 'Task', 'ExclusiveGateway'] = Field(
        ..., 
        description="Type BPMN de l'élément"
    )
    département: str = Field(default="", description="Département responsable")
    acteur: str = Field(default="", description="Acteur/rôle responsable")
    condition: str = Field(default="", description="Condition de décision (Gateway uniquement)")
    outputOui: str = Field(default="", description="ID de l'étape suivante (branche Oui)")
    outputNon: str = Field(default="", description="ID de l'étape alternative (branche Non)")
    outil: str = Field(default="", description="Outil/système informatique utilisé")


class EnrichmentModel(BaseModel):
    """Enrichissement documentaire d'une tâche (Table 2)"""
    id_tache: str = Field(..., description="ID de la tâche enrichie (FK vers WorkflowStep.id)")
    descriptif: str = Field(
        default="", 
        description="Description détaillée de la tâche (objectif, inputs, outputs, risques)",
        max_length=2000
    )
    duree_estimee: Optional[str] = Field(
        default="", 
        description="Durée estimée (ex: '15 min', '2h', '1 jour')",
        max_length=50
    )
    frequence: Optional[str] = Field(
        default="", 
        description="Fréquence d'exécution (quotidien, hebdomadaire, à la demande, etc.)",
        max_length=50
    )
    kpi: Optional[str] = Field(
        default="", 
        description="Indicateur de performance (ex: 'Taux d'erreur < 2%')",
        max_length=200
    )


class DocumentOptionsModel(BaseModel):
    """Options de génération du document"""
    include_diagram: bool = Field(default=True, description="Inclure le diagramme BPMN")
    include_enrichments: bool = Field(default=True, description="Inclure les enrichissements détaillés")
    include_annexes: bool = Field(default=True, description="Inclure les annexes (métriques, glossaire)")
    detail_level: Literal['synthesis', 'standard', 'complete'] = Field(
        default='standard',
        description="Niveau de détail du rapport"
    )


class GenerateDocumentRequest(BaseModel):
    """Requête de génération de document Word"""
    metadata: ProcessMetadataModel = Field(..., description="Métadonnées du processus")
    workflow: List[WorkflowStepModel] = Field(..., description="Liste des étapes du workflow", min_items=1)
    enrichments: Dict[str, EnrichmentModel] = Field(
        default={}, 
        description="Enrichissements documentaires par ID de tâche"
    )
    diagram_image: Optional[str] = Field(
        None, 
        description="Image du diagramme BPMN en base64 (data:image/png;base64,...)"
    )
    options: DocumentOptionsModel = Field(
        default_factory=DocumentOptionsModel,
        description="Options de génération"
    )

    @validator('workflow')
    def validate_workflow(cls, v):
        """Valide la cohérence du workflow"""
        if not v:
            raise ValueError("Le workflow ne peut pas être vide")
        
        # Vérifier présence StartEvent et EndEvent
        has_start = any(step.typeBpmn == 'StartEvent' for step in v)
        has_end = any(step.typeBpmn == 'EndEvent' for step in v)
        
        if not has_start:
            raise ValueError("Le workflow doit contenir au moins un StartEvent")
        if not has_end:
            raise ValueError("Le workflow doit contenir au moins un EndEvent")
        
        # Vérifier unicité des IDs
        ids = [step.id for step in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Les IDs des étapes doivent être uniques")
        
        return v

    @validator('diagram_image')
    def validate_diagram_image(cls, v, values):
        """Valide le format de l'image base64"""
        if v and values.get('options', DocumentOptionsModel()).include_diagram:
            if not v.startswith('data:image/png;base64,'):
                raise ValueError("L'image doit être au format 'data:image/png;base64,...'")
            
            # Vérifier que la taille n'est pas excessive (limite à 20MB)
            if len(v) > 20 * 1024 * 1024:
                raise ValueError("L'image est trop volumineuse (>20MB)")
        
        return v


# ============================================================================
# STOCKAGE TEMPORAIRE DES FICHIERS
# ============================================================================

# Stockage en mémoire des fichiers générés (à remplacer par Redis en production)
_temp_files_storage: Dict[str, str] = {}


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/generate")
async def generate_document(request: GenerateDocumentRequest):
    """
    Génère un document Word professionnel et retourne les données de prévisualisation
    
    Args:
        request: Données complètes du processus (métadonnées, workflow, enrichissements, diagramme)
    
    Returns:
        JSON avec preview + download_url
    
    Raises:
        HTTPException 422: Données invalides
        HTTPException 500: Erreur lors de la génération
    """
    logger.info(f"📥 Génération document pour '{request.metadata.nom}' v{request.metadata.version}")
    logger.info(f"   Workflow: {len(request.workflow)} étapes")
    logger.info(f"   Enrichissements: {len(request.enrichments)} tâche(s)")
    logger.info(f"   Diagramme: {'Oui' if request.diagram_image else 'Non'}")
    logger.info(f"   Options: {request.options.dict()}")
    
    try:
        # Créer le builder
        builder = DocumentBuilder()
        
        # Générer le rapport
        file_path = builder.generate_process_report(
            metadata=request.metadata.dict(),
            workflow=[step.dict() for step in request.workflow],
            enrichments={k: v.dict() for k, v in request.enrichments.items()},
            diagram_image=request.diagram_image,
            options=request.options.dict()
        )
        
        if not file_path or not os.path.exists(file_path):
            raise ValueError("Le fichier généré est introuvable")
        
        # Calculer les statistiques pour la prévisualisation
        stats = _calculate_preview_stats(request.workflow, request.enrichments, request.options)
        
        # Générer un ID unique pour ce document
        doc_id = os.path.basename(file_path).replace('.docx', '').replace('processmate_', '')
        
        # Stocker temporairement le chemin du fichier
        _temp_files_storage[doc_id] = file_path
        
        filename = f"Processus_{request.metadata.nom.replace(' ', '_')}_v{request.metadata.version}.docx"
        
        file_size = os.path.getsize(file_path)
        
        logger.info(f"✅ Document généré: {file_path}")
        logger.info(f"   ID: {doc_id}")
        logger.info(f"   Taille: {file_size} bytes")
        
        # Retourner les données de prévisualisation + URL de téléchargement
        return {
            "success": True,
            "document_id": doc_id,
            "filename": filename,
            "file_size": file_size,
            "download_url": f"/api/doc/download/{doc_id}",
            "preview": {
                "metadata": request.metadata.dict(),
                "statistics": stats,
                "sections": _generate_sections_preview(
                    request.workflow, 
                    request.enrichments, 
                    request.options
                )
            }
        }
        
    except ValueError as e:
        logger.error(f"❌ Erreur validation: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur génération document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération du document: {str(e)}")


@router.get("/download/{document_id}")
async def download_document(document_id: str, background_tasks: BackgroundTasks):
    """
    Télécharge un document généré précédemment
    
    Args:
        document_id: ID unique du document
        background_tasks: Gestionnaire de tâches en arrière-plan
    
    Returns:
        FileResponse: Document Word téléchargeable
    
    Raises:
        HTTPException 404: Document introuvable
    """
    logger.info(f"📥 Demande de téléchargement: {document_id}")
    
    file_path = _temp_files_storage.get(document_id)
    
    if not file_path or not os.path.exists(file_path):
        logger.warning(f"⚠️  Document introuvable: {document_id}")
        raise HTTPException(status_code=404, detail="Document introuvable ou expiré")
    
    # Extraire le nom de fichier original
    base_name = os.path.basename(file_path)
    
    # Nettoyer après téléchargement
    background_tasks.add_task(cleanup_file, file_path)
    background_tasks.add_task(lambda: _temp_files_storage.pop(document_id, None))
    
    logger.info(f"✅ Téléchargement lancé: {base_name}")
    
    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=base_name,
        headers={
            "Content-Disposition": f'attachment; filename="{base_name}"'
        }
    )


def cleanup_file(file_path: str):
    """Supprime le fichier temporaire après envoi"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"🗑️  Fichier temporaire supprimé: {file_path}")
    except Exception as e:
        logger.warning(f"⚠️  Impossible de supprimer {file_path}: {str(e)}")


def _calculate_preview_stats(
    workflow: List[WorkflowStepModel], 
    enrichments: Dict[str, EnrichmentModel], 
    options: DocumentOptionsModel
) -> Dict:
    """Calcule les statistiques pour la prévisualisation"""
    actors = set()
    departments = set()
    tools = set()
    
    for step in workflow:
        if step.acteur:
            actors.add(step.acteur)
        if step.département:
            departments.add(step.département)
        if step.outil:
            tools.add(step.outil)
    
    return {
        "total_steps": len(workflow),
        "tasks": sum(1 for s in workflow if s.typeBpmn == 'Task'),
        "gateways": sum(1 for s in workflow if s.typeBpmn == 'ExclusiveGateway'),
        "events": sum(1 for s in workflow if s.typeBpmn in ['StartEvent', 'EndEvent']),
        "actors_count": len(actors),
        "departments_count": len(departments),
        "tools_count": len(tools),
        "enrichments_count": len(enrichments),
        "has_diagram": options.include_diagram,
        "has_enrichments": options.include_enrichments,
        "has_annexes": options.include_annexes
    }


def _generate_sections_preview(
    workflow: List[WorkflowStepModel], 
    enrichments: Dict[str, EnrichmentModel], 
    options: DocumentOptionsModel
) -> List[Dict]:
    """Génère un aperçu des sections du document"""
    sections = [
        {
            "title": "Page de garde",
            "icon": "📄",
            "description": "Métadonnées du processus (nom, version, propriétaire, dates)"
        },
        {
            "title": "Table des matières",
            "icon": "📑",
            "description": "Navigation automatique avec numérotation"
        }
    ]
    
    # Statistiques acteurs/départements
    actors = set(s.acteur for s in workflow if s.acteur)
    departments = set(s.département for s in workflow if s.département)
    
    sections.append({
        "title": "Vue d'ensemble",
        "icon": "📊",
        "description": f"Statistiques clés, {len(actors)} acteur(s), {len(departments)} département(s)"
    })
    
    if options.include_diagram:
        sections.append({
            "title": "Diagramme BPMN",
            "icon": "🖼️",
            "description": "Visualisation haute résolution du processus complet"
        })
    
    sections.append({
        "title": "Description détaillée",
        "icon": "📝",
        "description": f"{len(workflow)} étape(s) documentée(s)"
    })
    
    if options.include_enrichments and enrichments:
        sections.append({
            "title": "Enrichissements documentaires",
            "icon": "💡",
            "description": f"{len(enrichments)} tâche(s) enrichie(s) (descriptif, durée, KPI)"
        })
    
    sections.append({
        "title": "Cartographie des acteurs",
        "icon": "👥",
        "description": "Répartition des rôles et responsabilités"
    })
    
    if options.include_annexes:
        sections.append({
            "title": "Annexes",
            "icon": "📎",
            "description": "Métriques globales, glossaire, liste des outils"
        })
    
    return sections


@router.get("/info")
async def get_info():
    """
    Informations sur le module de génération de documents
    """
    return {
        "module": "Document Generator",
        "version": "1.0.0",
        "status": "active",
        "library": "python-docx",
        "features": [
            "✅ Génération de rapports Word professionnels",
            "✅ Style MEGA HOPEX",
            "✅ Page de garde avec métadonnées",
            "✅ Table des matières automatique",
            "✅ Vue d'ensemble avec statistiques",
            "✅ Diagramme BPMN haute résolution",
            "✅ Description détaillée de chaque étape",
            "✅ Enrichissements documentaires",
            "✅ Cartographie des acteurs",
            "✅ Annexes (métriques, glossaire)",
            "✅ Prévisualisation avant téléchargement"
        ],
        "supported_formats": ["DOCX"],
        "options": {
            "include_diagram": "Inclure le diagramme BPMN (défaut: true)",
            "include_enrichments": "Inclure les enrichissements (défaut: true)",
            "include_annexes": "Inclure les annexes (défaut: true)",
            "detail_level": "synthesis | standard | complete (défaut: standard)"
        },
        "limits": {
            "max_workflow_steps": 200,
            "max_diagram_size": "20MB",
            "max_enrichment_length": "2000 caractères"
        },
        "endpoints": {
            "generate": {
                "method": "POST",
                "path": "/api/doc/generate",
                "description": "Génère un document Word et retourne les données de prévisualisation"
            },
            "download": {
                "method": "GET",
                "path": "/api/doc/download/{document_id}",
                "description": "Télécharge un document généré"
            },
            "info": {
                "method": "GET",
                "path": "/api/doc/info",
                "description": "Informations sur le module"
            },
            "health": {
                "method": "GET",
                "path": "/api/doc/health",
                "description": "Vérification de santé du module"
            }
        }
    }


@router.get("/health")
async def health_check():
    """
    Vérification de santé du module
    """
    try:
        # Tester l'import de python-docx
        from docx import Document
        
        # Tester la création d'un document minimal
        doc = Document()
        doc.add_paragraph("Test")
        
        return {
            "status": "healthy",
            "python_docx": "available",
            "temp_directory": tempfile.gettempdir(),
            "temp_files_count": len(_temp_files_storage)
        }
    except Exception as e:
        logger.error(f"❌ Health check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Module non fonctionnel: {str(e)}")