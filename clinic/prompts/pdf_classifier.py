# clinic/prompts/pdf_classifier.py
"""
Classificateur de PDFs avec Gemini
Détecte si un PDF contient uniquement du texte ou aussi un diagramme/logigramme
Classification rapide en ~10 secondes
"""

import asyncio
import logging
import base64
import os
from typing import Dict, Any

from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)


class PDFClassifier:

    CLASSIFICATION_PROMPT = """Analyse ce document PDF et classifie-le en UN SEUL MOT parmi ces 2 types :

**text_only** : Le document contient uniquement du texte, tableaux, listes, descriptions de procédures
**contains_diagram** : Le document contient un diagramme, logigramme, flowchart, schéma de processus ou organigramme

RÈGLES CRITIQUES :
- Si tu vois des formes géométriques reliées par des flèches (cercles, rectangles, losanges) → contains_diagram
- Si tu vois un logigramme ou flowchart dessiné → contains_diagram
- Si le document ne contient que du texte, des tableaux de données ou des listes → text_only
- Un tableau Word/Excel n'est PAS un diagramme → text_only

Réponds UNIQUEMENT avec un seul mot : text_only ou contains_diagram"""

    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        self.model_manager = GeminiModelManager(api_key)

    async def classify_pdf(self, pdf_data: bytes, filename: str = "") -> Dict[str, Any]:
        try:
            b64 = base64.b64encode(pdf_data).decode("utf-8")
            pdf_part = {
                "inline_data": {
                    "mime_type": "application/pdf",
                    "data": b64
                }
            }

            logger.info(f"📄 Classification PDF : {filename} ({len(pdf_data)} bytes)")

            contents = [self.CLASSIFICATION_PROMPT, pdf_part]

            async def _task(model_name: str):
                model = self.model_manager.get_model(model_name)
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        model=model_name,
                        contents=contents
                    ),
                    timeout=20
                )
                return response

            result = await self.model_manager.execute_with_fallback(
                _task,
                task_name=f"Classification PDF {filename}"
            )

            if not result["success"]:
                logger.warning(f"⚠️ Classification échouée : {result['message']} → Fallback text_only")
                return self._fallback(filename, result["message"])

            classification_text = result["result"].text.strip().lower()

            if "contains_diagram" in classification_text:
                pdf_type = "contains_diagram"
                confidence = 95
            elif "text_only" in classification_text:
                pdf_type = "text_only"
                confidence = 95
            else:
                logger.warning(f"⚠️ Réponse inattendue: '{classification_text}' → Fallback text_only")
                pdf_type = "text_only"
                confidence = 60

            logger.info(f"📄 PDF classifié: {pdf_type} (confiance: {confidence}%)")
            return {
                "type": pdf_type,
                "confidence": confidence,
                "method": "gemini",
                "debug": {
                    "raw_response": classification_text,
                    "filename": filename,
                    "model_used": result["model_used"]
                }
            }

        except asyncio.TimeoutError:
            logger.error(f"⏱️ Timeout classification PDF {filename} → Fallback text_only")
            return self._fallback(filename, "timeout")

        except Exception as e:
            logger.error(f"❌ Erreur classification PDF {filename}: {str(e)} → Fallback text_only")
            return self._fallback(filename, str(e))

    def _fallback(self, filename: str, reason: str) -> Dict[str, Any]:
        return {
            "type": "text_only",
            "confidence": 50,
            "method": "fallback",
            "debug": {"filename": filename, "reason": reason}
        }


async def classify_pdf(pdf_data: bytes, filename: str = "") -> Dict[str, Any]:
    classifier = PDFClassifier()
    return await classifier.classify_pdf(pdf_data, filename)