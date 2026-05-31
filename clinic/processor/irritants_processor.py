# processor/irritants_processor.py
"""
IrritantsProcessor — Logique métier complète pour la gestion des irritants.

Responsabilités :
  - Détection automatique d'irritants par procédure (SSE)
  - Analyse ciblée d'un irritant existant (SSE)
  - Chat d'approfondissement par piste avec intent detection (SSE)
  - Persistance findings + pistes dans Supabase
  - Calcul de scores et helpers de lecture

Le router ne fait qu'appeler ce processor — aucune logique métier dans le router.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import AsyncGenerator, Optional

from database.supabase_client import get_supabase
from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# CONSTANTES MÉTIER
# ─────────────────────────────────────────────────────────────

FINDING_TO_CATEGORIE: dict[str, str] = {
    "automatisable": "Automatisation",
    "aller_retour":  "Rupture d'information",
    "notification":  "Rupture d'information",
    "interfacage":   "Rupture d'information",
    "delai":         "Délai / Attente",
    "outil":         "Outil / Système",
    "organisation":  "Organisation",
    "autre":         "Autre",
}

FINDING_TO_CRITICITE: dict[str, str] = {
    "Élevé":  "Majeur",
    "Moyen":  "Moyen",
    "Faible": "Mineur",
}

PISTE_STATUTS = ["proposée", "retenue", "rejetée", "en_cours"]

# ─────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────

_DETECT_PROMPT = """Tu es un expert senior en transformation des processus bancaires \
(Lean Banking, BPM, RPA, API Banking, SWIFT, BAM, BCEAO).

Détecte les vrais problèmes du workflow — ne fabrique rien.
Utilise EXACTEMENT les noms d'étapes du champ 'étape'. JAMAIS les IDs numériques.

{context}

WORKFLOW :
{workflow_str}

Retourne UNIQUEMENT du JSON valide (sans markdown) :

{{
  "findings": [
    {{
      "titre": "Titre précis max 80 chars",
      "categorie_irritant": "Rupture d'information",
      "categorie_finding": "interfacage",
      "etapes": ["nom exact étape X", "nom exact étape Y"],
      "constat": "Observation concrète 2-3 phrases",
      "pistes": [
        {{"titre": "Piste 1 max 60 chars", "description": "Solution précise avec outil nommé"}},
        {{"titre": "Piste 2", "description": "Solution intermédiaire"}},
        {{"titre": "Piste 3 optionnelle", "description": "Quick win si pertinent"}}
      ],
      "niveau": "Élevé"
    }}
  ]
}}

Catégories finding   : automatisable | aller_retour | notification | interfacage | delai | outil | organisation | autre
Catégories irritant  : Rupture d'information | Automatisation | Délai / Attente | Outil / Système | Organisation | Autre
Niveau               : Élevé | Moyen | Faible

Règles :
- 2 pistes minimum, 3 maximum — chacune différente et actionnable
- Piste 1 : solution idéale (RPA, API, BPM nommé)
- Piste 2 : solution intermédiaire (outil existant, process)
- Piste 3 : quick win si pertinent
- Maximum 8 findings — uniquement ce qui est réellement visible dans le workflow
- Titres précis et actionnables
- Rupture d'information = transfert manuel, mail, ressaisie, interface absente, statut non visible
- Automatisation = tâche manuelle répétitive, contrôle simple, génération document
- Délai / Attente = blocage, validation lente, dépendance externe
- Outil / Système = lenteur applicative, ergonomie, bug, fonctionnalité manquante
- Organisation = responsabilité floue, relais ambigu, acteurs mal définis"""


_APPROFONDIR_SYSTEM = """Tu es un expert senior en transformation des processus bancaires \
(Lean Banking, BPM, RPA, Core Banking, SWIFT, conformité BAM/BCEAO/BNB).

Tu approfondis une piste de résolution identifiée dans un processus bancaire.

CONTEXTE DE LA PISTE :
- Type de problème (finding) : {categorie_finding}
- Étapes concernées         : {etapes}
- Constat                   : {constat}
- Piste actuelle            : "{piste_titre}" — {piste_description}
- Extrait workflow          : {workflow_str}

