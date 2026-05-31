"""
Regulatory impact processor for ProcessMate.

Changes vs previous version:
- get_procedure_context: procédure complète sans troncature (workflow entier + enrichissements)
- _build_analysis_prompt: contexte procédure structuré et lisible pour Gemini
- Nouveau: stream_approfondir_impact — chat multi-turn sur un impact (pattern irritants)
- Nouveau: get_impact_messages / save_impact_message — persistance historique chat
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from database.supabase_client import get_supabase
from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

IMPACT_STATUSES = {"draft", "to_review", "validated", "rejected", "converted"}
CRITICALITIES = {"low", "medium", "high", "critical"}


# ─── Parsing JSON ─────────────────────────────────────────────

def parse_json_object(text: str) -> Dict[str, Any]:
    raw = text.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        return json.loads(match.group(0))


# ─── Procédures ───────────────────────────────────────────────

def get_latest_procedures() -> List[Dict[str, Any]]:
    db = get_supabase()
    rows = (
        db.table("workflows")
        .select("id, session_id, title, version, procedure_metadata_json, workflow_json, enrichments_json, created_at")
        .order("version", desc=True)
        .execute()
        .data
        or []
    )

    seen: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        sid = row.get("session_id") or row["id"]
        if sid not in seen:
            seen[sid] = row

    procedures = []
    for row in seen.values():
        meta = row.get("procedure_metadata_json") or {}
        procedures.append(
            {
                "id": row["id"],
                "session_id": row.get("session_id"),
                "nom": meta.get("nom") or row.get("title") or "Procedure",
                "ref": meta.get("ref", ""),
                "category": meta.get("category") or meta.get("pole") or meta.get("direction") or "Non classe",
                "description": meta.get("objet") or meta.get("description") or "",
                "version": row.get("version"),
                "created_at": row.get("created_at"),
            }
        )

    return sorted(procedures, key=lambda p: p.get("created_at") or "", reverse=True)


def get_procedure_context(procedure_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Retourne le contexte complet de chaque procédure sélectionnée.
    Aucune troncature — Gemini reçoit l'intégralité du workflow et des enrichissements.
    """
    if not procedure_ids:
        return []

    db = get_supabase()
    rows = (
        db.table("workflows")
        .select("id, title, version, procedure_metadata_json, workflow_json, enrichments_json")
        .in_("id", procedure_ids)
        .execute()
        .data
        or []
    )

    contexts = []
    for row in rows:
        meta = row.get("procedure_metadata_json") or {}
        workflow = row.get("workflow_json") or []
        enrichments = row.get("enrichments_json") or {}

        contexts.append(
            {
                "id": row["id"],
                "nom": meta.get("nom") or row.get("title") or "Procedure",
                "ref": meta.get("ref", ""),
                "version": row.get("version", ""),
                "category": meta.get("category") or meta.get("pole") or meta.get("direction") or "Non classe",
                "objet": meta.get("objet") or meta.get("description") or "",
                "regles_gestion": meta.get("regles_gestion") or meta.get("rules") or "",
                "acteurs": meta.get("acteurs") or meta.get("actors") or "",
                "references": meta.get("references") or "",
                "domaine": meta.get("domaine") or meta.get("domain") or "",
                "activite": meta.get("activite") or meta.get("activity") or "",
                "workflow_steps": workflow,
                "workflow_steps_count": len(workflow),
                "enrichments": enrichments,
            }
        )
    return contexts


# ─── Campagne ─────────────────────────────────────────────────

