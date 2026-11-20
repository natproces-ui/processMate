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
import time
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

NARRATION_PROMPT = """Voici un résumé (souvent en anglais, avec un titre en gras) de ce que fait un assistant qui
travaille sur une procédure bancaire ou sur des documents. Écris une ligne de suivi en français, comme celles de Claude :
une forme nominale de 9 mots au plus, qui dit concrètement ce qui se fait (étape, acteur, document précis),
terminée par un point. Exemples : « Regroupement des acteurs de la même entité. »,
« Fusion des étapes de création du contrat. », « Repérage des outils de l'étape Organiser. »
Pas de guillemets, pas de markdown, pas de préambule, aucun terme technique (JSON, procedureMetadata, enrichissements,
metadata, champ, id, typeBpmn, outputs, opérations…).
S'il ne dit rien de concret pour l'utilisateur (début d'analyse, mise en forme du résultat, format de sortie),
réponds exactement : -

Résumé :
"""

# Un suivi, pas un compte rendu : quelques lignes courtes par réponse, comme chez Claude
MAX_THOUGHTS = 5          # lignes par réponse
MIN_INTERVAL = 8.0        # secondes entre deux lignes affichées
_state: "weakref.WeakKeyDictionary[Callable, Dict[str, Any]]" = weakref.WeakKeyDictionary()


def _french_line(summary: str) -> str:
    from manager.model_manager import GeminiModel, generate_content
    r = generate_content(NARRATION_PROMPT + summary[:1500], None, "Narration",
                         models=[GeminiModel.LITE, GeminiModel.FLASH])
    line = (r.text or "").strip().strip('"«» ').splitlines()[0] if (r.text or "").strip() else ""
    if line in ("-", "–", "—", "-."):
        return ""
    # élisions parfois perdues par le modèle rapide (« J analyse », « d une ») : on les rétablit
    line = re.sub(r"\b([JjDdLlNnSsCcMmTt]|[Qq]u) (?=[aeiouyhéèêëàâîïôûAEIOUYHÉÈÊÀÂÎÔÛ])", r"\1'", line)
    return line[:120]


def _title(summary: str) -> str:
    m = re.search(r"\*\*(.+?)\*\*", summary or "")
    return re.sub(r"\W+", " ", (m.group(1) if m else summary[:60]).lower()).strip()


def thought(summary: str) -> None:
    """Un résumé de réflexion reçu du modèle : réécrit à part (sans ralentir le travail), affiché dans l'ordre.
    Au plus MAX_THOUGHTS lignes par réponse, espacées d'au moins MIN_INTERVAL secondes, sans doublon."""
    sink = _sink.get()
    if sink is None or not (summary or "").strip():
        return
    st = _state.setdefault(sink, {"shown": 0, "last": 0.0, "titles": set()})
    now = time.monotonic()
    title = _title(summary)
    if st["shown"] >= MAX_THOUGHTS or title in st["titles"] or (st["last"] and now - st["last"] < MIN_INTERVAL):
        return
    st["titles"].add(title)
    st["shown"] += 1  # compté dès l'envoi (rendu si rien n'est affiché)
    st["last"] = now  # réservé dès maintenant : les pensées suivantes attendent l'intervalle
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
        if not line:
            st["last"] = 0.0  # rien d'affiché : la pensée suivante peut prendre la place
            st["shown"] -= 1
            return
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
