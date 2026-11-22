"""
Choix du modèle selon (type de tâche × type de source × niveau choisi).

L'utilisateur choisit Rapide / Normale / Approfondie et ne voit jamais le modèle. Le
système, lui, sait quelle tâche il exécute (aiguillage, génération, relecture…) et quelles
sources il traite (texte, PDF, PDF scanné, image, Word, PowerPoint, code) : il prend le
profil de modèles adapté, décliné selon le niveau.

Ce module est pur (aucun appel réseau, aucun SDK) : il renvoie des NOMS de membres de
GeminiModel (« PRO », « FLASH », « VISION_FAST »…). Les identifiants réels vivent dans
config.py. model_manager.get_models_for_request() lit le contexte posé ici.

Activation : MODEL_ROUTING_ENABLED=true. Sans le drapeau, ou hors d'un routing_scope,
rien ne change : seul le niveau décide, comme avant.
"""

import re
from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from typing import Iterable, Iterator, List, Optional, Sequence, Tuple

from manager.processing_level import ProcessingLevel


class TaskKind(str, Enum):
    AIGUILLAGE = "aiguillage"                    # comprendre la demande, découper en procédures
    SYNTHESE_COURTE = "synthese_courte"          # titres, résumés de conversation
    EXTRACTION = "extraction"                    # lire des sources et en tirer des éléments
    GENERATION_PROCEDURE = "generation_procedure"
    MODIFICATION_PROCEDURE = "modification_procedure"
    RELECTURE_CRITIQUE = "relecture_critique"
    ANALYSE_CODE = "analyse_code"
    AGENT = "agent"                              # boucle de l'agent outillé (lot 6) : profil selon les sources


class Profile(str, Enum):
    ROUTAGE = "routage"
    TEXTE = "texte"
    DOCUMENT = "document"
    VISION = "vision"
    CODE = "code"


# Profil → niveau → chaîne (principal puis secours), en noms de GeminiModel.
# Rapide ne monte jamais sur PRO ; le secours ne sert qu'en cas d'erreur du principal.
TABLE = {
    Profile.ROUTAGE: {
        ProcessingLevel.FAST: ["LITE", "FLASH"],
        ProcessingLevel.NORMAL: ["LITE", "FLASH"],
        ProcessingLevel.DEEP: ["FLASH", "LITE"],
    },
    Profile.TEXTE: {
        ProcessingLevel.FAST: ["LITE", "FLASH"],
        ProcessingLevel.NORMAL: ["FLASH", "LITE"],
        ProcessingLevel.DEEP: ["PRO", "FLASH"],
    },
    Profile.DOCUMENT: {
        ProcessingLevel.FAST: ["LITE", "FLASH"],
        ProcessingLevel.NORMAL: ["FLASH", "LITE"],
        ProcessingLevel.DEEP: ["PRO", "FLASH"],
    },
    Profile.VISION: {
        ProcessingLevel.FAST: ["VISION_FAST", "FLASH"],
        ProcessingLevel.NORMAL: ["FLASH", "VISION_FAST"],
        ProcessingLevel.DEEP: ["PRO", "FLASH"],
    },
    Profile.CODE: {
        ProcessingLevel.FAST: ["CODE_FAST", "LITE"],
        ProcessingLevel.NORMAL: ["FLASH", "CODE_FAST"],
        ProcessingLevel.DEEP: ["PRO", "FLASH"],
    },
}

# Plus exigeant d'abord : avec des sources mixtes, on prend le profil le plus exigeant.
_PRIORITY = [Profile.VISION, Profile.CODE, Profile.DOCUMENT, Profile.TEXTE]

_SOURCE_PROFILE = {
    "image": Profile.VISION,
    "pdf_scanne": Profile.VISION,
    "code": Profile.CODE,
    "pdf": Profile.DOCUMENT,
    "docx": Profile.DOCUMENT,
    "pptx": Profile.DOCUMENT,
    "texte": Profile.TEXTE,
}


