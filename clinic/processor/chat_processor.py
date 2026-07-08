# clinic/processor/chat_processor.py
"""
Processeur de chat pour ProcessMate
Intent detection → routing vers la bonne logique
"""

import asyncio
import logging
import json
import re
import os
import base64
from typing import List, Dict, Any, Optional

from manager.model_manager import GeminiModelManager
from processor.intent_detector import detect_intent, IntentResult
from processor.img_processor import ImageProcessor
from processor.explain_processor import ExplainProcessor
from processor.multi_doc_processor import (
    MultiDocProcessor,
    _split_files_by_type,
    _classify_images,
    _classify_pdfs,
    _detect_global_mode,
)
from prompts.extract_prompt import get_extraction_prompt
from prompts.logic_document import get_logic_document
from prompts.logic_document_image import get_logic_document_image
from prompts.revision_prompt import get_revision_prompt
from prompts.transcribe_prompt import get_transcribe_prompt

logger = logging.getLogger(__name__)


def _normalize_enrichments(enrichments_raw) -> Dict:
    if isinstance(enrichments_raw, list):
        return {e["id_tache"]: e for e in enrichments_raw if "id_tache" in e}
    return enrichments_raw or {}


def _normalize_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for f in files:
        entry = dict(f)
        if "data" not in entry and "content" in entry:
            entry["data"] = entry["content"]
        normalized.append(entry)
    return normalized


def _extract_procedure_metadata(raw_text: str) -> Dict:
    try:
        text = raw_text.strip()
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            parsed = json.loads(json_match.group(0))
            return parsed.get("procedureMetadata", {})
    except Exception:
        pass
    return {}


def _merge_metadata(existing: Optional[Dict], new: Optional[Dict]) -> Dict:
    """Fusionne les métadonnées régénérées avec les existantes.

    Le modèle ne voit pas toujours l'intégralité du contexte d'origine ; on ne laisse
    donc jamais un champ vide écraser une valeur déjà renseignée.
    """
    if not existing:
        return new or {}
    merged = dict(existing)
    for key, value in (new or {}).items():
        if value in ("", None, [], {}):
            continue
        merged[key] = value
    return merged


def _merge_enrichments(existing: Optional[Dict], new: Optional[Dict]) -> Dict:
    """Fusionne les enrichissements (descriptif, KPI...) par tâche, sans perdre les
    valeurs déjà rédigées quand le modèle ne renvoie rien de nouveau pour une tâche."""
    if not existing:
        return new or {}
    merged = dict(existing)
    for task_id, enr in (new or {}).items():
        base = dict(merged.get(task_id) or {})
        for k, v in (enr or {}).items():
            if v in ("", None):
                continue
            base[k] = v
        merged[task_id] = base
    return merged