def get_campaign(campaign_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        get_supabase()
        .table("regulatory_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


# ─── Prompt analyse principale ────────────────────────────────

def _format_procedure_for_prompt(proc: Dict[str, Any]) -> str:
    """Formate une procédure de façon structurée et lisible pour Gemini."""
    lines = [
        f"=== PROCEDURE: {proc['nom']} ===",
        f"ID          : {proc['id']}",
        f"Reference   : {proc.get('ref') or 'N/A'}",
        f"Version     : {proc.get('version') or 'N/A'}",
        f"Categorie   : {proc.get('category') or 'N/A'}",
        f"Domaine     : {proc.get('domaine') or 'N/A'}",
        f"Activite    : {proc.get('activite') or 'N/A'}",
        "",
        "OBJET:",
        proc.get("objet") or "Non renseigne",
        "",
    ]

    if proc.get("regles_gestion"):
        lines += ["REGLES DE GESTION:", str(proc["regles_gestion"]), ""]

    if proc.get("acteurs"):
        lines += ["ACTEURS:", str(proc["acteurs"]), ""]

    if proc.get("references"):
        lines += ["REFERENCES REGLEMENTAIRES:", str(proc["references"]), ""]

    steps = proc.get("workflow_steps") or []
    if steps:
        lines.append(f"WORKFLOW ({len(steps)} etapes):")
        for i, step in enumerate(steps, 1):
            if isinstance(step, dict):
                actor = step.get("actor") or step.get("acteur") or ""
                task = step.get("task") or step.get("tache") or step.get("label") or str(step)
                step_type = step.get("type") or ""
                tools = step.get("tools") or step.get("outils") or []
                line = f"  {i:02d}. [{actor}] {task}"
                if step_type:
                    line += f" ({step_type})"
                if tools:
                    line += f" | Outils: {', '.join(tools) if isinstance(tools, list) else tools}"
                lines.append(line)
            else:
                lines.append(f"  {i:02d}. {step}")
        lines.append("")

    enrichments = proc.get("enrichments") or {}
    if enrichments:
        lines.append("ENRICHISSEMENTS (applicatifs, controles, exceptions):")
        lines.append(json.dumps(enrichments, ensure_ascii=False, indent=2))
        lines.append("")

    return "\n".join(lines)


def _build_analysis_prompt(
    campaign: Dict[str, Any],
    procedures: List[Dict[str, Any]],
    law_text: Optional[str],
) -> str:
    procedure_blocks = "\n\n".join(_format_procedure_for_prompt(p) for p in procedures)

    law_block = law_text or (
        "Le texte reglementaire est fourni en piece jointe PDF dans le message multimodal. "
        "Analyse le PDF directement et exhaustivement."
    )

    return f"""
Tu es un expert senior en conformite bancaire, organisation, moyens de paiement et analyse d'impact SI.

MISSION:
Analyser la source reglementaire fournie et identifier tous les impacts sur les procedures selectionnees.
Utilise l'integralite du contenu de chaque procedure — objet, regles de gestion, acteurs, workflow etape par etape, enrichissements.
Ne te limite pas aux premiers elements: chaque etape du workflow peut etre impactee differemment.

CAMPAGNE:
- Titre     : {campaign.get("title", "")}
- Description: {campaign.get("description", "")}

SOURCE REGLEMENTAIRE:
{law_block}

PROCEDURES SELECTIONNEES ({len(procedures)} procedure(s)):
{procedure_blocks}

METHODE D'ANALYSE:
1. Lis le texte reglementaire et identifie chaque changement applicable.
2. Pour chaque changement, parcours les procedures une par une:
   - Compare avec l'objet, les regles de gestion, les acteurs
   - Examine chaque etape du workflow: qui fait quoi, avec quel outil
   - Verifie les enrichissements: applicatifs, controles, cas exceptionnels
3. Cree un impact distinct par (changement reglementaire x procedure impactee).
4. Si une procedure n'est pas impactee, ne cree pas d'impact pour elle — note-le dans open_questions.
5. Si le changement depend d'une circulaire BAM/GPBM/DSAJ non publiee, cree quand meme l'impact avec external_dependency renseigne.

CALIBRAGE IMPACT SI:
- Ne conclus pas automatiquement a un developpement lourd.
- Si le changement implique un parametrage, une verification de regle ou une communication: dis-le explicitement.
- "Aucun impact SI" est une reponse valide si le changement est purement metier ou documentaire.
- Les systemes impactes doivent venir du workflow ou des enrichissements de la procedure. Si incertain: "A confirmer".

CALIBRAGE CRITICITE:
- critical: blocage operationnel demonstre, risque juridique immediat
- high: impact metier significatif avec action SI ou metier urgente
- medium: adaptation necessaire mais sans blocage
- low: communication, verification, mise a jour documentaire

JOURNAL D'ANALYSE (champ analysis_log):
Pour chaque procedure analysee, indique:
- Ce que tu as examine (sections, etapes cles)
- Ce que tu as trouve ou non trouve
- Pourquoi tu as cree ou non un impact
Ce journal permet a l'utilisateur de comprendre le raisonnement meme si aucun impact n'est genere.

Retourne uniquement du JSON valide, sans markdown:
{{
  "summary": {{
    "regulatory_subject": "Sujet principal identifie",
    "global_assessment": "Synthese courte de l'analyse",
    "dependencies": ["Circulaire BAM", "Clarification GPBM"],
    "procedures_impacted_count": 2,
    "procedures_not_impacted": ["nom de procedure non impactee"]
  }},
  "analysis_log": [
    {{
      "procedure_id": "id exact",
      "procedure_nom": "nom exact",
      "examined_sections": ["Regles de gestion", "Etapes 1-5", "Enrichissements"],
      "findings": "Ce qui a ete trouve ou non",
      "impacts_created": 2,
      "rationale": "Pourquoi ces impacts ont ete crees ou non"
    }}
  ],
  "impacts": [
    {{
      "procedure_id": "id exact de la procedure",
      "procedure_nom": "nom exact",
      "procedure_ref": "reference si disponible",
      "category": "categorie de la procedure",
      "activity": "Activite concernee, ex: Incident de paiement sur cheque",
      "theme": "Theme court et precis",
      "regulatory_change": "Changement introduit par le texte reglementaire",
      "business_impact": "Impact metier concret et actionnable",
      "si_impact": "Impact SI concret ou Aucun impact SI",
      "impacted_systems": ["Systeme1", "Systeme2"],
      "recommended_actions": [
        {{
          "title": "Titre court de l'action",
          "description": "Description actionnable et concrete",
          "owner_type": "metier|si|juridique|organisation|externe",
          "priority": "low|medium|high|critical"
        }}
      ],
      "external_dependency": "BAM|GPBM|DSAJ|null",
      "si_comment": "Commentaire SI precis ou null",
      "criticality": "low|medium|high|critical",
      "confidence": 0.85,
      "law_reference": "Article, point ou extrait court du texte source",
      "procedure_section": "Section, etape ou regle de gestion concernee",
      "rationale": "Justification du rattachement a cette procedure"
    }}
  ],
  "open_questions": [
    {{
      "question": "Question a clarifier",
      "target": "BAM|GPBM|DSAJ|Metier|SI",
      "blocking": true
    }}
  ]
}}

Contraintes:
- Un impact doit etre rattache a une procedure_id selectionnee.
- Si plusieurs procedures sont touchees par le meme changement: un impact par procedure.
- Les actions recommandees doivent etre exploitables pour creer des taches.
- Utilise un francais professionnel et concis.
- N'utilise pas de markdown dans le JSON.
""".strip()


# ─── PDF ──────────────────────────────────────────────────────

def _law_pdf_part(campaign: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    storage_path = campaign.get("source_storage_path")
    mime = campaign.get("source_mime") or "application/pdf"
    if not storage_path or mime != "application/pdf":
        return None

    if str(storage_path).startswith("local:"):
        local_path = str(storage_path).replace("local:", "", 1)
        with open(local_path, "rb") as f:
            data = f.read()
    else:
        data = get_supabase().storage.from_("processmate-files").download(storage_path)

    encoded = base64.b64encode(data).decode("utf-8")
    return {"inline_data": {"mime_type": mime, "data": encoded}}


# ─── Normalisation impact ─────────────────────────────────────

def _normalize_impact(
    raw: Dict[str, Any],
    campaign_id: str,
    procedure_lookup: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    procedure_id = raw.get("procedure_id")
    proc = procedure_lookup.get(procedure_id, {})

    criticality = raw.get("criticality") or "medium"
    if criticality not in CRITICALITIES:
        criticality = "medium"

    confidence = raw.get("confidence", 0.0)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.0

    actions = raw.get("recommended_actions") or []
    if isinstance(actions, str):
        actions = [{"title": actions[:120], "description": actions}]

    systems = raw.get("impacted_systems") or []
    if isinstance(systems, str):
        systems = [s.strip() for s in re.split(r"[,;\n]", systems) if s.strip()]

    return {
        "campaign_id": campaign_id,
        "procedure_id": procedure_id,
        "procedure_nom": raw.get("procedure_nom") or proc.get("nom") or "",
        "procedure_ref": raw.get("procedure_ref") or proc.get("ref") or "",
        "category": raw.get("category") or proc.get("category") or "Non classe",
        "theme": raw.get("theme") or "Impact reglementaire",
        "regulatory_change": raw.get("regulatory_change") or "",
        "business_impact": raw.get("business_impact") or "",
        "si_impact": raw.get("si_impact") or "",
        "impacted_systems": systems,
        "recommended_actions": actions,
        "external_dependency": raw.get("external_dependency"),
        "criticality": criticality,
        "confidence": confidence,
        "law_reference": raw.get("law_reference") or "",
        "procedure_section": raw.get("procedure_section") or "",
        "rationale": raw.get("rationale") or "",
        "status": "draft",
        "source": "ia",
        "metadata": {
            "raw": raw,
            "activity": raw.get("activity") or "",
            "si_comment": raw.get("si_comment") or "",
            "external_dependency": raw.get("external_dependency"),
        },
    }


# ─── Résolution procedure_id ──────────────────────────────────

def _clean_match_value(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _resolve_procedure_id(raw: Dict[str, Any], procedures: List[Dict[str, Any]]) -> Optional[str]:
    raw_candidates = [
        _clean_match_value(v)
        for v in [
            raw.get("procedure_id"),
            raw.get("procedure_ref"),
            raw.get("procedure_nom"),
            raw.get("procedure_name"),
            raw.get("procedure"),
        ]
        if _clean_match_value(v)
    ]

    for proc in procedures:
        proc_candidates = [
            _clean_match_value(v)
            for v in [
                proc.get("id"),
                proc.get("ref"),
                proc.get("nom"),
                f"{proc.get('ref', '')} {proc.get('nom', '')}",
            ]
            if _clean_match_value(v)
        ]
        for rc in raw_candidates:
            if rc in proc_candidates:
                return proc["id"]
            if any(rc in pc for pc in proc_candidates):
                return proc["id"]
            if any(pc in rc for pc in proc_candidates if pc):
                return proc["id"]

    return None


# ─── Analyse principale ───────────────────────────────────────

async def run_impact_analysis(campaign_id: str, procedure_ids: List[str]) -> Dict[str, Any]:
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise ValueError("Campagne introuvable")
    if not procedure_ids:
        raise ValueError("Aucune procedure selectionnee")

    procedures = get_procedure_context(procedure_ids)
    if not procedures:
        raise ValueError("Aucune procedure trouvee")

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY non configuree")

    manager = GeminiModelManager(api_key)

    law_text = campaign.get("law_text")
    if campaign.get("source_type") == "pdf" and campaign.get("source_storage_path"):
        law_text = None

    prompt = _build_analysis_prompt(campaign, procedures, law_text)
    pdf_part = _law_pdf_part(campaign)
    contents: List[Any] = [prompt]
    if pdf_part:
        contents.append(pdf_part)

    async def _task(model_name: str):
        model = manager.get_model(model_name)
        return await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, model=model_name, contents=contents),
            timeout=180,
        )

    result = await manager.execute_with_fallback(_task, task_name="Analyse impact reglementaire")
    if not result.get("success"):
        raise ValueError(result.get("message") or "Erreur IA")

    response_text = getattr(result["result"], "text", "") or ""
    parsed = parse_json_object(response_text)

    procedure_lookup = {p["id"]: p for p in procedures}
    impacts = []
    unresolved_impacts = []

    for raw in parsed.get("impacts", []):
        resolved_id = _resolve_procedure_id(raw, procedures)
        if not resolved_id and len(procedures) == 1:
            resolved_id = procedures[0]["id"]
        if not resolved_id:
            unresolved_impacts.append(raw)
            continue
        normalized = _normalize_impact({**raw, "procedure_id": resolved_id}, campaign_id, procedure_lookup)
        impacts.append(normalized)

    db = get_supabase()
    old = db.table("regulatory_impacts").select("id").eq("campaign_id", campaign_id).execute().data or []
    for row in old:
        db.table("regulatory_impacts").delete().eq("id", row["id"]).execute()

    created = []
    for impact in impacts:
        inserted = db.table("regulatory_impacts").insert(impact).execute().data
        if inserted:
            created.append(inserted[0])

    metadata = campaign.get("metadata") or {}
    metadata["last_analysis"] = {
        "procedure_ids": procedure_ids,
        "procedures_analyzed": [{"id": p["id"], "nom": p["nom"], "steps_count": p["workflow_steps_count"]} for p in procedures],
        "model_used": result.get("model_used"),
        "summary": parsed.get("summary") or {},
        "analysis_log": parsed.get("analysis_log") or [],
        "open_questions": parsed.get("open_questions") or [],
        "impacts_count": len(created),
        "raw_impacts_count": len(parsed.get("impacts", [])),
        "unresolved_impacts": unresolved_impacts,
    }

    db.table("regulatory_campaigns").update(
        {"status": "analyzed", "metadata": metadata}
    ).eq("id", campaign_id).execute()

    return {
        "summary": parsed.get("summary") or {},
        "analysis_log": parsed.get("analysis_log") or [],
        "open_questions": parsed.get("open_questions") or [],
        "impacts": created,
        "model_used": result.get("model_used"),
    }


# ─── Messages historique (approfondir) ───────────────────────

def get_impact_messages(impact_id: str) -> List[Dict[str, Any]]:
    rows = (
        get_supabase()
        .table("regulatory_impact_messages")
        .select("*")
        .eq("impact_id", impact_id)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    return rows


def save_impact_message(impact_id: str, role: str, content: str, intent: Optional[str] = None) -> Dict[str, Any]:
    import uuid
    from datetime import datetime

    row = {
        "id": str(uuid.uuid4()),
        "impact_id": impact_id,
        "role": role,
        "content": content,
        "intent": intent,
        "created_at": datetime.utcnow().isoformat(),
    }
    inserted = get_supabase().table("regulatory_impact_messages").insert(row).execute().data
    return inserted[0] if inserted else row


# ─── Prompt approfondir ───────────────────────────────────────

_APPROFONDIR_SYSTEM = """
Tu es un expert senior en conformite bancaire et analyse d'impact reglementaire.
Tu accompagnes un analyste qui examine un impact reglementaire specifique sur une procedure bancaire.

Ton role: approfondir l'analyse, repondre aux questions, proposer des clarifications ou corrections.

Regles de reponse:
- Calibre la longueur et la structure a la complexite de la question.
- Questions simples (oui/non, definition, confirmation) -> reponse courte en prose.
- Questions complexes (analyse, comparaison, proposition) -> structure claire mais sans sur-formalisme.
- N'utilise pas de markdown excessif.
- Reste factuel et professionnel.
- Si tu suggeres une correction de l'impact, formule-la clairement avec le champ concerne.
- Ne reformule pas systematiquement tout le contexte — l'analyste le connait deja.
""".strip()


def _build_approfondir_context(
    impact: Dict[str, Any],
    procedure: Optional[Dict[str, Any]],
    campaign: Optional[Dict[str, Any]],
) -> str:
    raw_meta = impact.get("metadata") or {}
    raw = raw_meta.get("raw") or {}

    lines = [
        "=== CONTEXTE DE L'IMPACT ===",
        f"Theme               : {impact.get('theme', '')}",
        f"Procedure           : {impact.get('procedure_ref', '')} {impact.get('procedure_nom', '')}",
        f"Categorie           : {impact.get('category', '')}",
        f"Activite            : {raw.get('activity') or impact.get('category', '')}",
        f"Changement          : {impact.get('regulatory_change', '')}",
        f"Impact metier       : {impact.get('business_impact', '')}",
        f"Impact SI           : {impact.get('si_impact', '')}",
        f"Systemes impactes   : {', '.join(impact.get('impacted_systems') or [])}",
        f"Dependance externe  : {impact.get('external_dependency') or 'Aucune'}",
        f"Commentaire SI      : {raw.get('si_comment') or 'N/A'}",
        f"Criticite           : {impact.get('criticality', '')}",
        f"Confiance IA        : {round((impact.get('confidence') or 0) * 100)}%",
        f"Reference loi       : {impact.get('law_reference', '')}",
        f"Section procedure   : {impact.get('procedure_section', '')}",
        f"Statut              : {impact.get('status', '')}",
        "",
        "Actions recommandees:",
    ]
    for action in (impact.get("recommended_actions") or []):
        lines.append(f"  - [{action.get('priority', '')}] {action.get('title', '')}: {action.get('description', '')}")

    if campaign:
        lines += [
            "",
            f"Source reglementaire: {campaign.get('title', '')}",
            f"Texte loi (extrait) : {(campaign.get('law_text') or '')[:500]}{'...' if len(campaign.get('law_text') or '') > 500 else ''}",
        ]

    if procedure:
        lines += [
            "",
            "=== PROCEDURE COMPLETE ===",
            _format_procedure_for_prompt(procedure),
        ]

    return "\n".join(lines)


# ─── Stream approfondir ───────────────────────────────────────

async def stream_approfondir_impact(
    impact_id: str,
    message: str,
) -> AsyncGenerator[str, None]:
    db = get_supabase()

    # Charger l'impact
    rows = db.table("regulatory_impacts").select("*").eq("id", impact_id).execute().data or []
    if not rows:
        yield f"data: {json.dumps({'error': 'Impact introuvable'})}\n\n"
        return
    impact = rows[0]

    # Charger la campagne (pour le texte de loi)
    campaign = get_campaign(impact.get("campaign_id") or "")

    # Charger la procédure complète
    procedure_id = impact.get("procedure_id")
    procedure = None
    if procedure_id:
        proc_rows = (
            db.table("workflows")
            .select("id, title, version, procedure_metadata_json, workflow_json, enrichments_json")
            .eq("id", procedure_id)
            .execute()
            .data
            or []
        )
        if proc_rows:
            ctx = get_procedure_context([procedure_id])
            procedure = ctx[0] if ctx else None

    # Charger l'historique
    history = get_impact_messages(impact_id)

    # Sauvegarder le message utilisateur
    save_impact_message(impact_id, "user", message)

    # Construire les contenus Gemini
    context_block = _build_approfondir_context(impact, procedure, campaign)

    gemini_contents = [
        {"role": "user", "parts": [_APPROFONDIR_SYSTEM + "\n\n" + context_block]},
        {"role": "model", "parts": ["Compris. Je suis pret a approfondir l'analyse de cet impact. Quelle est votre question ?"]},
    ]

    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        gemini_contents.append({"role": role, "parts": [msg.get("content", "")]})

    gemini_contents.append({"role": "user", "parts": [message]})

    # Appel IA
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'error': 'GOOGLE_API_KEY non configuree'})}\n\n"
        return

    manager = GeminiModelManager(api_key)

    try:
        async def _task(model_name: str):
            model = manager.get_model(model_name)
            return await asyncio.wait_for(
                asyncio.to_thread(
                    model.generate_content,
                    model=model_name,
                    contents=gemini_contents,
                ),
                timeout=60,
            )

        result = await manager.execute_with_fallback(_task, task_name="Approfondir impact")
        if not result.get("success"):
            raise ValueError(result.get("message") or "Erreur IA")

        response_text = getattr(result["result"], "text", "") or ""
        response_text = response_text.strip()

        # Sauvegarder la réponse
        save_impact_message(impact_id, "assistant", response_text, intent="analysis")

        yield f"data: {json.dumps({'content': response_text, 'intent': 'analysis'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        logger.error(f"Erreur stream approfondir impact {impact_id}: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"