# clinic/processor/studio_planner.py
"""
Aiguillage d'un tour de conversation du Studio.

Un appel rapide (modèle LITE, quel que soit le niveau choisi) lit le message et les
fichiers, repère les procédures et choisit l'action. Des garde-fous côté serveur
corrigent les décisions incohérentes : le modèle propose, le code dispose.
"""
import base64
import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from google.genai import types

from manager.model_manager import GeminiModel, generate_content
from config import MODEL_ROUTING_ENABLED
from prompts.studio_planner_prompt import build_planner_prompt

logger = logging.getLogger(__name__)

ACTIONS = {"generate", "propose", "merge", "edit", "analyze", "structure", "remove", "answer", "transcribe", "ask"}
# Au-delà, on ne génère pas sans que l'utilisateur ait validé la sélection
# Plafond technique (coût, durée) au-delà duquel on confirme ; en deçà, on fait ce qui est demandé
MAX_AUTO_GENERATE = 20


@dataclass
class StudioPlan:
    action: str
    reply: str
    procedures: List[Dict[str, Any]] = field(default_factory=list)
    targets: List[str] = field(default_factory=list)
    merged_title: Optional[str] = None
    references: List[str] = field(default_factory=list)  # fichiers modèles (style, format), pas des sources
    adjustments: List[str] = field(default_factory=list)  # corrections appliquées par les garde-fous
    # Procédures DE LA CONVERSATION (numéros 1…n) que ce tour remplace (découpage, fusion, refonte) ou retire
    replaces: List[int] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action, "reply": self.reply, "procedures": self.procedures,
            "targets": self.targets, "merged_title": self.merged_title, "references": self.references, "adjustments": self.adjustments,
            "replaces": self.replaces,
        }