─── RÈGLE ABSOLUE DE CALIBRAGE ────────────────────────────
Adapte TOUJOURS la longueur et la structure de ta réponse à la question posée.
- Question courte ou factuelle → réponse courte (2-5 phrases max), pas de titres, pas de listes
- Tu peux lister, numéroter, faire des titres si et seulement si la question le justifie clairement
- Question ouverte qui demande une analyse ou des recommandations → réponse développée, structurée
- Ne structure jamais avec des titres/listes si la question ne le justifie pas
- Réponds comme un expert en conversation, pas comme un rapport
────────────────────────────────────────────────────────────

─── INTENTIONS RECONNUES ───────────────────────────────────
APPROFONDIR  → Détails d'implémentation, ROI estimé, acteurs impliqués, risques, planning
CORRIGER     → Modifier la piste selon les instructions de l'utilisateur
VALIDER      → Confirmer la piste, produire un résumé final clair prêt à sauvegarder
REJETER      → Confirmer le rejet, suggérer une alternative concrète
REFERENCER   → Citer des références sectorielles (normes BAM, SWIFT gpi, ISO 20022, BCEAO…)
CLARIFIER    → L'intention est ambiguë — poser une question courte
────────────────────────────────────────────────────────────

Détecte l'intention et réponds de façon experte, calibrée sur la question.

Pour APPROFONDIR explicitement demandé : inclure —
  • Pourquoi cette piste est pertinente pour ce workflow précis
  • Étapes d'implémentation concrètes (3-5 étapes)
  • Outils/technologies recommandés avec justification
  • ROI estimé (réduction de délai, coût, erreurs)
  • Références sectorielles si applicables
  • Risques et points de vigilance

Pour CORRIGER : délimiter clairement la version corrigée.
Pour VALIDER  : résumé final en 2-3 phrases, clair et précis.

Termine TOUJOURS par cette ligne JSON en dernière ligne (rien après) :
{{"intent": "approfondir|corriger|valider|rejeter|referencer|clarifier", \
"piste_finale": "description finale si valider ou corriger, null sinon"}}"""

# ─────────────────────────────────────────────────────────────
# HELPERS INTERNES
# ─────────────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _parse_json_response(text: str) -> list[dict]:
    """Parse la réponse IA et retourne la liste de findings."""
    raw = re.sub(r"^```json\s*|\s*```$", "", text.strip())
    return json.loads(raw).get("findings", [])


def _get_api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        raise ValueError("GOOGLE_API_KEY manquante")
    return key


def _get_workflow_str(procedure_id: str, max_steps: int = 40) -> str:
    """Récupère le workflow JSON d'une procédure et le sérialise."""
    db = get_supabase()
    r = db.table("workflows").select("workflow_json, title") \
        .eq("id", procedure_id).execute()
    if not r.data or not r.data[0].get("workflow_json"):
        raise ValueError("Procédure sans étapes")
    wf = r.data[0]["workflow_json"][:max_steps]
    return json.dumps(wf, ensure_ascii=False, indent=2)


def _create_finding(db, irritant_id: str, fd: dict, ordre: int) -> dict:
    """Insère un finding + ses pistes, retourne le finding enrichi."""
    finding = db.table("findings").insert({
        "irritant_id": irritant_id,
        "categorie":   fd.get("categorie_finding", "autre"),
        "etapes":      fd.get("etapes", []),
        "constat":     fd.get("constat", ""),
        "niveau":      fd.get("niveau", "Moyen"),
        "source":      "ia",
        "ordre":       ordre,
    }).execute().data[0]

    pistes = []
    for j, p in enumerate(fd.get("pistes", [])):
        piste = db.table("pistes").insert({
            "finding_id":  finding["id"],
            "titre":       p.get("titre", ""),
            "description": p.get("description", ""),
            "statut":      "proposée",
            "source":      "ia",
            "ordre":       j,
        }).execute().data[0]
        pistes.append(piste)

    finding["pistes"] = pistes
    return finding


