"""
Processor universel d'analyse procédure ProcessMate v2.
Un seul moteur pour tout type d'analyse : réglementation, audit, incident,
note interne, changement SI, réclamation, optimisation, risque opérationnel.
"""
from __future__ import annotations
import asyncio, base64, json, logging, os, re
from typing import Any, AsyncGenerator, Dict, List, Optional
from database.supabase_client import get_supabase
from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

# ─── Types d'intent enrichis ──────────────────────────────────

INTENT_TYPES = {
    "conformite":              "Analyse de conformité",
    "impact_reglementaire":    "Impact réglementaire",
    "impact_si":               "Impact SI / applicatif",
    "optimisation_processus":  "Optimisation de processus",
    "risque_operationnel":     "Risque opérationnel",
    "comparaison_versions":    "Comparaison de versions",
    "couverture_documentaire": "Couverture documentaire",
    "irritants_blocages":      "Irritants et blocages",
    "preparation_audit":       "Préparation audit",
    "transformation":          "Transformation organisationnelle",
    "general":                 "Analyse générale",
}

EXCEL_TEMPLATES = {
    "conformite":              "checklist",
    "impact_reglementaire":    "impact",
    "impact_si":               "impact",
    "optimisation_processus":  "gap",
    "risque_operationnel":     "impact",
    "comparaison_versions":    "comparison",
    "couverture_documentaire": "checklist",
    "irritants_blocages":      "gap",
    "preparation_audit":       "checklist",
    "transformation":          "impact",
    "general":                 "impact",
}

# ─── DB helpers ───────────────────────────────────────────────

def get_session(session_id):
    rows = get_supabase().table("analysis_sessions").select("*").eq("id", session_id).execute().data or []
    return rows[0] if rows else None

