"""
Router Référentiel d'outils ProcessMate — voir referentiel-outils.md.

Référentiel global à toute la plateforme (tools/tool_screens/tool_screen_fields/
tool_codes, schéma : clinic/database/tools_registry_schema.sql). `Table1Row.outil`
(dans workflows.workflow_json) reste la seule source de "quel outil pour cette étape" —
ce routeur ne gère que le catalogue (écrans/champs/codes), pas de lien à une étape.
"""

import asyncio
import json
import logging
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from google.genai import types as genai_types
from pydantic import BaseModel

from database.supabase_client import get_supabase, upload_file_to_storage, download_file_from_storage
from prompts.tool_screen_extraction_prompt import get_tool_screen_extraction_prompt
from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["Référentiel outils"])

FIELD_TYPES = {"texte", "nombre", "date", "liste"}
CODE_TYPES = {"transaction", "produit", "erreur", "informatique"}
RULE_TYPES = {"validation", "calcul", "controle", "autre"}
DATA_NATURES = {"entree", "sortie", "reference"}


# ─── Modèles ──────────────────────────────────────────────────

class ToolCreate(BaseModel):
    name: str
    color: Optional[str] = None


class ToolScreenCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ToolScreenFieldCreate(BaseModel):
    name: str
    field_type: str = "texte"
    required: bool = False
    example_value: Optional[str] = None


class ToolScreenFieldUpdate(BaseModel):
    name: Optional[str] = None
    field_type: Optional[str] = None
    required: Optional[bool] = None
    example_value: Optional[str] = None


class ToolCodeCreate(BaseModel):
    code_type: str
    code: str
    language: Optional[str] = None  # pertinent seulement pour code_type == "informatique"
    description: Optional[str] = None


class ToolBusinessRuleCreate(BaseModel):
    rule: str
    rule_type: str = "autre"
    description: Optional[str] = None


class ToolDataEntityCreate(BaseModel):
    name: str
    nature: str = "reference"
    description: Optional[str] = None


# ─── Outils : recherche / création (picker chercher-ou-créer) ─

@router.get("")
def search_tools(q: str = "", limit: int = 20):
    """Recherche pour le picker chercher-ou-créer (RACIMatrix.tsx en est l'inspiration)."""
    db = get_supabase()
    query = db.table("tools").select("id, name, color").order("name").limit(limit)
    if q.strip():
        query = query.ilike("name", f"%{q.strip()}%")
    result = query.execute()
    return {"success": True, "tools": result.data, "total": len(result.data)}