def _delete_old_findings(db, irritant_id: str) -> None:
    """Supprime les findings existants d'un irritant (cascade sur pistes)."""
    old = db.table("findings").select("id").eq("irritant_id", irritant_id).execute().data
    for of in old:
        db.table("findings").delete().eq("id", of["id"]).execute()


def _delete_old_asis_irritants(db, procedure_id: str) -> None:
    """Supprime les irritants ASIS existants d'une procédure avant re-détection."""
    try:
        old = db.table("irritants").select("id") \
            .eq("procedure_id", procedure_id).eq("statut", "ASIS").execute().data
        for o in old:
            db.table("irritants").delete().eq("id", o["id"]).execute()
    except Exception as e:
        logger.warning(f"Suppression anciens irritants ignorée : {e}")


# ─────────────────────────────────────────────────────────────
# HELPERS PUBLICS
# ─────────────────────────────────────────────────────────────

def compute_score(irritants: list[dict]) -> int:
    """Score de criticité global d'une liste d'irritants."""
    w = {"Majeur": 3, "Moyen": 2, "Mineur": 1}
    return sum(w.get(i.get("criticite", "Mineur"), 1) for i in irritants)


def get_findings_with_pistes(irritant_id: str) -> list[dict]:
    """Retourne les findings d'un irritant avec leurs pistes, triés par ordre."""
    db = get_supabase()
    findings = db.table("findings").select("*") \
        .eq("irritant_id", irritant_id).order("ordre").execute().data
    for f in findings:
        f["pistes"] = db.table("pistes").select("*") \
            .eq("finding_id", f["id"]).order("ordre").execute().data
    return findings


def get_piste_context(piste_id: str) -> tuple[dict, dict, str]:
    """
    Retourne (piste, finding, workflow_str) pour une piste donnée.
    Raises HTTPException 404 si introuvable.
    """
    from fastapi import HTTPException
    db = get_supabase()

    piste_r = db.table("pistes").select("*, findings(*)").eq("id", piste_id).execute()
    if not piste_r.data:
        raise HTTPException(404, "Piste introuvable")

    piste   = piste_r.data[0]
    finding = piste.get("findings") or {}

    workflow_str = "Non disponible"
    if finding.get("irritant_id"):
        irr_r = db.table("irritants").select("procedure_id") \
            .eq("id", finding["irritant_id"]).execute()
        if irr_r.data and irr_r.data[0].get("procedure_id"):
            try:
                workflow_str = _get_workflow_str(irr_r.data[0]["procedure_id"], max_steps=15)
            except Exception:
                pass

    return piste, finding, workflow_str


# ─────────────────────────────────────────────────────────────
# STREAM — Détection automatique par procédure
# ─────────────────────────────────────────────────────────────