def get_session_messages(session_id):
    return get_supabase().table("analysis_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute().data or []

def save_message(session_id, role, content, sources_meta=None, artifact_id=None):
    import uuid; from datetime import datetime
    row = {
        "id": str(uuid.uuid4()), "session_id": session_id, "role": role,
        "content": content, "sources_meta": sources_meta or [],
        "artifact_id": artifact_id, "created_at": datetime.utcnow().isoformat(),
    }
    inserted = get_supabase().table("analysis_messages").insert(row).execute().data
    return inserted[0] if inserted else row

def save_artifact(session_id, intent_type, intent_label, instruction_summary, analysis_json, procedure_ids, excel_template):
    import uuid; from datetime import datetime
    row = {
        "id": str(uuid.uuid4()), "session_id": session_id,
        "intent_type": intent_type, "intent_label": intent_label,
        "instruction_summary": instruction_summary,
        "analysis_json": analysis_json, "procedure_ids": procedure_ids,
        "excel_template": excel_template, "created_at": datetime.utcnow().isoformat(),
    }
    inserted = get_supabase().table("analysis_artifacts").insert(row).execute().data
    return inserted[0] if inserted else row

def get_artifact(artifact_id):
    rows = get_supabase().table("analysis_artifacts").select("*").eq("id", artifact_id).execute().data or []
    return rows[0] if rows else None

# ─── Procédures ───────────────────────────────────────────────

def get_procedures_context(procedure_ids):
    if not procedure_ids:
        return []
    rows = get_supabase().table("workflows").select(
        "id, title, version, procedure_metadata_json, workflow_json, enrichments_json"
    ).in_("id", procedure_ids).execute().data or []
    contexts = []
    for row in rows:
        meta = row.get("procedure_metadata_json") or {}
        workflow = row.get("workflow_json") or []
        enrichments = row.get("enrichments_json") or {}
        contexts.append({
            "id": row["id"],
            "nom": meta.get("nom") or row.get("title") or "Procedure",
            "ref": meta.get("ref", ""),
            "version": row.get("version", ""),
            "category": meta.get("category") or meta.get("pole") or "Non classe",
            "objet": meta.get("objet") or "",
            "regles_gestion": meta.get("regles_gestion") or "",
            "acteurs": meta.get("acteurs") or "",
            "references": meta.get("references") or "",
            "workflow_steps": workflow,
            "workflow_steps_count": len(workflow),
            "enrichments": enrichments,
        })
    return contexts

def _format_procedure(proc):
    lines = [
        "=== PROCEDURE: " + proc["nom"] + " ===",
        "ID: " + proc["id"],
        "Ref: " + (proc.get("ref") or "N/A"),
        "Categorie: " + (proc.get("category") or "N/A"),
        "Objet: " + (proc.get("objet") or "N/A"), "",
    ]
    if proc.get("regles_gestion"):
        lines += ["REGLES DE GESTION:", str(proc["regles_gestion"]), ""]
    if proc.get("acteurs"):
        lines += ["ACTEURS:", str(proc["acteurs"]), ""]
    steps = proc.get("workflow_steps") or []
    if steps:
        lines.append("WORKFLOW (" + str(len(steps)) + " etapes):")
        for i, step in enumerate(steps, 1):
            if isinstance(step, dict):
                actor = step.get("actor") or step.get("acteur") or step.get("departement") or ""
                task = step.get("task") or step.get("tache") or step.get("etape") or step.get("label") or str(step)
                tool = step.get("outil") or ""
                line = "  " + str(i).zfill(2) + ". [" + actor + "] " + task
                if tool: line += " | " + tool
                lines.append(line)
            else:
                lines.append("  " + str(i).zfill(2) + ". " + str(step))
        lines.append("")
    enrichments = proc.get("enrichments") or {}
    if enrichments:
        lines += ["ENRICHISSEMENTS:", json.dumps(enrichments, ensure_ascii=False, indent=2), ""]
    return "\n".join(lines)

# ─── Sources ──────────────────────────────────────────────────

def encode_file_for_gemini(file_bytes, mime_type, filename):
    if mime_type == "application/pdf":
        return {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(file_bytes).decode()}}, None
    if mime_type in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        return {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(file_bytes).decode()}}, None
    if mime_type in ("text/plain", "text/csv"):
        return None, "[Fichier: " + filename + "]\n" + file_bytes.decode("utf-8", errors="ignore")
    if mime_type in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"):
        try:
            import io, openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            parts = ["[Excel: " + filename + "]"]
            for sn in wb.sheetnames:
                ws = wb[sn]; parts.append("\n--- " + sn + " ---")
                for row in ws.iter_rows(values_only=True):
                    vals = [str(v or "").strip() for v in row]
                    if any(vals): parts.append("\t".join(vals))
            return None, "\n".join(parts)
        except Exception as e:
            return None, "[Excel: " + filename + " - lecture impossible: " + str(e) + "]"
    try:
        return None, "[" + filename + "]\n" + file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return None, "[" + filename + " - format non supporte]"

# ─── Prompt principal ─────────────────────────────────────────

