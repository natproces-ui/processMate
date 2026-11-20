"""
Progression d'un tour de chat, en direct (lot B).

Pendant un tour, n'importe quel traitement (détection d'intention, rédaction, explication…)
peut signaler ce qu'il fait — étape précise ou morceau de texte — sans qu'on ait à passer
un rappel à travers toutes les fonctions : le studio pose un progress_scope, le traitement
appelle emit(). Fonctionne aussi depuis les threads (asyncio.to_thread copie le contexte).

Événements (mêmes formats que le flux SSE du studio) :
  {"type": "status", "id": …, "label": …, "state": "running" | "done"}
  {"type": "text_delta", "text": …}   texte de la réponse, au fil de l'écriture
"""

import asyncio
import itertools
import re
import logging
import weakref
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable, Dict, Iterator, Optional

_sink: ContextVar[Optional[Callable[[Dict[str, Any]], None]]] = ContextVar("turn_progress", default=None)


def active() -> bool:
    return _sink.get() is not None


def emit(event: Dict[str, Any]) -> None:
    sink = _sink.get()
    if sink is not None:
        try:
            sink(event)
        except Exception:
            pass  # la progression ne doit jamais faire échouer le traitement


def status(step_id: str, label: str, state: str = "running") -> None:
    emit({"type": "status", "id": step_id, "label": label[:200], "state": state})


# ── Ce que l'assistant pense, en quelques mots (comme Claude ou ChatGPT) ──
# Le modèle fournit des résumés de sa réflexion (en anglais) pendant qu'il travaille ; chacun est
# réécrit en une phrase française à la première personne et ajouté au suivi, dans l'ordre.

logger = logging.getLogger(__name__)
_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="narration")
_last: "weakref.WeakKeyDictionary[Callable, Future]" = weakref.WeakKeyDictionary()
_ids = itertools.count(1)

NARRATION_PROMPT = """Voici un résumé (souvent en anglais) de ce que fait un assistant qui travaille sur une procédure
bancaire ou sur des documents. Réécris-le en UNE phrase courte en français (18 mots au plus), à la première personne,
au présent, concrète : cite les étapes, acteurs, documents ou éléments précis. Pas de guillemets, pas de markdown,
pas de préambule. Parle comme à un utilisateur métier : jamais de termes techniques ni de noms de champs ou de format
(JSON, procedureMetadata, enrichissements, metadata, champ, id, typeBpmn, outputs, schéma, opérations…) ; traduis-les
en mots métier (« les informations de la fiche », « les rôles ») ou laisse-les de côté.
S'il ne dit rien de concret pour l'utilisateur (« je commence l'analyse », « je finalise le JSON », format de sortie,
champs à remplir), réponds exactement : -

Résumé :
"""


def _french_line(summary: str) -> str:
    from manager.model_manager import GeminiModel, generate_content
    r = generate_content(NARRATION_PROMPT + summary[:1500], None, "Narration",
                         models=[GeminiModel.LITE, GeminiModel.FLASH])
    line = (r.text or "").strip().strip('"«» ').splitlines()[0] if (r.text or "").strip() else ""
    if line in ("-", "–", "—"):
        return ""
    # élisions parfois perdues par le modèle rapide (« J analyse », « d une ») : on les rétablit
    line = re.sub(r"\b([JjDdLlNnSsCcMmTt]|[Qq]u) (?=[aeiouyhéèêëàâîïôûAEIOUYHÉÈÊÀÂÎÔÛ])", r"\1'", line)
    return line[:200]


def thought(summary: str) -> None:
    """Un résumé de réflexion reçu du modèle : traduit à part (sans ralentir le travail), affiché dans l'ordre."""
    sink = _sink.get()
    if sink is None or not (summary or "").strip():
        return
    prev = _last.get(sink)
    step_id = f"pensee{next(_ids)}"

    def work() -> None:
        try:
            line = _french_line(summary)
        except Exception as e:
            logger.debug(f"narration indisponible : {e}")
            line = ""
        if prev is not None:
            try:
                prev.result(timeout=30)  # garder l'ordre des pensées
            except Exception:
                pass
        if line:
            try:
                sink({"type": "status", "id": step_id, "label": line, "state": "done", "kind": "thought"})
            except Exception:
                pass

    try:
        _last[sink] = _pool.submit(work)
    except Exception:
        pass


def thoughts_pending() -> bool:
    """Des pensées sont encore en cours de traduction pour ce tour."""
    sink = _sink.get()
    fut = _last.get(sink) if sink is not None else None
    return fut is not None and not fut.done()


@contextmanager
def progress_scope(queue: "asyncio.Queue[Dict[str, Any]]") -> Iterator[None]:
    """Les événements émis dans ce bloc (et ses threads) vont dans la file, côté boucle."""
    loop = asyncio.get_running_loop()

    def sink(event: Dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    token = _sink.set(sink)
    try:
        yield sink
    finally:
        _sink.reset(token)


def pending(sink: Optional[Callable[[Dict[str, Any]], None]]) -> bool:
    """Des pensées de ce tour sont encore en cours de traduction."""
    fut = _last.get(sink) if sink is not None else None
    return fut is not None and not fut.done()
