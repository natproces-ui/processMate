# processor/pdf_processor.py

"""
Processeur PDF - envoi natif à Gemini
Gère les PDFs légers directement et chunk les lourds
"""

from google import genai
import asyncio
import logging
import base64
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Seuil en bytes au-delà duquel on chunk (environ 20 pages)
PDF_HEAVY_THRESHOLD = 5 * 1024 * 1024  # 5MB


class PDFProcessor:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        self.client = genai.Client(api_key=api_key)

    async def prepare_for_gemini(self, pdf_data: bytes, filename: str) -> Dict[str, Any]:
        """
        Prépare le PDF pour envoi à Gemini.
        Retourne un dict avec les données prêtes + métadonnées.
        """
        size = len(pdf_data)
        is_heavy = size > PDF_HEAVY_THRESHOLD

        logger.info(f"📄 PDF: {filename} ({size} bytes) — {'LOURD' if is_heavy else 'léger'}")

        if not is_heavy:
            return {
                "mode": "direct",
                "data": pdf_data,
                "mime_type": "application/pdf",
                "filename": filename,
                "size": size
            }
        else:
            logger.warning(f"⚠️ PDF lourd ({size} bytes) — envoi direct, risque de timeout")
            return {
                "mode": "direct_heavy",
                "data": pdf_data,
                "mime_type": "application/pdf",
                "filename": filename,
                "size": size,
                "warning": "PDF volumineux, traitement peut être lent"
            }

    def build_gemini_part(self, prepared: Dict[str, Any]) -> dict:
        """
        Construit la partie Gemini pour inclusion dans un prompt multimodal.
        Compatible avec le nouveau SDK google.genai (inline_data).
        """
        b64 = base64.b64encode(prepared["data"]).decode("utf-8")
        return {
            "inline_data": {
                "mime_type": prepared["mime_type"],
                "data": b64
            }
        }