_SYSTEM = """Tu es un expert senior en organisation bancaire, amélioration des processus,
conformité réglementaire, risque opérationnel et analyse procédurale.

Tu analyses des procédures bancaires par rapport à des sources soumises par l'utilisateur.
Ces sources peuvent être : une réglementation, une circulaire, un email de direction,
un rapport d'audit, une note interne, un incident, une réclamation client, un changement SI,
un plan de transformation, ou toute autre source pertinente.

Ta mission : comprendre ce que l'utilisateur veut analyser, examiner les procédures
en profondeur, et produire des PROPOSITIONS DE MODIFICATION concrètes — pas un rapport
générique, et pas des propositions de tâches. Une tâche pourra être créée plus tard à
partir d'une modification (avec le titre de la modification repris tel quel comme titre
de tâche), mais ce que tu dois produire ici est le changement lui-même : quelle partie
de la procédure change, de quelle valeur vers quelle nouvelle valeur. Ne propose jamais
d'action de gestion de projet générique ("organiser un atelier", "sensibiliser les
équipes", "créer une campagne de communication") — si un constat n'implique aucun
changement concret d'un champ précis de la procédure, ne crée pas d'item pour lui,
mentionne-le plutôt dans open_questions ou analysis_log.

Chaque point d'analyse doit être :
- Rattaché à une étape, une règle, un acteur ou un applicatif précis de la procédure
- Qualifié avec un type d'impact clair
- Assorti d'une modification précise et actionnable (voir ci-dessous)

UN "IMPACT" PEUT TOUCHER PLUSIEURS PARTIES DE LA PROCÉDURE:
Une procédure a 5 parties distinctes : le logigramme (workflow), les règles de gestion,
les caractéristiques (objet/définition/périmètre/propriétaire/références), les
descriptions par étape (descriptif/déclencheur/durée/fréquence/KPI), et les outils par
étape. Un même constat (ex: un changement réglementaire, un incident, un audit) peut
impliquer une modification dans PLUSIEURS de ces parties à la fois — dans ce cas, crée
UN item d'analyse PAR PARTIE touchée, mais fais-les tous partager le même impact_id et
impact_theme pour qu'ils soient reconnus comme faisant partie du même constat. S'il y a
plusieurs constats distincts dans l'analyse (ex: deux lois différentes, ou plusieurs
incidents), chacun a son propre impact_id et peut lui-même toucher plusieurs parties.

GUIDE DES CHAMPS PAR PARTIE (pour le champ modification.target_field):
- partie=caracteristiques → target_field parmi: objet | definition | perimeter | proprietaire | references. Pas de target_step_id. operation_type = update.
- partie=qualite → target_field = regles_gestion. Pas de target_step_id. operation_type = update.
- partie=diagramme → operation_type = add|update|delete|move|relink selon le cas :
  - update : target_step_id obligatoire, target_field parmi étape|typeBpmn|acteur|département|typeActeur|condition, proposed_value = nouvelle valeur de ce champ.
  - move : target_step_id obligatoire, target_field = acteur ou département, proposed_value = nouvelle valeur.
  - delete : target_step_id obligatoire (id de l'étape à supprimer), les autres champs ne sont pas utilisés.
  - add (nouvelle étape) : NE PAS utiliser target_field/proposed_value pour décrire l'étape — utilise le champ dédié `new_row` (voir schéma JSON) avec tous les champs de l'étape, et `after_id` pour indiquer après quel id l'insérer. Donne à `new_row.id` un identifiant temporaire préfixé "NEW_" (ex: "NEW_1").
  - relink (changer les liens sortants d'une étape existante) : target_step_id obligatoire (étape dont les liens changent), utilise le champ dédié `outputs` (liste de {target_id, label}) plutôt que proposed_value.
- partie=descriptions → target_step_id obligatoire. target_field parmi: descriptif | declencheur | applicatif | duree_estimee | frequence | kpi. operation_type = update (ou add avec `new_row` si l'étape elle-même est nouvelle).
- partie=outils → target_step_id obligatoire. target_field = outil. operation_type = update.

Ne mets JAMAIS un objet ou une structure sous forme de texte brut dans `proposed_value` (ex: pas de `{'id': ..., 'typeBpmn': ...}` en chaîne de caractères) — proposed_value est toujours une phrase ou valeur lisible par un humain. Toute donnée structurée (nouvelle étape, nouveaux liens) va dans `new_row`/`outputs`, jamais dans proposed_value.

CALIBRAGE IMPACT SI (notamment pour impact_reglementaire et impact_si):
- Ne conclus pas automatiquement à un développement lourd.
- Si le changement implique un paramétrage, une vérification de règle ou une communication : dis-le explicitement dans si_impact.
- "Aucun impact SI" est une réponse valide si le changement est purement métier ou documentaire.
- Les systèmes impactés (impacted_systems) doivent venir du workflow ou des enrichissements de la procédure, jamais inventés. Si incertain : "À confirmer".
- Si le changement dépend d'une source externe non publiée (circulaire BAM/GPBM/DSAJ, décision d'un tiers), renseigne quand même external_dependency plutôt que d'inventer un contenu.

CALIBRAGE CRITICITÉ:
- critical : blocage opérationnel démontré, risque juridique immédiat
- high     : impact métier significatif avec action SI ou métier urgente
- medium   : adaptation nécessaire mais sans blocage
- low      : communication, vérification, mise à jour documentaire

Types d'intent possibles :
- conformite              : vérifier si des exigences sont couvertes
- impact_reglementaire    : changement réglementaire qui modifie les règles
- impact_si               : changement applicatif ou système qui impacte le processus
- optimisation_processus  : améliorer l'efficacité, réduire les délais, éliminer les doublons
- risque_operationnel     : identifier les zones de risque, les contrôles manquants
- comparaison_versions    : comparer deux versions d'une procédure ou deux sources
- couverture_documentaire : vérifier si des éléments sont documentés
- irritants_blocages      : identifier les points de friction, les blocages opérationnels
- preparation_audit       : préparer une procédure pour un audit interne ou externe
- transformation          : impact d'une réorganisation ou transformation sur les processus
- general                 : analyse générale si le but n'est pas clairement identifiable

Si aucune source externe n'est fournie : recherche activement sur le web les standards,
réglementations, circulaires BAM, normes internationales et bonnes pratiques applicables
à cette procédure, puis positionne-la par rapport à ces références."""