def profile_for(task: TaskKind, source_kinds: Iterable[str] = ()) -> Profile:
    if task in (TaskKind.AIGUILLAGE, TaskKind.SYNTHESE_COURTE):
        return Profile.ROUTAGE
    if task == TaskKind.ANALYSE_CODE:
        return Profile.CODE
    profiles = {_SOURCE_PROFILE.get(k, Profile.TEXTE) for k in source_kinds}
    for p in _PRIORITY:
        if p in profiles:
            return p
    return Profile.TEXTE


def resolve(task: TaskKind, source_kinds: Iterable[str] = (),
            level: Optional[ProcessingLevel] = None) -> List[str]:
    level = level or ProcessingLevel.NORMAL
    return list(dict.fromkeys(TABLE[profile_for(task, source_kinds)][level]))


# ── Contexte de la requête ──────────────────────────────────────

_routing: ContextVar[Optional[Tuple[TaskKind, Tuple[str, ...]]]] = ContextVar("model_routing", default=None)


def current_routing() -> Optional[Tuple[TaskKind, Tuple[str, ...]]]:
    return _routing.get()


@contextmanager
def routing_scope(task: TaskKind, source_kinds: Sequence[str] = ()) -> Iterator[None]:
    """Pose la tâche et les sources pour tous les appels faits dans ce bloc (tâches et threads compris)."""
    token = _routing.set((task, tuple(source_kinds)))
    try:
        yield
    finally:
        _routing.reset(token)


# ── Détection du type de source ─────────────────────────────────

def is_scanned_pdf(data: bytes) -> bool:
    """PDF image (scanné) : des images mais aucune police.

    Heuristique sans dépendance. Si les objets sont compressés (flux d'objets PDF 1.5),
    les polices peuvent échapper à la recherche : le PDF passe alors pour scanné et part
    sur le profil vision, plus capable — erreur sans gravité.
    """
    if not data:
        return False
    return b"/Image" in data and b"/Font" not in data


def source_kinds_of(files: Iterable[dict]) -> List[str]:
    """Types de sources des entrées de studio_router._read_files (pdf, image, docx, pptx)."""
    kinds = []
    for f in files:
        t = f.get("type")
        if t == "pdf" and is_scanned_pdf(f.get("data") or b""):
            t = "pdf_scanne"
        kinds.append(t or "texte")
    return kinds or ["texte"]


# ── Ne jamais montrer un modèle à l'utilisateur ─────────────────

_MODEL_NAME = re.compile(r"(models/)?\b(gemini|gemma|imagen|lyria|veo)[-\w.]*", re.I)


def user_error(text: str) -> str:
    """Erreur du service d'IA, dite à l'utilisateur en français (jamais le message technique brut)."""
    raw = text or ""
    low = raw.lower()
    if "prepayment" in low or "credits are depleted" in low or ("402" in low and "resource_exhausted" in low) or "billing" in low:
        return ("Le service d'IA est indisponible : le crédit du compte est épuisé. "
                "Prévenez l'administrateur de ProcessMate ; votre travail est conservé.")
    if "429" in low or "resource_exhausted" in low or "quota" in low or "rate limit" in low:
        return "Le service d'IA est très sollicité en ce moment. Réessayez dans une minute ; votre travail est conservé."
    if "api key" in low or "permission_denied" in low or "unauthenticated" in low:
        return "Le service d'IA refuse l'accès (clé non valide). Prévenez l'administrateur de ProcessMate."
    if "503" in low or "unavailable" in low or "overloaded" in low:
        return "Le service d'IA est momentanément indisponible. Réessayez dans un instant."
    return scrub_model_names(raw)[:300]


def scrub_model_names(text: str) -> str:
    """Retire les identifiants de modèles d'un texte destiné à l'utilisateur (erreurs, messages)."""
    return _MODEL_NAME.sub("le service d'IA", text or "")
