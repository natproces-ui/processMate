from pydantic import BaseModel, Field
from typing import Any, Dict


class WordGenerationRequest(BaseModel):
    """Requête pour générer un document Word"""
    sfd_data: Dict[str, Any] = Field(..., description="Données SFD au format JSON (Format1 ou Format2)")
    format_type: str = Field(..., description="Type de format: 'format1' ou 'format2'")
    nom_fichier: str = Field(default="SFD_Generated", description="Nom du fichier de sortie (sans extension)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "sfd_data": {
                    "nom_projet": "E-commerce AS-SÂFI",
                    "version": "1.0",
                    "date": "2024-12-23"
                },
                "format_type": "format1",
                "nom_fichier": "SFD_AS-SAFI_v1"
            }
        }


class WordGenerationResponse(BaseModel):
    """Réponse après génération du document Word"""
    success: bool = Field(..., description="Statut de la génération")
    message: str = Field(..., description="Message de résultat")
    file_path: str = Field(default="", description="Chemin du fichier généré")
    file_name: str = Field(default="", description="Nom du fichier")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Document Word généré avec succès",
                "file_path": "/tmp/outputs/SFD_AS-SAFI_v1.docx",
                "file_name": "SFD_AS-SAFI_v1.docx"
            }
        }