_JSON_SCHEMA = """
Retourne uniquement du JSON valide sans markdown. Dans "modification", les champs
new_row/outputs/after_id sont optionnels — ne les inclus que quand operation_type
le justifie (voir GUIDE DES CHAMPS PAR PARTIE), sinon omets-les complètement (ne mets
jamais de valeur vide ou null à la place, juste absent du JSON) :
{
  "intent": {
    "type": "un des types ci-dessus",
    "label": "Label court et descriptif",
    "confidence": 0.9,
    "instruction_summary": "Ce que l'utilisateur veut faire en une phrase",
    "sources_nature": "Description courte des sources soumises (ex: circulaire BAM, rapport audit, email direction...)"
  },
  "summary": {
    "global_assessment": "Synthèse globale en 2-3 phrases orientées résultat",
    "sources_identified": ["Source 1", "Source 2"],
    "procedures_analyzed": ["Nom procédure 1"],
    "procedures_not_impacted": ["Nom procédure non impactée"],
    "key_findings": ["Constat clé 1", "Constat clé 2", "Constat clé 3"]
  },
  "analysis": [
    {
      "impact_id": "Identifiant court partagé par tous les items du même constat, ex: impact-1",
      "impact_theme": "Titre court du constat, partagé entre les parties qu'il touche",
      "partie": "caracteristiques|qualite|diagramme|descriptions|outils",
      "procedure_id": "id exact",
      "procedure_nom": "nom exact",
      "procedure_ref": "référence",
      "procedure_step": "Étape ou règle ou acteur ou applicatif précis concerné",
      "impact_type": "metier|si|reglementaire|risque|irritant|documentation|organisation",
      "source_element": "Élément précis issu des sources",
      "source_ref": "Référence dans la source (article, section, page...)",
      "coverage_status": "couvert|partiel|manquant|non_applicable",
      "gap": "Description précise de l'écart ou null si couvert",
      "business_impact": "Impact métier concret sur les opérations quotidiennes",
      "si_impact": "Impact sur les systèmes/applicatifs ou Aucun impact SI",
      "operational_risk": "Risque opérationnel identifié ou null",
      "irritant_detected": "Description de l'irritant ou friction ou null",
      "impacted_systems": ["Système ou applicatif concerné"],
      "impacted_actors": ["Acteur ou département concerné"],
      "modification": {
        "title": "Phrase courte, naturelle et actionnable décrivant le changement lui-même, PAS une tâche générique. Ex: 'Modifier le délai de vérification de l'étape Contrôle qualité de 5 à 10 jours'. Ce titre sera repris tel quel comme titre de tâche si une tâche est créée depuis cette modification — il doit donc être concret et se suffire à lui-même, sans jargon de gestion de projet (jamais 'organiser un atelier', 'créer une campagne', etc.)",
        "target_step_id": "id exact de l'étape concernée, obligatoire si partie=diagramme|descriptions|outils et operation_type != add, sinon null",
        "target_field": "Nom du champ précis modifié (voir guide des champs par partie) — absent/null si operation_type=add ou relink",
        "operation_type": "add|update|delete|move|relink",
        "current_value": "Valeur actuelle si connue, sinon null",
        "proposed_value": "Valeur proposée, précise et actionnable — jamais un objet ou une structure en texte brut",
        "rationale": "Justification du changement propose",
        "new_row": {
          "id": "Identifiant temporaire préfixé NEW_, ex: NEW_1",
          "étape": "Nom de la nouvelle étape",
          "typeBpmn": "StartEvent|EndEvent|Task|UserTask|ExclusiveGateway|ParallelGateway|InclusiveGateway",
          "acteur": "Acteur responsable de cette étape",
          "département": "Département de l'acteur, si connu",
          "typeActeur": "interne|externe|",
          "condition": "Libellé de la condition si c'est un gateway, sinon vide",
          "outputs": [{ "targetId": "id de l'étape suivante (ou NEW_x si elle aussi nouvelle)", "label": "Oui/Non/vide" }],
          "outil": "Outil utilisé pour cette étape, si connu"
        },
        "after_id": "Uniquement si operation_type=add : id exact de l'étape existante après laquelle insérer la nouvelle (celle qui doit pointer vers new_row.id)",
        "outputs": [{ "targetId": "id de l'étape cible", "label": "Oui/Non/vide" }]
      },
      "external_dependency": "BAM|GPBM|DSAJ|Prestataire|null",
      "criticality": "low|medium|high|critical",
      "confidence": 0.85,
      "rationale": "Pourquoi ce point est analysé ainsi, avec référence à la procédure"
    }
  ],
  "analysis_log": [
    {
      "procedure_id": "id exact",
      "procedure_nom": "nom exact",
      "examined_sections": ["Règles de gestion", "Étapes 3-7", "Enrichissements"],
      "findings": "Ce qui a été trouvé, constaté, ou non trouvé",
      "points_analyzed": 3,
      "rationale": "Synthèse du raisonnement pour cette procédure"
    }
  ],
  "open_questions": [
    {
      "question": "Question à clarifier avant d'agir",
      "target": "BAM|GPBM|DSAJ|Métier|SI|Utilisateur",
      "blocking": true
    }
  ]
}"""


