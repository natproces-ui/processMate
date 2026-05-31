# clinic/processor/multi_doc_processor.py
"""
Orchestrateur multi-documents
Double passe : analyse des références → génération enrichie
"""

import asyncio
import logging
import json
import re
import uuid
import base64
from typing import List, Dict, Any, Optional

from prompts.image_classifier import ImageClassifier
from prompts.pdf_classifier import PDFClassifier
from prompts.logic_swimlane import get_logic_swimlanes
from prompts.logic_no_lanes import get_logic_no_lanes
from prompts.logic_manuscript import get_logic_manuscript
from prompts.logic_document import get_logic_document
from prompts.logic_document_image import get_logic_document_image
from prompts.extract_prompt import get_extraction_prompt
from prompts.discovery_prompt import get_discovery_prompt, get_chat_correction_prompt
from models.discovery_models import ProcessCard, DiscoveryResult, SourceReference, SourceType, ProcessCategory
from manager.model_manager import GeminiModelManager
from processor.img_processor import ImageProcessor
import os

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _split_files_by_type(files: List[Dict[str, Any]]):
    images = [f for f in files if f["type"] == "image"]
    pdfs   = [f for f in files if f["type"] == "pdf"]
    return images, pdfs


async def _classify_images(image_files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    classifier = ImageClassifier()
    results = []
    for f in image_files:
        try:
            classification = await classifier.classify_image(f["data"])
            results.append({**f, "classification": classification})
            logger.info(f"🖼️ Image '{f['filename']}' → {classification['type']} ({classification['confidence']}%)")
        except Exception as e:
            logger.error(f"❌ Erreur classification image {f['filename']}: {e}")
            results.append({**f, "classification": {"type": "simple", "confidence": 50}})
    return results


async def _classify_pdfs(pdf_files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    classifier = PDFClassifier()
    results = []
    for f in pdf_files:
        try:
            classification = await classifier.classify_pdf(f["data"], f["filename"])
            results.append({**f, "classification": classification})
            logger.info(f"📄 PDF '{f['filename']}' → {classification['type']} ({classification['confidence']}%)")
        except Exception as e:
            logger.error(f"❌ Erreur classification PDF {f['filename']}: {e}")
            results.append({**f, "classification": {"type": "text_only", "confidence": 50}})
    return results


def _select_image_logic_prompt(classified_images: List[Dict[str, Any]]) -> str:
    if not classified_images:
        return get_logic_no_lanes()
    types = [f["classification"]["type"] for f in classified_images]
    if "swimlanes" in types:
        return get_logic_swimlanes()
    elif "manuscript" in types:
        return get_logic_manuscript()
    return get_logic_no_lanes()


def _detect_global_mode(classified_images, classified_pdfs) -> str:
    has_images = len(classified_images) > 0
    has_pdfs   = len(classified_pdfs) > 0
    if has_images and not has_pdfs:
        return "image_only"
    pdf_has_diagram = any(f["classification"]["type"] == "contains_diagram" for f in classified_pdfs)
    if has_pdfs and not has_images:
        return "document_diagram" if pdf_has_diagram else "document_only"
    return "document_diagram"


# ─────────────────────────────────────────────────────────────
# PROMPT D'ANALYSE DES RÉFÉRENCES
# ─────────────────────────────────────────────────────────────

REFERENCE_ANALYSIS_PROMPT = """Tu es un expert en analyse de procédures métiers.

Tu reçois un ou plusieurs documents de RÉFÉRENCE — des procédures existantes et validées.
Ton objectif est d'extraire les CONVENTIONS et PATTERNS implicites de ces documents
pour qu'ils puissent être appliqués à une nouvelle procédure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CE QUE TU DOIS ANALYSER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **ACTEURS ET RÔLES**
   - Quels acteurs interviennent ? (Client, Agence, BOI, Compliance, Système...)
   - Comment les responsabilités sont-elles réparties entre acteurs ?
   - Y a-t-il des règles implicites sur qui fait quoi ?
   - Ex : "Le BOI ne contacte jamais directement le client — il passe toujours par l'agence"

2. **CONVENTIONS DE FLUX**
   - Comment les rejets/refus sont-ils gérés ? (retour agence ? notification directe ?)
   - Comment les retours d'information circulent-ils entre acteurs ?
   - Y a-t-il des outils spécifiques pour certaines communications ? (DocFlow, Messagerie...)
   - Comment les boucles de correction sont-elles structurées ?
   - Ex : "Quand BOI ou Compliance refuse, retour à l'agence via DocFlow → l'agence informe le client"

3. **ACTIONS AUTOMATIQUES ET SYSTÈME**
   - Certaines actions sont-elles automatiques (système) sans acteur humain ?
   - Ces actions apparaissent-elles dans le logigramme ou seulement dans les descriptions ?
   - Ex : "Les vérifications système ne sont pas des étapes du logigramme mais mentionnées dans les descriptifs"

4. **NIVEAU DE DÉTAIL ET FORMULATION**
   - Comment les étapes sont-elles formulées ? (verbes à l'infinitif ? niveau de granularité ?)
   - Y a-t-il des étapes souvent omises dans le logigramme mais présentes dans les descriptions ?
   - Quel est le niveau de détail attendu pour les tâches manuelles vs automatiques ?

5. **GATEWAYS ET DÉCISIONS**
   - Comment les décisions (Oui/Non) sont-elles structurées ?
   - Quelles sont les branches alternatives typiques ?
   - Comment les conditions de dépassement/exception sont-elles traitées ?

6. **OUTILS ET APPLICATIFS**
   - Quels outils sont utilisés par quel acteur ?
   - Y a-t-il des conventions sur l'utilisation des outils ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAT DE SORTIE JSON (sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "conventions": [
    "Convention claire et actionnable extraite de la référence",
    "Autre convention..."
  ],
  "acteurs": [
    {
      "nom": "Back Office International",
      "abreviation": "BOI",
      "role": "Traitement et contrôle des opérations",
      "regles": ["Ne contacte jamais directement le client", "Utilise DocFlow pour les retours agence"]
    }
  ],
  "flux_typiques": [
    {
      "situation": "Rejet d'une opération",
      "flux": "BOI/Compliance → retour à l'Agence via DocFlow → Agence informe le Client"
    }
  ],
  "actions_automatiques": [
    "Vérification de la ligne de crédit (système, non représentée dans le logigramme)",
    "Génération automatique du message SWIFT"
  ],
  "niveau_detail": {
    "logigramme": "Étapes manuelles significatives uniquement — les actions automatiques sont dans les descriptifs",
    "formulation": "Verbes à l'infinitif, niveau opérationnel (ex: 'Contrôler le dossier', 'Valider l'opération')",
    "granularite": "Chaque étape correspond à une action distincte réalisée par un acteur"
  },
  "outils": [
    {"outil": "DocFlow", "acteurs": ["Agence", "BOI"], "usage": "Communication inter-services et retours"}
  ]
}

JSON PUR sans markdown. Sois précis et actionnable — ces conventions seront utilisées pour adapter une nouvelle procédure.
"""


# ─────────────────────────────────────────────────────────────
# PROCESSEUR PRINCIPAL
# ─────────────────────────────────────────────────────────────

class MultiDocProcessor:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        self.model_manager = GeminiModelManager(api_key)
        self.img_processor = ImageProcessor()

    # ─────────────────────────────────────────────────────
    # PASSE 1 — ANALYSE DES RÉFÉRENCES
    # ─────────────────────────────────────────────────────

    async def _analyze_references(self, ref_files: List[Dict[str, Any]]) -> Optional[Dict]:
        """
        Analyse les fichiers de référence pour extraire les conventions implicites.
        Retourne un dict de conventions ou None si pas de références.
        """
        if not ref_files:
            return None

        logger.info(f"📚 Analyse des références — {len(ref_files)} fichier(s)")

        parts = [REFERENCE_ANALYSIS_PROMPT]
        for f in ref_files:
            parts.extend(self._file_to_parts(f))

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=120
            )
            return response

        result = await self.model_manager.execute_with_fallback(
            _task, task_name="Analyse des références"
        )

        if not result["success"]:
            logger.warning(f"⚠️ Analyse références échouée : {result['message']}")
            return None

        try:
            text = result["result"].text.strip()
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                conventions = json.loads(json_match.group(0))
                logger.info(
                    f"✅ Conventions extraites : {len(conventions.get('conventions', []))} convention(s), "
                    f"{len(conventions.get('acteurs', []))} acteur(s), "
                    f"{len(conventions.get('flux_typiques', []))} flux typique(s)"
                )
                return conventions
        except Exception as e:
            logger.error(f"❌ Erreur parsing conventions : {e}")

        return None

    def _build_conventions_section(self, conventions: Optional[Dict]) -> str:
        """
        Construit la section du prompt qui injecte les conventions extraites.
        """
        if not conventions:
            return ""

        lines = ["""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CONVENTIONS EXTRAITES DES DOCUMENTS DE RÉFÉRENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ces conventions sont extraites de procédures validées similaires.
Tu DOIS les appliquer à la procédure que tu vas générer/améliorer.
"""]

        # Conventions générales
        convs = conventions.get("conventions", [])
        if convs:
            lines.append("**CONVENTIONS GÉNÉRALES :**")
            for c in convs:
                lines.append(f"  • {c}")
            lines.append("")

        # Acteurs et règles
        acteurs = conventions.get("acteurs", [])
        if acteurs:
            lines.append("**ACTEURS ET RÈGLES :**")
            for a in acteurs:
                nom = a.get("nom", "")
                role = a.get("role", "")
                regles = a.get("regles", [])
                lines.append(f"  • {nom} : {role}")
                for r in regles:
                    lines.append(f"    → {r}")
            lines.append("")

        # Flux typiques
        flux = conventions.get("flux_typiques", [])
        if flux:
            lines.append("**FLUX TYPIQUES À RESPECTER :**")
            for f in flux:
                situation = f.get("situation", "")
                flux_desc = f.get("flux", "")
                lines.append(f"  • {situation} : {flux_desc}")
            lines.append("")

        # Actions automatiques
        auto = conventions.get("actions_automatiques", [])
        if auto:
            lines.append("**ACTIONS AUTOMATIQUES (ne pas mettre dans le logigramme) :**")
            for a in auto:
                lines.append(f"  • {a}")
            lines.append("")

        # Niveau de détail
        detail = conventions.get("niveau_detail", {})
        if detail:
            lines.append("**NIVEAU DE DÉTAIL ATTENDU :**")
            for k, v in detail.items():
                lines.append(f"  • {k} : {v}")
            lines.append("")

        # Outils
        outils = conventions.get("outils", [])
        if outils:
            lines.append("**OUTILS ET USAGES :**")
            for o in outils:
                outil = o.get("outil", "")
                acteurs_o = ", ".join(o.get("acteurs", []))
                usage = o.get("usage", "")
                lines.append(f"  • {outil} ({acteurs_o}) : {usage}")
            lines.append("")

        lines.append("⚠️ Ces conventions sont PRIORITAIRES — adapte la procédure pour les respecter.")

        return "\n".join(lines)

    # ─────────────────────────────────────────────────────
    # ORCHESTRATION (chat router)
    # ─────────────────────────────────────────────────────

    async def process(
        self,
        message: str,
        files: List[Dict[str, Any]],
        current_workflow: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        processed_files = []
        for f in files:
            content_type = f.get("content_type", "").lower()
            filename = f.get("filename", "").lower()
            is_pdf = "pdf" in content_type or filename.endswith(".pdf")
            processed_files.append({
                "file_id": str(uuid.uuid4()),
                "filename": f["filename"],
                "data": f.get("content") or f.get("data"),
                "type": "pdf" if is_pdf else "image"
            })

        logger.info(f"🔄 Traitement message chat : {len(processed_files)} fichier(s)")

        try:
            if current_workflow:
                existing_cards = []
                correction_result = await self.chat_correction(
                    files=processed_files,
                    current_cards=existing_cards,
                    user_message=message
                )
                selected_card = correction_result.processes[0] if correction_result.processes else None
                if not selected_card:
                    raise ValueError("Aucun processus après correction")
            else:
                discovery_result = await self.discover_processes(files=processed_files, instructions=message)
                if not discovery_result.processes:
                    raise ValueError("Aucun processus découvert")
                selected_card = discovery_result.processes[0]

            generation_result = await self.generate_process(
                selected_card=selected_card,
                src_files=processed_files,
                ref_files=[],
                instructions=None
            )

            return {
                "success": True,
                "title": generation_result["title"],
                "workflow": generation_result["workflow"],
                "enrichments": generation_result.get("enrichments", {}),
                "procedureMetadata": generation_result.get("procedureMetadata", {}),
                "warnings": generation_result.get("warnings", [])
            }

        except Exception as e:
            logger.error(f"❌ Erreur orchestration : {e}")
            raise

    # ─────────────────────────────────────────────────────
    # PHASE 1 — DÉCOUVERTE
    # ─────────────────────────────────────────────────────

    async def discover_processes(
        self,
        files: List[Dict[str, Any]],
        instructions: str = None
    ) -> DiscoveryResult:
        session_id = str(uuid.uuid4())
        filenames = [f["filename"] for f in files]
        logger.info(f"🔍 Découverte — {len(files)} fichier(s) source(s)")

        prompt = get_discovery_prompt(filenames, instructions=instructions)
        parts = self._build_gemini_parts(files, prompt)

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=90
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Découverte des processus")
        if not result["success"]:
            raise ValueError(result["message"])

        discovery_data = self._parse_discovery_response(result["result"].text)

        process_cards = []
        for idx, p in enumerate(discovery_data.get("processes", [])):
            sources = []
            for fname in p.get("source_files", []):
                matched = next((f for f in files if f["filename"] == fname), None)
                if matched:
                    sources.append(SourceReference(
                        file_id=matched["file_id"],
                        filename=matched["filename"],
                        source_type=SourceType.PDF if matched["type"] == "pdf" else SourceType.IMAGE
                    ))
            if not sources:
                sources = [
                    SourceReference(
                        file_id=f["file_id"], filename=f["filename"],
                        source_type=SourceType.PDF if f["type"] == "pdf" else SourceType.IMAGE
                    ) for f in files
                ]

            category = ProcessCategory.INSTRUCTED if p.get("category") == "instructed" else ProcessCategory.DISCOVERED
            process_cards.append(ProcessCard(
                process_id=str(uuid.uuid4()),
                title=p.get("title", f"Processus {idx + 1}"),
                description=p.get("description", ""),
                sources=sources,
                confidence=p.get("confidence", 70),
                estimated_steps=p.get("estimated_steps"),
                category=category
            ))

        logger.info(f"✅ Découverte terminée : {len(process_cards)} processus")
        return DiscoveryResult(
            session_id=session_id,
            processes=process_cards,
            total_files_analyzed=len(files),
            warnings=discovery_data.get("warnings", [])
        )

    # ─────────────────────────────────────────────────────
    # PHASE 2 — GÉNÉRATION (double passe si références)
    # ─────────────────────────────────────────────────────

    async def generate_process(
        self,
        selected_card: ProcessCard,
        src_files: List[Dict[str, Any]],
        ref_files: List[Dict[str, Any]] = None,
        instructions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Génération en deux passes si des références sont présentes :
        Passe 1 → Analyser les références → extraire conventions
        Passe 2 → Générer depuis les sources en appliquant les conventions
        """
        ref_files = ref_files or []
        logger.info(
            f"⚙️ Génération — '{selected_card.title}' | "
            f"{len(src_files)} source(s), {len(ref_files)} référence(s)"
        )

        # ── Passe 1 : Analyser les références ────────────────
        conventions = None
        if ref_files:
            logger.info("🔍 Passe 1 : Analyse des références...")
            conventions = await self._analyze_references(ref_files)

        # ── Identifier les fichiers sources pertinents ────────
        source_file_ids = {s.file_id for s in selected_card.sources}
        relevant_srcs = [f for f in src_files if f["file_id"] in source_file_ids]
        if not relevant_srcs:
            logger.warning("⚠️ Aucun fichier source trouvé via IDs, utilisation de tous les src_files")
            relevant_srcs = src_files

        # ── Classifier les sources ────────────────────────────
        image_files, pdf_files = _split_files_by_type(relevant_srcs)
        classified_images = await _classify_images(image_files) if image_files else []
        classified_pdfs   = await _classify_pdfs(pdf_files)     if pdf_files   else []
        mode = _detect_global_mode(classified_images, classified_pdfs)
        logger.info(f"📂 Mode détecté : {mode}")

        # ── Passe 2 : Construire le prompt de génération ──────
        conventions_section = self._build_conventions_section(conventions)

        instructions_section = ""
        if instructions and instructions.strip():
            instructions_section = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ INSTRUCTIONS UTILISATEUR — PRIORITÉ ABSOLUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{instructions.strip()}
"""

        ref_names = ", ".join(f["filename"] for f in ref_files) if ref_files else ""
        src_names = ", ".join(f["filename"] for f in relevant_srcs)

        context_prefix = f"""Tu es un expert en formalisation de processus métier bancaires.

🎯 OBJECTIF : Extraire et formaliser COMPLÈTEMENT le processus "{selected_card.title}" depuis les fichiers sources.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 FICHIERS SOURCES (données à extraire)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichiers : {src_names}
Description : {selected_card.description}

Extrais TOUTES les étapes, acteurs, outils et connexions depuis ces fichiers concernant la procedure "{selected_card.title}". Ne t'arrête pas à la première page ou au premier diagramme — parcours TOUT le contenu disponible.
{f"(Fichiers de référence consultés pour le style : {ref_names})" if ref_names else ""}
{conventions_section}
{instructions_section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 INSTRUCTIONS GÉNÉRALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Parcours TOUT le contenu des fichiers sources
- Capture toutes les branches : rejet, escalade, boucle de correction
- Applique les conventions extraites des références pour adapter le flux
- En cas de doute sur un flux (ex: qui informe le client ?), applique la convention de la référence

"""

        extract_format = get_extraction_prompt()

        if mode == "image_only":
            logic_prompt = _select_image_logic_prompt(classified_images)
            full_prompt = context_prefix + "\n\n" + logic_prompt + "\n\n" + extract_format
        elif mode == "document_only":
            full_prompt = context_prefix + "\n\n" + get_logic_document() + "\n\n" + extract_format
        else:
            full_prompt = context_prefix + "\n\n" + get_logic_document_image() + "\n\n" + extract_format

        # ── Construire les parts (sources uniquement pour la génération) ──
        src_to_send = classified_images if mode == "image_only" else classified_pdfs + classified_images

        parts = [full_prompt]
        for f in src_to_send:
            parts.extend(self._file_to_parts(f))

        timeout = 180 if mode != "image_only" else 120

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=timeout
            )
            return response

        logger.info("🤖 Passe 2 : Génération avec conventions appliquées...")
        result = await self.model_manager.execute_with_fallback(
            _task, task_name=f"Génération BPMN — {selected_card.title}"
        )
        if not result["success"]:
            raise ValueError(result["message"])

        raw_text = result["result"].text
        workflow_list, title, enrichments_raw = self.img_processor._parse_gemini_response(raw_text)
        validated = self.img_processor._validate_and_normalize_workflow(workflow_list)

        if isinstance(enrichments_raw, list):
            enrichments_dict = {e["id_tache"]: e for e in enrichments_raw if "id_tache" in e}
        else:
            enrichments_dict = enrichments_raw or {}

        procedure_metadata = {}
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw_text.strip())
            if json_match:
                parsed = json.loads(json_match.group(0))
                procedure_metadata = parsed.get("procedureMetadata", {})
        except Exception:
            pass

        final_title = title if title and title != "Processus métier" else selected_card.title
        logger.info(f"✅ Génération terminée : {len(validated)} étapes — mode={mode}, model={result['model_used']}")

        return {
            "success": True,
            "process_id": selected_card.process_id,
            "title": final_title,
            "workflow": validated,
            "enrichments": enrichments_dict,
            "procedureMetadata": procedure_metadata,
            "metadata": {
                "model_used": result["model_used"],
                "attempts": result["attempts"],
                "sources_used": [f["filename"] for f in relevant_srcs],
                "refs_used": [f["filename"] for f in ref_files],
                "conventions_extracted": len(conventions.get("conventions", [])) if conventions else 0,
                "source_mode": mode,
                "total_steps": len(validated),
            },
            "warnings": []
        }

    # ─────────────────────────────────────────────────────
    # PHASE 1b — CORRECTION PAR CHAT
    # ─────────────────────────────────────────────────────

    async def chat_correction(
        self,
        files: List[Dict[str, Any]],
        current_cards: List[ProcessCard],
        user_message: str
    ) -> DiscoveryResult:
        filenames = [f["filename"] for f in files]
        cards_dicts = [
            {"title": c.title, "description": c.description, "category": c.category.value}
            for c in current_cards
        ]

        prompt = get_chat_correction_prompt(filenames, cards_dicts, user_message)
        parts = self._build_gemini_parts(files, prompt)

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=parts),
                timeout=90
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Correction chat")
        if not result["success"]:
            raise ValueError(result["message"])

        discovery_data = self._parse_discovery_response(result["result"].text)

        updated_cards = []
        for idx, p in enumerate(discovery_data.get("processes", [])):
            sources = []
            for fname in p.get("source_files", []):
                matched = next((f for f in files if f["filename"] == fname), None)
                if matched:
                    sources.append(SourceReference(
                        file_id=matched["file_id"],
                        filename=matched["filename"],
                        source_type=SourceType.PDF if matched["type"] == "pdf" else SourceType.IMAGE
                    ))
            if not sources:
                sources = [
                    SourceReference(
                        file_id=f["file_id"], filename=f["filename"],
                        source_type=SourceType.PDF if f["type"] == "pdf" else SourceType.IMAGE
                    ) for f in files
                ]

            category = ProcessCategory.INSTRUCTED if p.get("category") == "instructed" else ProcessCategory.DISCOVERED
            updated_cards.append(ProcessCard(
                process_id=str(uuid.uuid4()),
                title=p.get("title", f"Processus {idx + 1}"),
                description=p.get("description", ""),
                sources=sources,
                confidence=p.get("confidence", 70),
                estimated_steps=p.get("estimated_steps"),
                category=category
            ))

        return DiscoveryResult(
            session_id=str(uuid.uuid4()),
            processes=updated_cards,
            total_files_analyzed=len(files),
            warnings=discovery_data.get("warnings", [])
        )

    # ─────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────

    def _file_to_parts(self, f: Dict[str, Any]) -> list:
        raw = f.get("data") or f.get("content")
        if not raw:
            return []
        try:
            if f["type"] == "pdf":
                b64 = base64.b64encode(raw).decode("utf-8")
                return [{"inline_data": {"mime_type": "application/pdf", "data": b64}}]
            elif f["type"] == "image":
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(raw))
                if max(img.size) > 1024:
                    img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                return [img]
        except Exception as e:
            logger.error(f"❌ Erreur fichier {f.get('filename')}: {e}")
        return []

    def _build_gemini_parts(self, files: List[Dict[str, Any]], prompt: str) -> list:
        parts = [prompt]
        for f in files:
            parts.extend(self._file_to_parts(f))
        return parts

    def _parse_discovery_response(self, text: str) -> Dict[str, Any]:
        try:
            text = text.strip()
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            data = json.loads(text)
            logger.info(f"✓ Découverte parsée : {len(data.get('processes', []))} processus")
            return data
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing découverte: {e}\n{text[:300]}")
            return {"processes": [], "warnings": [f"Erreur parsing: {str(e)}"]}