@router.post("")
def create_tool(body: ToolCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Le nom de l'outil est requis")
    db = get_supabase()

    existing = db.table("tools").select("id, name, color").ilike("name", name).execute()
    if existing.data:
        # Chercher-ou-créer : un nom déjà présent renvoie l'outil existant plutôt que
        # d'échouer sur la contrainte unique — le picker frontend n'a pas à distinguer
        # les deux cas.
        return {"success": True, "tool": existing.data[0], "created": False}

    result = db.table("tools").insert({"name": name, "color": body.color}).execute()
    return {"success": True, "tool": result.data[0], "created": True}


@router.get("/{tool_id}")
def get_tool(tool_id: str):
    db = get_supabase()
    tool = db.table("tools").select("*").eq("id", tool_id).execute()
    if not tool.data:
        raise HTTPException(404, "Outil introuvable")

    screens = db.table("tool_screens").select("*").eq("tool_id", tool_id).order("created_at").execute()
    codes = db.table("tool_codes").select("*").eq("tool_id", tool_id).order("code_type").execute()
    business_rules = db.table("tool_business_rules").select("*").eq("tool_id", tool_id).order("created_at").execute()
    data_entities = db.table("tool_data_entities").select("*").eq("tool_id", tool_id).order("name").execute()

    screens_with_fields = []
    for screen in screens.data:
        fields = (
            db.table("tool_screen_fields")
            .select("*")
            .eq("screen_id", screen["id"])
            .order("sort_order")
            .execute()
        )
        screens_with_fields.append({**screen, "fields": fields.data})

    return {
        "success": True, "tool": tool.data[0], "screens": screens_with_fields, "codes": codes.data,
        "business_rules": business_rules.data, "data_entities": data_entities.data,
    }


# ─── Écrans ───────────────────────────────────────────────────

@router.post("/{tool_id}/screens")
async def add_screen(
    tool_id: str,
    name: str = Form(...),
    description: str = Form(""),
    screenshot: Optional[UploadFile] = File(default=None),
):
    db = get_supabase()
    if not db.table("tools").select("id").eq("id", tool_id).execute().data:
        raise HTTPException(404, "Outil introuvable")

    screenshot_path = None
    if screenshot and screenshot.filename:
        raw = await screenshot.read()
        if raw:
            safe_name = f"{uuid.uuid4().hex}_{screenshot.filename}"
            # Même bucket que le reste de l'app (upload_file_to_storage), préfixé par
            # tool_id au lieu de session_id — voir supabase_client.py.
            screenshot_path = upload_file_to_storage(
                session_id=f"tools/{tool_id}", filename=safe_name, file_data=raw, file_type="image",
            )

    result = db.table("tool_screens").insert({
        "tool_id": tool_id, "name": name, "description": description,
        "screenshot_path": screenshot_path,
    }).execute()
    return {"success": True, "screen": result.data[0]}


@router.get("/screens/{screen_id}/screenshot")
def get_screen_screenshot(screen_id: str):
    """Reproxy la capture depuis le bucket privé — le bucket n'est pas public
    (voir regulatory_impact_processor.py pour le même pattern download+reproxy)."""
    from fastapi.responses import Response

    db = get_supabase()
    screen = db.table("tool_screens").select("screenshot_path").eq("id", screen_id).execute()
    if not screen.data or not screen.data[0].get("screenshot_path"):
        raise HTTPException(404, "Aucune capture pour cet écran")
    data = download_file_from_storage(screen.data[0]["screenshot_path"])
    return Response(content=data, media_type="image/png")


@router.delete("/screens/{screen_id}")
def delete_screen(screen_id: str):
    db = get_supabase()
    db.table("tool_screens").delete().eq("id", screen_id).execute()
    return {"success": True}


# ─── Champs d'un écran ────────────────────────────────────────

@router.post("/screens/{screen_id}/fields")
def add_field(screen_id: str, body: ToolScreenFieldCreate):
    if body.field_type not in FIELD_TYPES:
        raise HTTPException(400, f"field_type doit être parmi {sorted(FIELD_TYPES)}")
    db = get_supabase()
    result = db.table("tool_screen_fields").insert({
        "screen_id": screen_id, "name": body.name, "field_type": body.field_type,
        "required": body.required, "example_value": body.example_value,
    }).execute()
    return {"success": True, "field": result.data[0]}


@router.put("/fields/{field_id}")
def update_field(field_id: str, body: ToolScreenFieldUpdate):
    if body.field_type and body.field_type not in FIELD_TYPES:
        raise HTTPException(400, f"field_type doit être parmi {sorted(FIELD_TYPES)}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"success": True}
    db = get_supabase()
    result = db.table("tool_screen_fields").update(updates).eq("id", field_id).execute()
    return {"success": True, "field": result.data[0] if result.data else None}


@router.delete("/fields/{field_id}")
def delete_field(field_id: str):
    db = get_supabase()
    db.table("tool_screen_fields").delete().eq("id", field_id).execute()
    return {"success": True}


# ─── Extraction des champs assistée par IA ─────────────────────

@router.post("/screens/{screen_id}/extract-fields")
async def extract_fields(screen_id: str):
    """
    Propose une liste de champs à partir de la capture déjà associée à l'écran, via
    Gemini vision (même technique que img_processor.py — prompt + image). Ne sauvegarde
    rien automatiquement : retourne une proposition, à confirmer/corriger côté frontend
    avant tout appel à add_field — voir la consigne "ne rien décider silencieusement"
    dans referentiel-outils.md.
    """
    db = get_supabase()
    screen = db.table("tool_screens").select("screenshot_path").eq("id", screen_id).execute()
    if not screen.data or not screen.data[0].get("screenshot_path"):
        raise HTTPException(400, "Cet écran n'a pas de capture — ajoutez-en une d'abord")

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(500, "GOOGLE_API_KEY non configurée")

    image_bytes = download_file_from_storage(screen.data[0]["screenshot_path"])
    prompt = get_tool_screen_extraction_prompt()
    image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type="image/png")

    # Passe par GeminiModelManager plutôt qu'un genai.Client() nu — même pattern que
    # img_processor.py : retry + fallback Flash → Flash Lite sur 429/503/timeout, avec
    # des messages d'erreur déjà rédigés pour l'utilisateur plutôt qu'une trace brute.
    model_manager = GeminiModelManager(api_key)

    async def _extract_task(model_name: str):
        return await asyncio.wait_for(
            asyncio.to_thread(
                model_manager.get_model(model_name).generate_content,
                model=model_name,
                contents=[prompt, image_part],
                config=genai_types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            ),
            timeout=45,
        )

    result = await model_manager.execute_with_fallback(_extract_task, task_name="Extraction champs écran outil")
    if not result["success"]:
        raise HTTPException(502, result["message"])

    response = result["result"]
    try:
        parsed = json.loads(response.text)
    except (ValueError, AttributeError) as e:
        logger.error(f"Extraction champs — réponse IA non parseable : {e}")
        raise HTTPException(502, "L'IA n'a pas renvoyé un JSON exploitable, réessayez")

    fields = parsed.get("fields", [])
    for f in fields:
        if f.get("field_type") not in FIELD_TYPES:
            f["field_type"] = "texte"

    return {"success": True, "fields": fields}


# ─── Codes (catalogue par outil) ────────────────────────────────

@router.post("/{tool_id}/codes")
def add_code(tool_id: str, body: ToolCodeCreate):
    if body.code_type not in CODE_TYPES:
        raise HTTPException(400, f"code_type doit être parmi {sorted(CODE_TYPES)}")
    db = get_supabase()
    result = db.table("tool_codes").insert({
        "tool_id": tool_id, "code_type": body.code_type,
        "code": body.code, "language": body.language, "description": body.description,
    }).execute()
    return {"success": True, "code": result.data[0]}


@router.delete("/codes/{code_id}")
def delete_code(code_id: str):
    db = get_supabase()
    db.table("tool_codes").delete().eq("id", code_id).execute()
    return {"success": True}


# ─── Règles de gestion (ce que l'outil impose/vérifie, pas le processus) ────

@router.post("/{tool_id}/rules")
def add_rule(tool_id: str, body: ToolBusinessRuleCreate):
    if body.rule_type not in RULE_TYPES:
        raise HTTPException(400, f"rule_type doit être parmi {sorted(RULE_TYPES)}")
    db = get_supabase()
    result = db.table("tool_business_rules").insert({
        "tool_id": tool_id, "rule": body.rule,
        "rule_type": body.rule_type, "description": body.description,
    }).execute()
    return {"success": True, "rule": result.data[0]}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str):
    db = get_supabase()
    db.table("tool_business_rules").delete().eq("id", rule_id).execute()
    return {"success": True}


# ─── Données (entités/objets métier manipulés par l'outil, pas les champs UI) ─

@router.post("/{tool_id}/data-entities")
def add_data_entity(tool_id: str, body: ToolDataEntityCreate):
    if body.nature not in DATA_NATURES:
        raise HTTPException(400, f"nature doit être parmi {sorted(DATA_NATURES)}")
    db = get_supabase()
    result = db.table("tool_data_entities").insert({
        "tool_id": tool_id, "name": body.name,
        "nature": body.nature, "description": body.description,
    }).execute()
    return {"success": True, "data_entity": result.data[0]}


@router.delete("/data-entities/{entity_id}")
def delete_data_entity(entity_id: str):
    db = get_supabase()
    db.table("tool_data_entities").delete().eq("id", entity_id).execute()
    return {"success": True}