def _build_prompt(instruction, procedures, text_sources, autonomous=False):
    proc_blocks = "\n\n".join(_format_procedure(p) for p in procedures)

    if autonomous:
        autonomous_block = (
            "\n\nMODE AUTONOME : Aucune source ni instruction fournie.\n"
            "Recherche activement sur le web :\n"
            "- Circulaires et directives Bank Al-Maghrib récentes\n"
            "- Lois marocaines applicables (loi bancaire 103-12, Code de Commerce...)\n"
            "- Normes internationales (Bâle III, COSO, ISO, UCP 600...)\n"
            "- Bonnes pratiques sectorielles bancaires\n"
            "Puis analyse la procédure par rapport à ces références.\n"
        )
        return (
            _SYSTEM + autonomous_block
            + "\n\nPROCEDURES A ANALYSER (" + str(len(procedures)) + "):\n"
            + proc_blocks + _JSON_SCHEMA
        )

    sources_block = "\n\n".join(text_sources) if text_sources else "Voir fichiers joints."
    instr_block = (
        instruction.strip() if instruction.strip()
        else "Analyse ces procédures par rapport aux sources fournies et identifie tous les points d'action."
    )

    return (
        _SYSTEM
        + "\n\nINSTRUCTION: " + instr_block
        + "\n\nSOURCES SOUMISES:\n" + sources_block
        + "\n\nPROCEDURES A ANALYSER (" + str(len(procedures)) + "):\n"
        + proc_blocks + _JSON_SCHEMA
    )


# ─── Compat propositions → tâches ──────────────────────────────

_PARTIE_LABELS = {
    "caracteristiques": "les caractéristiques",
    "qualite": "les règles de gestion",
    "diagramme": "le logigramme",
    "descriptions": "les descriptions",
    "outils": "les outils",
}