class ChatProcessor:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        self.model_manager = GeminiModelManager(api_key)
        self.img_processor = ImageProcessor()
        self.multi_doc = MultiDocProcessor()
        self.explain_processor = ExplainProcessor(self.model_manager)

    async def process_message(
        self,
        message: str,
        files: List[Dict[str, Any]],
        history: List[Dict[str, str]],
        current_workflow: Optional[List[Dict]] = None,
        current_enrichments: Optional[Dict] = None,
        current_procedure_metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:

        files = _normalize_files(files)
        filenames = [f.get("filename", "") for f in files]
        has_workflow = bool(current_workflow and len(current_workflow) > 0)

        logger.info(f"💬 Chat — has_workflow={has_workflow}, files={filenames}")

        intent_result = await detect_intent(
            message=message,
            has_workflow=has_workflow,
            filenames=filenames,
            history=history  # ← historique passé au classifier
        )

        logger.info(f"🎯 Intent: {intent_result.intent} — {intent_result.summary}")

        if intent_result.intent == "clarify":
            return {
                "success": True,
                "intent": "clarify",
                "clarify_question": intent_result.clarify_question,
                "workflow": current_workflow or [],
                "title": None,
                "enrichments": {},
                "procedureMetadata": {}
            }

        if intent_result.intent == "explain":
            return await self.explain_processor.handle_explain(
                message=message,
                workflow=current_workflow,
                history=history
            )

        if intent_result.intent == "transcribe":
            return await self._handle_transcribe(message, files, intent_result.transcribe_mode)

        if intent_result.intent == "patch":
            if files:
                # Filet de sécurité : un patch ne peut pas exploiter de fichiers joints.
                # Si l'utilisateur a joint un fichier, on bascule vers regen plutôt que de le
                # laisser silencieusement ignoré.
                logger.info("🔀 Intent patch avec fichier(s) joint(s) — bascule vers regen")
                result = await self._handle_regen(
                    message, files, current_workflow, intent_result,
                    current_enrichments, current_procedure_metadata,
                )
                result["enrichments"] = _merge_enrichments(current_enrichments, result.get("enrichments"))
                result["procedureMetadata"] = _merge_metadata(current_procedure_metadata, result.get("procedureMetadata"))
                return result
            return await self._handle_patch(message, current_workflow)

        if intent_result.intent == "web_search":
            return await self._handle_web_search(message, files, current_workflow)

        if intent_result.intent == "regen":
            result = await self._handle_regen(
                message, files, current_workflow, intent_result,
                current_enrichments, current_procedure_metadata,
            )
            result["enrichments"] = _merge_enrichments(current_enrichments, result.get("enrichments"))
            result["procedureMetadata"] = _merge_metadata(current_procedure_metadata, result.get("procedureMetadata"))
            return result

        return await self._handle_generate(message, files, history)

    # ─────────────────────────────────────────────────────────
    # TRANSCRIBE — copie fidèle, aucune reformulation
    # ─────────────────────────────────────────────────────────

    async def _handle_transcribe(
        self,
        message: str,
        files: List[Dict[str, Any]],
        transcribe_mode: str = "combined"
    ) -> Dict[str, Any]:

        image_files, pdf_files = _split_files_by_type(files) if files else ([], [])
        classified_images = await _classify_images(image_files) if image_files else []
        classified_pdfs = await _classify_pdfs(pdf_files) if pdf_files else []

        if transcribe_mode == "image_only":
            files_to_send = classified_pdfs + classified_images
        elif transcribe_mode == "text_only":
            files_to_send = classified_pdfs
        else:
            files_to_send = classified_pdfs + classified_images

        logger.info(f"📋 Transcribe mode={transcribe_mode} — {len(files_to_send)} fichier(s) envoyé(s)")

        prompt = get_transcribe_prompt(message, mode=transcribe_mode)
        parts = self._build_parts(files_to_send, prompt)
        timeout = 180 if files_to_send else 60

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=timeout
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat transcribe")
        if not result["success"]:
            raise ValueError(result["message"])

        raw_text = result["result"].text
        workflow_list, title, _ = self.img_processor._parse_gemini_response(raw_text)
        validated = self.img_processor._validate_and_normalize_workflow(workflow_list)

        return {
            "success": True,
            "intent": "transcribe",
            "title": title or "Processus transcrit",
            "workflow": validated,
            "enrichments": {},
            "procedureMetadata": {},
        }

    # ─────────────────────────────────────────────────────────
    # PATCH
    # ─────────────────────────────────────────────────────────

    async def _handle_patch(
        self,
        message: str,
        current_workflow: List[Dict]
    ) -> Dict[str, Any]:

        prompt = get_revision_prompt(current_workflow, message)

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=prompt),
                timeout=60
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat patch")
        if not result["success"]:
            raise ValueError(result["message"])

        text = result["result"].text.strip()
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)
        data = json.loads(text)

        return {
            "success": True,
            "intent": "patch",
            "operations": data.get("operations", []),
            "explanation": data.get("explanation", ""),
            "operations_count": len(data.get("operations", [])),
            "workflow": current_workflow,
            "title": None,
            "enrichments": {},
            "procedureMetadata": {}
        }

    # ─────────────────────────────────────────────────────────
    # GENERATE
    # ─────────────────────────────────────────────────────────

    async def _handle_generate(
        self,
        message: str,
        files: List[Dict[str, Any]],
        history: List[Dict[str, str]]
    ) -> Dict[str, Any]:

        image_files, pdf_files = _split_files_by_type(files) if files else ([], [])
        classified_images = await _classify_images(image_files) if image_files else []
        classified_pdfs = await _classify_pdfs(pdf_files) if pdf_files else []
        mode = _detect_global_mode(classified_images, classified_pdfs) if files else "text_only"

        prompt = self._build_generate_prompt(message, history, mode)
        files_to_send = classified_pdfs + classified_images if files else []
        parts = self._build_parts(files_to_send, prompt)
        timeout = 180 if mode != "text_only" else 90

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=timeout
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat generate")
        if not result["success"]:
            raise ValueError(result["message"])

        raw_text = result["result"].text
        workflow_list, title, enrichments_raw = self.img_processor._parse_gemini_response(raw_text)
        validated = self.img_processor._validate_and_normalize_workflow(workflow_list)
        enrichments_dict = _normalize_enrichments(enrichments_raw)
        procedure_metadata = _extract_procedure_metadata(raw_text)

        return {
            "success": True,
            "intent": "generate",
            "title": title or "Processus métier",
            "workflow": validated,
            "enrichments": enrichments_dict,
            "procedureMetadata": procedure_metadata,
        }

    # ─────────────────────────────────────────────────────────
    # REGEN — double passe avec analyse des références
    # ─────────────────────────────────────────────────────────

    async def _handle_regen(
        self,
        message: str,
        files: List[Dict[str, Any]],
        current_workflow: List[Dict],
        intent_result: IntentResult,
        current_enrichments: Optional[Dict] = None,
        current_metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:

        ref_files = [f for f in files if f.get("filename") in intent_result.reference_files]
        src_files = [f for f in files if f.get("filename") in intent_result.source_files]
        unclassified = [f for f in files
                        if f.get("filename") not in intent_result.reference_files
                        and f.get("filename") not in intent_result.source_files]
        ref_files = ref_files + unclassified
        all_files = ref_files + src_files

        conventions = None
        if ref_files:
            logger.info(f"🔍 Passe 1 : Analyse de {len(ref_files)} fichier(s) de référence...")
            conventions = await self.multi_doc._analyze_references(ref_files)

        conventions_section = self.multi_doc._build_conventions_section(conventions)

        existing_json = json.dumps(current_workflow, ensure_ascii=False, indent=2)
        # Format identique au schéma de sortie attendu (liste, clé "id_tache") pour ne pas
        # induire le modèle à renvoyer "enrichments" sous forme d'objet au lieu d'une liste.
        existing_enrichments_list = [
            {"id_tache": task_id, **(enr or {})}
            for task_id, enr in (current_enrichments or {}).items()
        ]
        existing_enrichments_json = json.dumps(existing_enrichments_list, ensure_ascii=False, indent=2)
        existing_metadata_json = json.dumps(current_metadata or {}, ensure_ascii=False, indent=2)
        ref_names = ", ".join(f.get("filename", "") for f in ref_files) if ref_files else "aucun"

        prompt = f"""Tu es un expert en formalisation de processus métier bancaires.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJECTIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Améliorer et enrichir le workflow existant ci-dessous selon l'instruction de l'utilisateur.
Le workflow existant est LA CIBLE à améliorer — pas un processus à remplacer.

Les fichiers joints peuvent jouer deux rôles, potentiellement combinés :
- Fichier de STYLE : sers-t'en pour la formulation, le niveau de détail, les conventions de nommage.
- Fichier SOURCE : s'il contient des données réelles (règles de gestion, étapes, acteurs, montants, conditions...),
  intègre-les FACTUELLEMENT dans le workflow — ce n'est pas seulement un exemple de style à imiter, c'est du contenu à reporter.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✏️ INSTRUCTION DE L'UTILISATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 WORKFLOW ACTUEL À AMÉLIORER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ C'est CE workflow que tu dois améliorer. Ne le remplace pas par un autre processus.
Tu peux ajouter des étapes, clarifier des libellés, corriger des connexions, adapter des acteurs.

{existing_json}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 ENRICHISSEMENTS EXISTANTS (descriptif, durée, fréquence, KPI — par tâche)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Ce sont les enrichissements DÉJÀ RÉDIGÉS pour ce workflow (même format de liste que celui
attendu en sortie, "id_tache" identifie la tâche concernée).
Reprends-les TELS QUELS dans "enrichments" pour chaque tâche conservée — même format de liste.
N'invente PAS un nouveau descriptif pour une tâche qui en a déjà un, sauf si l'instruction
de l'utilisateur demande explicitement de le modifier. Ne génère un nouveau descriptif que
pour les tâches ajoutées, qui n'en ont pas encore.

{existing_enrichments_json}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 MÉTADONNÉES EXISTANTES DE LA PROCÉDURE (objet, périmètre, règles de gestion, définitions...)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Reprends ces métadonnées TELLES QUELLES dans "procedureMetadata", champ par champ,
sauf si l'instruction de l'utilisateur demande explicitement de modifier l'un de ces champs
(ex: "ajoute une règle de gestion", "précise le périmètre", "corrige l'objet").
Ne laisse JAMAIS un champ vide dans ta réponse si une valeur existait déjà ci-dessous pour ce champ.

{existing_metadata_json}

{conventions_section}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 RÈGLES STRICTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Le processus de sortie est le MÊME processus que celui en entrée, enrichi et corrigé
2. Garde les IDs existants pour les étapes conservées
3. Tu peux et DOIS ajouter des étapes si les conventions ou l'instruction le demandent
4. Adapte les acteurs, outils et connexions selon les conventions extraites
5. Applique le même niveau de détail et de formulation que la référence
6. Retourne le workflow COMPLET mis à jour
7. Retourne les enrichissements et métadonnées existants inchangés, sauf demande explicite de modification

{get_extraction_prompt()}"""

        image_files, pdf_files = _split_files_by_type(all_files) if all_files else ([], [])
        classified_images = await _classify_images(image_files) if image_files else []
        classified_pdfs = await _classify_pdfs(pdf_files) if pdf_files else []
        files_to_send = classified_pdfs + classified_images

        parts = self._build_parts(files_to_send, prompt)
        timeout = 180 if files_to_send else 90

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=timeout
            )
            return response

        logger.info("🤖 Passe 2 : Amélioration du workflow avec conventions appliquées...")
        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat regen")
        if not result["success"]:
            raise ValueError(result["message"])

        raw_text = result["result"].text
        workflow_list, title, enrichments_raw = self.img_processor._parse_gemini_response(raw_text)
        validated = self.img_processor._validate_and_normalize_workflow(workflow_list)
        enrichments_dict = _normalize_enrichments(enrichments_raw)
        procedure_metadata = _extract_procedure_metadata(raw_text)

        return {
            "success": True,
            "intent": "regen",
            "title": title or "Processus métier",
            "workflow": validated,
            "enrichments": enrichments_dict,
            "procedureMetadata": procedure_metadata,
        }

    # ─────────────────────────────────────────────────────────
    # WEB SEARCH
    # ─────────────────────────────────────────────────────────

    async def _handle_web_search(
        self,
        message: str,
        files: List[Dict[str, Any]],
        current_workflow: Optional[List[Dict]]
    ) -> Dict[str, Any]:

        prompt = f"""Tu es un expert en processus bancaires avec accès à des connaissances réglementaires à jour.

L'utilisateur demande : "{message}"

{f"Workflow existant à compléter : {json.dumps(current_workflow, ensure_ascii=False)}" if current_workflow else ""}

Utilise tes connaissances des réglementations bancaires, des normes SWIFT, BAM, Bank Al-Maghrib, Bâle III, etc.
pour générer ou enrichir le processus demandé.

{get_extraction_prompt()}"""

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=prompt),
                timeout=120
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat web_search")
        if not result["success"]:
            raise ValueError(result["message"])

        raw_text = result["result"].text
        workflow_list, title, enrichments_raw = self.img_processor._parse_gemini_response(raw_text)
        validated = self.img_processor._validate_and_normalize_workflow(workflow_list)
        enrichments_dict = _normalize_enrichments(enrichments_raw)
        procedure_metadata = _extract_procedure_metadata(raw_text)

        return {
            "success": True,
            "intent": "web_search",
            "title": title or "Processus métier",
            "workflow": validated,
            "enrichments": enrichments_dict,
            "procedureMetadata": procedure_metadata,
        }

    # ─────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────

    def _build_generate_prompt(self, message: str, history: List[Dict[str, str]], mode: str) -> str:
        history_text = ""
        if history:
            history_text = "\nHistorique :\n"
            for msg in history[-4:]:
                role = "Utilisateur" if msg["role"] == "user" else "Assistant"
                history_text += f"[{role}] : {msg['content']}\n"

        if mode == "text_only":
            logic = "\nAucun fichier fourni — construis depuis la description textuelle.\n"
        elif mode == "document_only":
            logic = "\n" + get_logic_document() + "\n"
        else:
            logic = "\n" + get_logic_document_image() + "\n"

        return f"""Tu es un expert en formalisation de processus métier bancaires.
{history_text}

Message utilisateur : {message}
{logic}
{get_extraction_prompt()}"""

    def _build_parts(self, files: List[Dict[str, Any]], prompt: str) -> list:
        parts = [prompt]
        for f in files:
            try:
                raw = f.get("data") or f.get("content")
                if not raw:
                    continue
                if f["type"] == "pdf":
                    b64 = base64.b64encode(raw).decode("utf-8")
                    parts.append({"inline_data": {"mime_type": "application/pdf", "data": b64}})
                elif f["type"] == "image":
                    from PIL import Image
                    import io
                    img = Image.open(io.BytesIO(raw))
                    if max(img.size) > 1024:
                        img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                    parts.append(img)
            except Exception as e:
                logger.error(f"❌ Erreur fichier {f.get('filename')}: {e}")
        return parts