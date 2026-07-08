"""
Router pour la génération de documents Word — Format procédure CIH Bank
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Literal, Union, Tuple
from urllib.parse import quote
import logging
import os
import tempfile

from processor.doc_builder import DocumentBuilder

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/doc", tags=["Document Generation"])


# ============================================================================
# MODÈLES
# ============================================================================

class AbbreviationItem(BaseModel):
    abrv: str
    signification: str

class DefinitionItem(BaseModel):
    terme: str
    definition: str

class AnnexeItem(BaseModel):
    titre: str
    contenu: str = ""
    image: Optional[str] = None  # PNG base64 ("data:image/png;base64,...") capturé manuellement

class OutputItem(BaseModel):
    targetId: str
    label: str = ""


class ProcessMetadataModel(BaseModel):
    """
    Métadonnées de la procédure.
    Tous les champs au-delà de `nom` sont optionnels :
    ils peuvent venir de l'extraction automatique ou être saisis manuellement.
    """
    # Champ obligatoire
    nom: str = Field(..., min_length=1, max_length=200)

    # Identification (en-tête du document)
    ref:            str = Field(default="")
    version:        str = Field(default="")
    dateEffet:      Optional[str] = Field(default="")
    dateDiffusion:  Optional[str] = Field(default="")
    pole:           str = Field(default="")
    direction:      str = Field(default="")

    # Généralités
    objet:                      str = Field(default="")
    perimeter:                  str = Field(default="")
    responsabilites_internes:   List[str] = Field(default=[])
    responsabilites_externes:   List[str] = Field(default=[])
    references:                 Union[str, List[str]] = Field(default="")
    definitions:                List[DefinitionItem] = Field(default=[])
    abbreviations:              List[AbbreviationItem] = Field(default=[])
    regles_gestion:             Union[str, List[str]] = Field(default="")
    annexe:                     List[AnnexeItem] = Field(default=[])

    # Champs legacy (rétrocompatibilité avec l'ancien format)
    proprietaire:       Optional[str] = Field(default="")
    dateCreation:       Optional[str] = Field(default=None)
    dateModification:   Optional[str] = Field(default=None)

    @validator('nom')
    def validate_nom(cls, v):
        if not v.strip():
            raise ValueError("Le nom ne peut pas être vide")
        return v.strip()

    @validator('responsabilites_internes', 'responsabilites_externes', pre=True)
    def ensure_list(cls, v):
        if v is None:
            return []
        return v

    @validator('definitions', 'abbreviations', 'annexe', pre=True)
    def ensure_typed_list(cls, v):
        if v is None:
            return []
        return v

    @validator('annexe')
    def validate_annexe_images(cls, v):
        for item in v:
            if item.image:
                if not item.image.startswith('data:image/png;base64,'):
                    raise ValueError("L'image d'annexe doit être au format 'data:image/png;base64,...'")
                if len(item.image) > 8 * 1024 * 1024:
                    raise ValueError("L'image d'annexe est trop volumineuse (>8MB)")
        return v


class WorkflowStepModel(BaseModel):
    id: str
    étape: str
    typeBpmn: Literal[
        'StartEvent', 'EndEvent', 'Task',
        'ExclusiveGateway', 'ParallelGateway', 'InclusiveGateway'
    ]
    département: str = ""
    acteur: str = ""
    condition: str = ""
    outputs: List[OutputItem] = []
    outil: str = ""
    # legacy — gardé pour compatibilité avec l'ancien format
    outputOui: str = ""
    outputNon: str = ""


class EnrichmentModel(BaseModel):
    id_tache: str
    descriptif: str = Field(default="", max_length=3000)
    declencheur: str = Field(default="")
    applicatif: str = Field(default="")
    duree_estimee: Optional[str] = Field(default="")
    frequence: Optional[str] = Field(default="")
    kpi: Optional[str] = Field(default="")


class DocumentOptionsModel(BaseModel):
    include_diagram: bool = True
    include_enrichments: bool = True
    include_annexes: bool = True
    detail_level: Literal['synthesis', 'standard', 'complete'] = 'standard'


class GenerateDocumentRequest(BaseModel):
    metadata: ProcessMetadataModel
    workflow: List[WorkflowStepModel] = Field(..., min_items=1)
    enrichments: Dict[str, EnrichmentModel] = {}
    diagram_image: Optional[str] = None
    options: DocumentOptionsModel = Field(default_factory=DocumentOptionsModel)

    @validator('workflow')
    def validate_workflow(cls, v):
        if not v:
            raise ValueError("Le workflow ne peut pas être vide")
        ids = [s.id for s in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Les IDs des étapes doivent être uniques")
        return v

    @validator('diagram_image')
    def validate_diagram_image(cls, v, values):
        if v:
            if not v.startswith('data:image/png;base64,'):
                raise ValueError("L'image doit être au format 'data:image/png;base64,...'")
            if len(v) > 20 * 1024 * 1024:
                raise ValueError("L'image est trop volumineuse (>20MB)")
        return v


# ── Stockage temporaire ────────────────────────────────────────────────────────
_temp_files_storage: Dict[str, Tuple[str, str]] = {}  # doc_id -> (file_path, display_filename)


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/generate")
async def generate_document(request: GenerateDocumentRequest):
    logger.info(f"📥 Génération '{request.metadata.nom}'")
    try:
        builder = DocumentBuilder()

        file_path = builder.generate_process_report(
            metadata=request.metadata.dict(),
            workflow=[s.dict() for s in request.workflow],
            enrichments={k: v.dict() for k, v in request.enrichments.items()},
            diagram_image=request.diagram_image,
            options=request.options.dict()
        )

        if not file_path or not os.path.exists(file_path):
            raise ValueError("Le fichier généré est introuvable")

        doc_id = os.path.basename(file_path).replace('.docx', '').replace('processmate_', '')

        safe_nom = request.metadata.nom.replace(' ', '_').replace('/', '-')
        ref_or_ver = request.metadata.ref or request.metadata.version or '1'
        filename = f"Proc_{safe_nom}_{ref_or_ver}.docx"
        _temp_files_storage[doc_id] = (file_path, filename)
        file_size = os.path.getsize(file_path)

        logger.info(f"✅ Document généré : {file_path} ({file_size} bytes)")

        return {
            "success": True,
            "document_id": doc_id,
            "filename": filename,
            "file_size": file_size,
            "download_url": f"/api/doc/download/{doc_id}",
            "preview": {
                "metadata": request.metadata.dict(),
                "statistics": _calculate_preview_stats(
                    request.workflow, request.enrichments,
                    options=request.options,
                    has_diagram=bool(request.diagram_image),
                    metadata=request.metadata
                ),
                "sections": _generate_sections_preview(request.workflow, request.enrichments, request.options, request.metadata)
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur génération : {e}")


@router.get("/download/{document_id}")
async def download_document(document_id: str, background_tasks: BackgroundTasks):
    entry = _temp_files_storage.get(document_id)
    if not entry or not os.path.exists(entry[0]):
        raise HTTPException(status_code=404, detail="Document introuvable ou expiré")
    file_path, filename = entry

    background_tasks.add_task(cleanup_file, file_path)
    background_tasks.add_task(lambda: _temp_files_storage.pop(document_id, None))

    ascii_fallback = filename.encode('ascii', 'ignore').decode('ascii') or 'document.docx'
    disposition = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"

    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
        headers={"Content-Disposition": disposition}
    )


def cleanup_file(file_path: str):
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        logger.warning(f"⚠️ Nettoyage : {e}")


def _calculate_preview_stats(workflow, enrichments, options=None, has_diagram=False, metadata=None):
    actors = set(s.acteur for s in workflow if s.acteur)
    departments = set(s.département for s in workflow if s.département)
    tools = set(s.outil for s in workflow if s.outil)
    return {
        "total_steps": len(workflow),
        "tasks": sum(1 for s in workflow if s.typeBpmn == 'Task'),
        "gateways": sum(1 for s in workflow if s.typeBpmn in ['ExclusiveGateway', 'ParallelGateway', 'InclusiveGateway']),
        "events": sum(1 for s in workflow if s.typeBpmn in ['StartEvent', 'EndEvent']),
        "actors_count": len(actors),
        "departments_count": len(departments),
        "tools_count": len(tools),
        "enrichments_count": len(enrichments),
        "has_diagram": has_diagram,
        "has_enrichments": len(enrichments) > 0,
        "has_annexes": bool(options and options.include_annexes and metadata and metadata.annexe),
    }


def _generate_sections_preview(workflow, enrichments, options, metadata=None):
    sections = [
        {"title": "En-tête procédure", "icon": "📋", "description": "Référence, version, dates, pôle, direction"},
        {"title": "Généralités", "icon": "📄", "description": "Objet, périmètre, responsabilités, abréviations, définitions"},
        {"title": "Sommaire", "icon": "📑", "description": "Table des matières automatique"},
        {"title": "1.1 Règles de gestion", "icon": "📏", "description": "Règles et contraintes du processus"},
    ]
    if options.include_diagram:
        sections.append({"title": "1.2 Logigramme", "icon": "🖼️", "description": "Diagramme BPMN"})
    sections.append({
        "title": "1.3 Description des opérations",
        "icon": "📝",
        "description": f"{len(workflow)} opération(s) — tableaux Acteur / Description"
    })
    annexe = getattr(metadata, 'annexe', None) if metadata else None
    if options.include_annexes and annexe:
        sections.append({
            "title": "Annexes",
            "icon": "📎",
            "description": f"{len(annexe)} annexe(s)"
        })
    return sections


@router.get("/health")
async def health_check():
    try:
        from docx import Document
        doc = Document()
        doc.add_paragraph("Test")
        return {"status": "healthy", "temp_files_count": len(_temp_files_storage)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))