def _synthesize_recommended_action(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dérive une entrée recommended_actions depuis la modification structurée, pour que
    les consommateurs existants (candidats de tâches, export Excel) continuent de
    fonctionner sans changement — le LLM ne produit plus recommended_actions/
    potential_tasks directement, la modification est désormais la donnée primaire.
    """
    mod = item.get("modification") or {}
    partie = item.get("partie") or ""
    partie_label = _PARTIE_LABELS.get(partie, partie or "la procédure")
    target = mod.get("target_field") or ""
    # Le titre vient du LLM (concret, ex: "Modifier le délai de vérification de 5 à 10
    # jours") — repris tel quel car il sert aussi de titre de tâche à la création.
    # Le template n'est qu'un filet de sécurité si le LLM omet le champ.
    title = mod.get("title") or ("Modifier " + partie_label + (f" — {target}" if target else ""))
    new_row = mod.get("new_row") or {}
    description = (
        mod.get("proposed_value")
        or (f"Nouvelle étape : {new_row.get('étape')}" if new_row.get("étape") else "")
        or mod.get("rationale") or ""
    )
    return {
        "title": title[:180],
        "description": description,
        "owner_type": "metier",
        "priority": item.get("criticality") or "medium",
        "procedure_step_target": mod.get("target_step_id") or partie_label,
    }


# ─── Analyse principale ───────────────────────────────────────

async def run_analysis(session_id, instruction, procedure_ids, files):
    procedures = get_procedures_context(procedure_ids)
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY non configuree")
    manager = GeminiModelManager(api_key)

    gemini_parts, text_sources, sources_meta = [], [], []
    for f in files:
        part, text = encode_file_for_gemini(f["bytes"], f["mime_type"], f["filename"])
        if part: gemini_parts.append(part)
        if text: text_sources.append(text)
        sources_meta.append({
            "filename": f["filename"], "mime_type": f["mime_type"],
            "size": len(f["bytes"]), "mode": "multimodal" if part else "text_extracted",
        })

    autonomous = not instruction.strip() and not files
    prompt = _build_prompt(instruction, procedures, text_sources, autonomous=autonomous)
    contents: List[Any] = [prompt] + gemini_parts

    async def _task(model_name):
        model = manager.get_model(model_name)
        call_kwargs: dict = {"model": model_name, "contents": contents}
        if autonomous:
            try:
                from google.genai import types as genai_types
                config = genai_types.GenerateContentConfig(
                    tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())]
                )
                call_kwargs["config"] = config
                logger.info("Mode autonome - Google Search grounding active (%s)", model_name)
            except Exception as e:
                logger.warning("Grounding non disponible: %s", e)
        return await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, **call_kwargs),
            timeout=240,
        )

    result = await manager.execute_with_fallback(_task, task_name="Analyse universelle v2")
    if not result.get("success"):
        raise ValueError(result.get("message") or "Erreur IA")

    parsed = _parse_json(getattr(result["result"], "text", "") or "")
    intent = parsed.get("intent") or {}
    intent_type = intent.get("type") or "general"
    excel_template = EXCEL_TEMPLATES.get(intent_type, "impact")

    for item in parsed.get("analysis") or []:
        if item.get("modification") and not item.get("recommended_actions"):
            item["recommended_actions"] = [_synthesize_recommended_action(item)]

    artifact = save_artifact(
        session_id=session_id,
        intent_type=intent_type,
        intent_label=intent.get("label") or INTENT_TYPES.get(intent_type, "Analyse"),
        instruction_summary=intent.get("instruction_summary") or instruction or "Analyse automatique",
        analysis_json=parsed,
        procedure_ids=procedure_ids,
        excel_template=excel_template,
    )

    summary = parsed.get("summary") or {}
    analysis = parsed.get("analysis") or []
    covered        = sum(1 for a in analysis if a.get("coverage_status") == "couvert")
    partial        = sum(1 for a in analysis if a.get("coverage_status") == "partiel")
    missing        = sum(1 for a in analysis if a.get("coverage_status") == "manquant")
    critical_count = sum(1 for a in analysis if a.get("criticality") in ("critical", "high"))
    modifications_count = sum(1 for a in analysis if a.get("modification"))
    impacts_count = len({a.get("impact_id") for a in analysis if a.get("impact_id")})

    content_lines = [
        "**" + (intent.get("label") or INTENT_TYPES.get(intent_type, "Analyse")) + "**", "",
        summary.get("global_assessment") or "", "",
        "**" + str(len(analysis)) + " points analysés** · "
        + str(covered) + " couverts · "
        + str(partial) + " partiels · "
        + str(missing) + " manquants · "
        + str(critical_count) + " prioritaires",
    ]
    if modifications_count:
        content_lines.append(
            str(modifications_count) + " modification(s) proposée(s)"
            + (f" sur {impacts_count} impact(s)" if impacts_count else "")
        )

    key_findings = summary.get("key_findings") or []
    if key_findings:
        content_lines.append("")
        for f in key_findings[:3]:
            content_lines.append("• " + f)

    blocking_qs = [q for q in (parsed.get("open_questions") or []) if q.get("blocking")]
    if blocking_qs:
        content_lines.append("\n⚠ " + str(len(blocking_qs)) + " question(s) bloquante(s)")

    assistant_message = save_message(
        session_id=session_id, role="assistant",
        content="\n".join(content_lines), artifact_id=artifact["id"],
    )
    return {
        "artifact": artifact, "message": assistant_message,
        "model_used": result.get("model_used"), "sources_meta": sources_meta,
        "autonomous": autonomous,
    }


# ─── Stream chat ──────────────────────────────────────────────

async def stream_chat(session_id, message, artifact_id=None):
    context_block = ""
    if artifact_id:
        artifact = get_artifact(artifact_id)
        if artifact:
            aj = artifact.get("analysis_json") or {}
            summary = (aj.get("summary") or {}).get("global_assessment") or ""
            analysis_items = aj.get("analysis") or []
            context_block = (
                "ARTIFACT:\nType: " + (artifact.get("intent_label") or "")
                + "\nSynthese: " + summary
                + "\nPoints: " + str(len(analysis_items))
                + "\nDetail (extrait): " + json.dumps(analysis_items[:5], ensure_ascii=False, indent=2)
            )

    history = get_session_messages(session_id)
    save_message(session_id, "user", message)

    system_content = (
        "Tu es un expert en analyse de procédures bancaires, conformité et organisation. "
        "Réponds de façon concise et professionnelle, orientée action."
    )
    if context_block:
        system_content += "\n\n" + context_block

    gemini_contents = [
        {"role": "user",  "parts": [{"text": system_content}]},
        {"role": "model", "parts": [{"text": "Compris. Prêt à approfondir l'analyse."}]},
    ]
    for msg in history[-20:]:
        role = "user" if msg.get("role") == "user" else "model"
        gemini_contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    gemini_contents.append({"role": "user", "parts": [{"text": message}]})

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        yield "data: " + json.dumps({"error": "GOOGLE_API_KEY non configuree"}) + "\n\n"
        return

    manager = GeminiModelManager(api_key)
    try:
        async def _task(model_name):
            model = manager.get_model(model_name)
            return await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=gemini_contents),
                timeout=60,
            )
        result = await manager.execute_with_fallback(_task, task_name="Chat analyse")
        if not result.get("success"):
            raise ValueError(result.get("message") or "Erreur IA")
        response_text = (getattr(result["result"], "text", "") or "").strip()
        save_message(session_id, "assistant", response_text)
        yield "data: " + json.dumps({"content": response_text}) + "\n\n"
        yield "data: " + json.dumps({"done": True}) + "\n\n"
    except Exception as e:
        logger.error("Erreur stream chat %s: %s", session_id, e)
        yield "data: " + json.dumps({"error": str(e)}) + "\n\n"


def _parse_json(text):
    raw = re.sub(r"^```json\s*", "", text.strip())
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match: raise
        return json.loads(match.group(0))