async def stream_detect(procedure_id: str) -> AsyncGenerator[str, None]:
    """
    Détecte les irritants d'une procédure via IA.
    Yield : start → irritant × N → done | error
    """
    db = get_supabase()
    try:
        wf_r = db.table("workflows") \
            .select("workflow_json, title, procedure_metadata_json") \
            .eq("id", procedure_id).execute()

        if not wf_r.data or not wf_r.data[0].get("workflow_json"):
            yield _sse("error", {"message": "Procédure sans étapes"})
            return

        wf_data      = wf_r.data[0]
        meta         = wf_data.get("procedure_metadata_json") or {}
        proc_nom     = wf_data.get("title") or meta.get("nom", "Procédure")
        workflow_str = json.dumps(wf_data["workflow_json"], ensure_ascii=False, indent=2)

        manager = GeminiModelManager(_get_api_key())
        prompt  = _DETECT_PROMPT.format(
            context=f"PROCÉDURE : {proc_nom}",
            workflow_str=workflow_str,
        )

        yield _sse("start", {"message": f"Analyse de « {proc_nom} »…"})
        await asyncio.sleep(0.05)

        async def _task(mn: str):
            m = manager.get_model(mn)
            return await asyncio.wait_for(
                asyncio.to_thread(m.generate_content, model=mn, contents=prompt),
                timeout=120,
            )

        result = await manager.execute_with_fallback(_task, task_name="Détection irritants")
        if not result["success"]:
            yield _sse("error", {"message": result["message"]})
            return

        try:
            findings_data = _parse_json_response(result["result"].text)
        except (json.JSONDecodeError, KeyError):
            yield _sse("error", {"message": "Réponse IA non parseable"})
            return

        _delete_old_asis_irritants(db, procedure_id)

        created: list[dict] = []
        for i, fd in enumerate(findings_data):
            criticite = FINDING_TO_CRITICITE.get(fd.get("niveau", "Moyen"), "Moyen")
            categorie = fd.get("categorie_irritant") or FINDING_TO_CATEGORIE.get(
                fd.get("categorie_finding", "autre"), "Autre"
            )

            irr = db.table("irritants").insert({
                "titre":         fd.get("titre") or f"Irritant {i + 1}",
                "description":   fd.get("constat", ""),
                "categorie":     categorie,
                "procedure_id":  procedure_id,
                "procedure_nom": proc_nom,
                "etape_liee":    ", ".join(fd.get("etapes", [])),
                "criticite":     criticite,
                "statut":        "ASIS",
                "commentaires":  [],
                "ia_analyse":    "",
            }).execute().data[0]

            finding       = _create_finding(db, irr["id"], fd, ordre=i)
            irr["findings"] = [finding]
            created.append(irr)

            yield _sse("irritant", {"index": i, "irritant": irr})
            await asyncio.sleep(0.3)

        yield _sse("done", {
            "total":         len(created),
            "procedure_id":  procedure_id,
            "procedure_nom": proc_nom,
            "score":         compute_score(created),
        })

    except ValueError as e:
        yield _sse("error", {"message": str(e)})
    except Exception as e:
        logger.error(f"❌ stream_detect [{procedure_id}]: {e}", exc_info=True)
        yield _sse("error", {"message": str(e)})


# ─────────────────────────────────────────────────────────────
# STREAM — Analyse ciblée d'un irritant existant
# ─────────────────────────────────────────────────────────────

async def stream_analyse(irritant_id: str) -> AsyncGenerator[str, None]:
    """
    Re-analyse un irritant existant avec l'IA.
    Supprime les anciens findings et crée les nouveaux.
    Yield : start → finding × N → done | error
    """
    db = get_supabase()
    try:
        irr_r = db.table("irritants").select("*").eq("id", irritant_id).execute()
        if not irr_r.data:
            yield _sse("error", {"message": "Irritant introuvable"})
            return

        irritant = irr_r.data[0]
        if not irritant.get("procedure_id"):
            yield _sse("error", {"message": "Aucune procédure liée"})
            return

        workflow_str = _get_workflow_str(irritant["procedure_id"])

        context = (
            f"IRRITANT CIBLÉ :\n"
            f"- Titre       : {irritant['titre']}\n"
            f"- Catégorie   : {irritant['categorie']}\n"
            f"- Description : {irritant.get('description') or 'Non précisée'}\n"
            f"- Étape(s)    : {irritant.get('etape_liee') or 'Non précisée'}"
        )

        manager = GeminiModelManager(_get_api_key())
        prompt  = _DETECT_PROMPT.format(context=context, workflow_str=workflow_str)

        yield _sse("start", {"message": "Analyse en cours…"})
        await asyncio.sleep(0.05)

        async def _task(mn: str):
            m = manager.get_model(mn)
            return await asyncio.wait_for(
                asyncio.to_thread(m.generate_content, model=mn, contents=prompt),
                timeout=90,
            )

        result = await manager.execute_with_fallback(_task, task_name="Analyse ciblée")
        if not result["success"]:
            yield _sse("error", {"message": result["message"]})
            return

        try:
            findings_data = _parse_json_response(result["result"].text)
        except (json.JSONDecodeError, KeyError):
            yield _sse("error", {"message": "Réponse IA non parseable"})
            return

        _delete_old_findings(db, irritant_id)

        for i, fd in enumerate(findings_data):
            finding = _create_finding(db, irritant_id, fd, ordre=i)
            yield _sse("finding", {"index": i, "finding": finding})
            await asyncio.sleep(0.3)

        yield _sse("done", {"total": len(findings_data)})

    except ValueError as e:
        yield _sse("error", {"message": str(e)})
    except Exception as e:
        logger.error(f"❌ stream_analyse [{irritant_id}]: {e}", exc_info=True)
        yield _sse("error", {"message": str(e)})


