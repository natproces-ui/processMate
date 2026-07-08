"""
data_transformer.py — Transforme les procédures ProcessMate en contexte textuel pour Gemini.

Extrait uniquement la substance métier :
  - workflow_json      : étapes BPMN (flux, acteurs, conditions, outils)
  - enrichments_json   : descriptif, applicatif, déclencheur, durée, KPI
  - procedure_metadata_json : nom, objet, périmètre, règles de gestion, définitions, abréviations

N'inclut PAS : RACI, lifecycle_stages, campagnes, remarques internes.
"""

from typing import List, Dict, Any


def build_sfd_context(
    procedures: List[Dict[str, Any]],
    scope_type: str,
    scope_name: str,
    scope_description: str = "",
    additional_sources: str = "",
) -> str:
    """
    Construit le bloc de contexte textuel structuré à injecter dans le prompt Gemini.

    Args:
        procedures:        Liste de workflow rows depuis Supabase (workflow_json, enrichments_json, procedure_metadata_json)
        scope_type:        'theme' | 'category' | 'subcategory' | 'procedures'
        scope_name:        Nom affiché du scope (ex: "Credoc Import")
        scope_description: Description du nœud taxonomique (optionnel)

    Returns:
        Bloc de texte structuré prêt pour le prompt.
    """
    scope_label = {
        "theme":       "Thème",
        "category":    "Catégorie",
        "subcategory": "Sous-catégorie",
        "procedures":  "Sélection de procédures",
    }.get(scope_type, scope_type.capitalize())

    lines: List[str] = [
        f"━━━ PÉRIMÈTRE DE GÉNÉRATION ━━━",
        f"Type de périmètre : {scope_label}",
        f"Nom : {scope_name}",
    ]
    if scope_description:
        lines.append(f"Description : {scope_description}")
    lines.append(f"Nombre de procédures : {len(procedures)}")
    lines.append("")

    for idx, proc in enumerate(procedures, start=1):
        meta       = proc.get("procedure_metadata_json") or {}
        workflow   = proc.get("workflow_json") or []
        enrichments = proc.get("enrichments_json") or {}

        nom       = meta.get("nom") or proc.get("title") or f"Procédure {idx}"
        ref       = meta.get("ref", "")
        objet     = meta.get("objet", "")
        perimetre = meta.get("perimetre") or meta.get("perimeter") or ""
        direction = meta.get("direction") or meta.get("pole") or meta.get("category") or ""
        rg_raw = meta.get("regles_gestion") or []
        if isinstance(rg_raw, str):
            regles_gestion = [r.strip() for r in rg_raw.split("\n") if r.strip()]
        else:
            regles_gestion = rg_raw
        abbreviations       = meta.get("abbreviations") or []
        definitions         = meta.get("definitions") or []
        resp_internes       = meta.get("responsabilites_internes") or []
        resp_externes       = meta.get("responsabilites_externes") or []

        lines.append(f"━━━ PROCÉDURE {idx}/{len(procedures)} : {nom} ━━━")
        if ref:
            lines.append(f"Référence : {ref}")
        if direction:
            lines.append(f"Direction / Pôle : {direction}")
        if objet:
            lines.append(f"Objet : {objet}")
        if perimetre:
            lines.append(f"Périmètre : {perimetre}")

        # ── Règles de gestion ────────────────────────────────────────────────
        if regles_gestion:
            lines.append("")
            lines.append("── Règles de gestion ──")
            for i, rg in enumerate(regles_gestion, start=1):
                rg_text = rg if isinstance(rg, str) else rg.get("description", str(rg))
                lines.append(f"{i}. {rg_text}")

        # ── Responsabilités / Acteurs ────────────────────────────────────────
        actors_seen: set = set()
        actor_lines: List[str] = []

        # Extraire acteurs depuis le workflow
        for step in workflow:
            acteur = step.get("acteur", "").strip()
            dept   = step.get("département", "").strip()
            type_a = step.get("typeActeur", "interne").strip().lower()
            if acteur and acteur not in actors_seen:
                actors_seen.add(acteur)
                label = f"{acteur}"
                if dept:
                    label += f" ({dept})"
                label += f" — {type_a}"
                actor_lines.append(label)

        # Ajouter responsabilités explicites
        for r in resp_internes:
            r_text = r if isinstance(r, str) else r.get("nom", str(r))
            if r_text and r_text not in actors_seen:
                actors_seen.add(r_text)
                actor_lines.append(f"{r_text} — interne")
        for r in resp_externes:
            r_text = r if isinstance(r, str) else r.get("nom", str(r))
            if r_text and r_text not in actors_seen:
                actors_seen.add(r_text)
                actor_lines.append(f"{r_text} — externe")

        if actor_lines:
            lines.append("")
            lines.append("── Acteurs identifiés ──")
            for a in actor_lines:
                lines.append(f"- {a}")

        # ── Workflow (étapes BPMN) ───────────────────────────────────────────
        if workflow:
            lines.append("")
            lines.append(f"── Workflow ({len(workflow)} étapes) ──")
            for step_idx, step in enumerate(workflow, start=1):
                step_id    = step.get("id", f"S{step_idx:02d}")
                etape      = step.get("étape") or step.get("etape", f"Étape {step_idx}")
                type_bpmn  = step.get("typeBpmn", "Task")
                dept       = step.get("département", "")
                acteur     = step.get("acteur", "")
                condition  = step.get("condition", "")
                outil      = step.get("outil", "")
                outputs    = step.get("outputs") or []

                step_line = f"{step_idx:02d}. [{type_bpmn}] {etape}"
                if dept or acteur:
                    parts = []
                    if dept:
                        parts.append(f"Département: {dept}")
                    if acteur:
                        parts.append(f"Acteur: {acteur}")
                    step_line += f" — {', '.join(parts)}"
                lines.append(step_line)

                if condition:
                    lines.append(f"    Condition: {condition}")
                if outil:
                    lines.append(f"    Outil/Système: {outil}")

                # Enrichissement de l'étape
                enrich = enrichments.get(step_id) or {}
                if enrich:
                    if enrich.get("descriptif"):
                        lines.append(f"    → Descriptif: {enrich['descriptif']}")
                    if enrich.get("applicatif"):
                        lines.append(f"    → Applicatif: {enrich['applicatif']}")
                    if enrich.get("declencheur"):
                        lines.append(f"    → Déclencheur: {enrich['declencheur']}")
                    if enrich.get("duree_estimee"):
                        lines.append(f"    → Durée estimée: {enrich['duree_estimee']}")
                    if enrich.get("frequence"):
                        lines.append(f"    → Fréquence: {enrich['frequence']}")
                    if enrich.get("kpi"):
                        lines.append(f"    → KPI: {enrich['kpi']}")

                # Sorties (transitions)
                if outputs:
                    for out in outputs:
                        if isinstance(out, dict):
                            target = out.get("targetId", "")
                            label  = out.get("label", "")
                            if label:
                                lines.append(f"    → [{label}] → {target}")
                            else:
                                lines.append(f"    → {target}")

        # ── Abréviations et définitions ──────────────────────────────────────
        if abbreviations:
            lines.append("")
            lines.append("── Abréviations ──")
            for abbr in abbreviations:
                if isinstance(abbr, dict):
                    lines.append(f"{abbr.get('abr', abbr.get('terme', ''))} : {abbr.get('def', abbr.get('definition', ''))}")
                elif isinstance(abbr, str):
                    lines.append(abbr)

        if definitions:
            lines.append("")
            lines.append("── Définitions ──")
            for defn in definitions:
                if isinstance(defn, dict):
                    lines.append(f"{defn.get('terme', '')} : {defn.get('definition', defn.get('def', ''))}")
                elif isinstance(defn, str):
                    lines.append(defn)

        lines.append("")

    if additional_sources and additional_sources.strip():
        lines.append("━━━ SOURCES COMPLÉMENTAIRES ━━━")
        lines.append(additional_sources.strip())
        lines.append("")

    return "\n".join(lines)