def file_to_parts(f: Dict[str, Any]) -> list:
    """Même envoi que la découverte : PDF tel quel, image réduite à 1024 px, Office extrait."""
    from processor.office_extract import EXTRACTED_TYPES
    if f.get("type") in EXTRACTED_TYPES:
        from processor.office_extract import office_parts
        return office_parts(f)
    raw = f.get("data")
    if not raw:
        return []
    try:
        if f["type"] == "pdf":
            return [{"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(raw).decode()}}]
        if f["type"] == "image":
            from PIL import Image
            img = Image.open(io.BytesIO(raw))
            if max(img.size) > 1024:
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            from processor.office_extract import to_sendable
            return [to_sendable(img)]
    except Exception as e:
        logger.error(f"❌ Fichier illisible {f.get('filename')}: {e}")
    return []


def _parse_json(text: str) -> Dict[str, Any]:
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    match = re.search(r"\{[\s\S]*\}", text)
    return json.loads(match.group(0) if match else text)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def mentioned_procedures(message: str, titles: List[str]) -> List[int]:
    """Numéros (1…n) des procédures de la conversation nommées dans le message : tous les mots
    significatifs du titre (4 lettres et plus) y figurent, ou son premier mot quand aucun autre titre ne
    commence par lui (« Former » pour « Former les intérimaires »)."""
    import unicodedata

    def words(text: str) -> List[str]:
        text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
        return re.findall(r"[a-z0-9]+", text)
    said = set(words(message))
    keys = [[w for w in words(t) if len(w) >= 4 and w not in {"procedure", "formacash", "etape"}] for t in titles]
    firsts = [k[0] for k in keys if k]
    out = []
    for n, key in enumerate(keys, 1):
        if key and (all(w in said for w in key) or (key[0] in said and firsts.count(key[0]) == 1)):
            out.append(n)
    return out


def apply_guardrails(
    data: Dict[str, Any],
    filenames: List[str],
    has_workflow: bool,
    previous_proposal: Optional[List[Dict[str, Any]]] = None,
    conversation_count: int = 0,
    conversation_titles: Optional[List[str]] = None,
    message: str = "",
) -> StudioPlan:
    adjustments: List[str] = []
    conversation_count = max(conversation_count, len(conversation_titles or []))
    action = data.get("action") if data.get("action") in ACTIONS else "answer"
    reply = (data.get("reply") or "").strip()

    # Une procédure doit citer au moins un fichier réellement joint (pas d'invention depuis un sommaire)
    known = {_norm(f): f for f in filenames}
    references = [known[_norm(r)] for r in (data.get("references") or []) if _norm(r) in known]
    ref_set = set(references)
    procedures: List[Dict[str, Any]] = []
    for p in data.get("procedures") or []:
        # procédures de la conversation dont celle-ci part (sa matière principale, corrections comprises)
        base = []
        for n in p.get("base") or []:
            try:
                n = int(n)
            except (TypeError, ValueError):
                continue
            if 1 <= n <= conversation_count and n not in base:
                base.append(n)
        p = {**p, "base": base}
        sources = []
        for s in p.get("sources") or []:
            real = known.get(_norm(s.get("file", "")))
            if real is None and len(filenames) == 1:
                real = filenames[0]  # un seul fichier : la source ne peut être que lui
            if real and real not in ref_set:  # un fichier de référence n'est pas une source
                sources.append({"file": real, "pages": s.get("pages") or None})
        if p.get("title") and (sources or base):
            procedures.append({**p, "sources": sources})
        elif p.get("title"):
            adjustments.append(f"écartée faute de source : {p.get('title')}")

    # Suite d'une proposition (« prends la 2 ») : pas de nouveaux fichiers, on garde la liste précédente
    if not procedures and previous_proposal and action in ("generate", "merge", "propose"):
        procedures = previous_proposal

    seen, unique = set(), []
    for i, p in enumerate(procedures, 1):
        pid = p.get("id") if p.get("id") and p.get("id") not in seen else f"p{i}"
        seen.add(pid)
        unique.append({**p, "id": pid})
    procedures = unique
    ids = [p["id"] for p in procedures]
    targets = [t for t in (data.get("targets") or []) if t in ids]

    # « Modifier » ne touche qu'UNE procédure. Une demande qui nomme plusieurs procédures de la conversation
    # (« déplace le contrôle de Former dans Vérifier ») les refait chacune à partir d'elle-même
    named = mentioned_procedures(message, conversation_titles or [])
    if action == "edit" and len(named) >= 2 and not procedures:
        # chacune voit toutes les procédures nommées : une étape déplacée garde son acteur et son outil d'origine
        procedures = [{"id": f"p{i}", "title": conversation_titles[n - 1], "base": list(named), "sources": [],
                       "description": f"« {conversation_titles[n - 1]} » après cette demande : {message.strip()[:300]}"}
                      for i, n in enumerate(named, 1)]
        ids = [p["id"] for p in procedures]
        reply = "Je refais " + " et ".join(f"« {conversation_titles[n - 1]} »" for n in named) + " pour appliquer votre demande."
    based = sorted({n for p in procedures for n in p.get("base") or []})
    if action == "edit" and procedures and (len(based) >= 2 or len(procedures) >= 2) and based:
        action = "generate"
        targets = [p["id"] for p in procedures]
        data = {**data, "remplace": data.get("remplace") or based}
        adjustments.append("modification de plusieurs procédures : traitée comme une opération sur l'ensemble")
    if action == "ask" and not reply:
        action = "answer"
    if action == "edit" and not has_workflow:
        action = "generate" if procedures else "answer"
        adjustments.append("edit sans procédure ouverte")
    # Transcrire porte sur un fichier joint ; sans fichier, le chat recopie le texte donné
    if action == "transcribe" and not filenames:
        action = "edit"
        adjustments.append("transcription sans fichier : confiée au chat")
    if action in ("generate", "propose", "merge") and not procedures:
        if not filenames:
            # sans fichier ni procédure existante dont partir : le chat rédige à partir du texte
            action = "edit"
            adjustments.append("création à partir du texte : confiée au chat")
        else:
            action = "answer"
            reply = reply or "Je n'ai pas trouvé de procédure exploitable dans ces fichiers. Pouvez-vous préciser ce que vous attendez ?"
            adjustments.append("aucune procédure repérée")
    # Une seule procédure proposée : le modèle ne la génère pas d'office quand le message ne fait que
    # présenter le fichier (« voici notre support ») ; l'utilisateur confirme d'un clic.
    if action == "merge" and not targets:
        targets = ids
    if action == "generate" and not targets:
        targets = ids  # demande de formalisation sans cible précise : toutes les procédures trouvées
    if action == "generate" and len(targets) > MAX_AUTO_GENERATE:
        action = "propose"
        adjustments.append(f"{len(targets)} procédures : confirmation demandée")
        reply = f"J'ai trouvé {len(targets)} procédures : c'est beaucoup d'un coup. Je les formalise toutes, ou seulement certaines ?"

    # Procédures de la conversation remplacées ou retirées : numéros valables seulement
    replaces: List[int] = []
    for n in data.get("remplace") or []:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= conversation_count and n not in replaces:
            replaces.append(n)
    # Une procédure rendue telle quelle (même titre, partie d'elle seule, non nommée dans la demande) alors que
    # d'autres changent vraiment : elle reste comme elle est, on ne la refait pas
    titles_n = {i: _norm(t) for i, t in enumerate(conversation_titles or [], 1)}
    if action == "generate" and replaces and len(procedures) >= 2:
        def unchanged(p):
            b = p.get("base") or []
            return len(b) == 1 and b[0] not in named and titles_n.get(b[0]) == _norm(p.get("title") or "")
        same = [p for p in procedures if p["id"] in targets and unchanged(p)]
        if same and len(same) < len([t for t in targets]):
            drop = {p["id"] for p in same}
            kept_n = {p["base"][0] for p in same}
            targets = [t for t in targets if t not in drop]
            procedures = [p for p in procedures if p["id"] not in drop]
            replaces = [n for n in replaces if n not in kept_n]
            adjustments.append(f"{len(same)} procédure(s) inchangée(s) non refaite(s)")
    if action == "remove" and not replaces:
        action = "answer"
        reply = reply or "Je ne vois pas quelle procédure retirer. Laquelle ?"
        adjustments.append("retrait sans procédure désignée")
    if action not in ("generate", "merge", "remove"):
        replaces = []
    # Jamais régénérer une procédure déjà dans la conversation qui n'est pas remplacée (« il en manque une »,
    # découpage) : seules les nouvelles partent en génération
    kept = {_norm(t) for i, t in enumerate(conversation_titles or [], 1) if i not in replaces}
    if action == "generate" and kept:
        fresh = [t for t in targets if _norm(next((p["title"] for p in procedures if p["id"] == t), "")) not in kept]
        if fresh and len(fresh) < len(targets):
            adjustments.append(f"{len(targets) - len(fresh)} procédure(s) déjà dans la conversation non régénérée(s)")
            targets = fresh

    if adjustments:
        logger.info(f"🧭 Aiguillage corrigé : {adjustments}")
    return StudioPlan(
        action=action, reply=reply, procedures=procedures, targets=targets,
        merged_title=(data.get("merged_title") or None) if action == "merge" else None,
        references=references,
        adjustments=adjustments,
        replaces=replaces,
    )


def plan_turn(
    message: str,
    files: List[Dict[str, Any]],
    has_workflow: bool,
    history: Optional[List[Dict[str, str]]] = None,
    previous_proposal: Optional[List[Dict[str, Any]]] = None,
    referential_pending: bool = False,
    conversation_procedures: Optional[List[Dict[str, Any]]] = None,
) -> StudioPlan:
    """Appel synchrone (à lancer dans asyncio.to_thread)."""
    filenames = [f["filename"] for f in files]
    parts: list = [build_planner_prompt(message, filenames, has_workflow, history, previous_proposal, referential_pending,
                                        conversation_procedures)]
    for f in files:
        parts.append(f"--- Fichier : {f['filename']} ---")
        parts.extend(file_to_parts(f))
    def ask(prompt_parts: list, models) -> Dict[str, Any]:
        response = generate_content(
            prompt_parts,
            config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json"),
            task_name="Aiguillage Studio",
            models=models,
        )
        try:
            return _parse_json(response.text)
        except Exception as e:
            logger.warning(f"⚠️ Réponse d'aiguillage illisible ({e}) : {(response.text or '')[:200]}")
            return {"action": "answer", "reply": ""}

    # Toujours rapide : la qualité se joue à la génération. Avec le routage activé,
    # la table de model_routing (profil « routage ») décide, toujours sans PRO en Rapide/Normale.
    data = ask(parts, None if MODEL_ROUTING_ENABLED else [GeminiModel.LITE, GeminiModel.FLASH])
    # Un nombre demandé (« les 6 processus ») qui n'est pas atteint : une relecture avec le modèle plus fort
    wanted = asked_count(message)
    found = len(data.get("procedures") or [])
    if wanted and files and data.get("action") in ("generate", "propose") and found < wanted:
        hint = (f"\n\nATTENTION : l'utilisateur attend {wanted} procédures et tu en as listé {found}. Relis les fichiers : "
                "cherche les processus décrits séparément (variantes, circuits distincts, diapositives propres). "
                f"S'il y en a vraiment {found}, garde {found} et explique-le dans \"reply\".")
        retry = ask([parts[0] + hint] + parts[1:], [GeminiModel.FLASH, GeminiModel.LITE])
        if len(retry.get("procedures") or []) > found:
            data = retry
    plan = apply_guardrails(data, filenames, has_workflow, previous_proposal, len(conversation_procedures or []),
                            [p.get("titre") or "" for p in conversation_procedures or []], message)
    if wanted and plan.action in ("generate", "propose") and 0 < len(plan.procedures) < wanted and str(wanted) not in plan.reply:
        n = len(plan.procedures)
        plan.reply = (plan.reply + f" Vous en attendiez {wanted} : les fichiers en décrivent {n} distinctes. "
                      "Dites-moi laquelle découper si besoin.").strip()
    return plan


_COUNT = re.compile(r"\b(\d{1,2}|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:proc[ée]dures?|process(?:us)?|logigrammes?)\b", re.I)
_WORDS = {"deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10}


def asked_count(message: str) -> Optional[int]:
    """« les 6 process », « six procédures » : le nombre demandé, s'il y en a un."""
    m = _COUNT.search(message or "")
    if not m:
        return None
    raw = m.group(1).lower()
    n = int(raw) if raw.isdigit() else _WORDS.get(raw)
    return n if n and 1 < n <= 40 else None