# ─────────────────────────────────────────────────────────────
# STREAM — Chat d'approfondissement par piste
# ─────────────────────────────────────────────────────────────

async def stream_approfondir(piste_id: str, message: str) -> AsyncGenerator[str, None]:
    """
    Chat intelligent pour approfondir, corriger, valider ou rejeter une piste.

    Intent detection côté IA :
      approfondir | corriger | valider | rejeter | referencer | clarifier

    Actions automatiques :
      valider  → statut = 'retenue',   description mise à jour si piste_finale fournie
      corriger → statut = 'en_cours',  description mise à jour si piste_finale fournie
      rejeter  → statut = 'rejetée'

    Yield : start → response → done | error
    """
    db = get_supabase()
    try:
        piste, finding, workflow_str = get_piste_context(piste_id)

        history = db.table("piste_messages").select("role, content") \
            .eq("piste_id", piste_id).order("created_at").execute().data or []

        db.table("piste_messages").insert({
            "piste_id": piste_id,
            "role":     "user",
            "content":  message,
        }).execute()

        yield _sse("start", {"message": "Approfondissement en cours…"})
        await asyncio.sleep(0.05)

        system = _APPROFONDIR_SYSTEM.format(
            categorie_finding = finding.get("categorie", "autre"),
            etapes            = ", ".join(finding.get("etapes") or []),
            constat           = finding.get("constat", ""),
            piste_titre       = piste.get("titre", ""),
            piste_description = piste.get("description", ""),
            workflow_str      = workflow_str,
        )

        conv_lines = [
            f"{'Utilisateur' if h['role'] == 'user' else 'Assistant'}: {h['content']}"
            for h in history
        ]
        conv_lines.append(f"Utilisateur: {message}")
        full_prompt = system + "\n\n" + "\n\n".join(conv_lines)

        manager = GeminiModelManager(_get_api_key())

        async def _task(mn: str):
            m = manager.get_model(mn)
            return await asyncio.wait_for(
                asyncio.to_thread(m.generate_content, model=mn, contents=full_prompt),
                timeout=60,
            )

        result = await manager.execute_with_fallback(_task, task_name="Approfondissement")
        if not result["success"]:
            yield _sse("error", {"message": result["message"]})
            return

        response_text = result["result"].text.strip()

        intent, piste_finale = "approfondir", None
        lines     = response_text.split("\n")
        last_line = lines[-1].strip()
        try:
            if last_line.startswith("{") and last_line.endswith("}"):
                ctrl         = json.loads(last_line)
                intent       = ctrl.get("intent", "approfondir")
                piste_finale = ctrl.get("piste_finale")
                response_text = "\n".join(lines[:-1]).strip()
        except Exception:
            pass

        db.table("piste_messages").insert({
            "piste_id": piste_id,
            "role":     "assistant",
            "content":  response_text,
            "intent":   intent,
        }).execute()

        piste_updates: dict = {}
        if intent in ("valider", "corriger") and piste_finale:
            piste_updates["description"] = piste_finale
            piste_updates["statut"]      = "retenue" if intent == "valider" else "en_cours"
        elif intent == "rejeter":
            piste_updates["statut"] = "rejetée"

        if piste_updates:
            db.table("pistes").update(piste_updates).eq("id", piste_id).execute()

        yield _sse("response", {
            "content":      response_text,
            "intent":       intent,
            "piste_finale": piste_finale,
            "piste_id":     piste_id,
            "piste_statut": piste_updates.get("statut"),
        })
        yield _sse("done", {
            "intent":       intent,
            "piste_finale": piste_finale,
            "piste_statut": piste_updates.get("statut"),
        })

    except Exception as e:
        logger.error(f"❌ stream_approfondir [{piste_id}]: {e}", exc_info=True)
        yield _sse("error", {"message": str(e)})