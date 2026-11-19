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


@contextmanager
def progress_scope(queue: "asyncio.Queue[Dict[str, Any]]") -> Iterator[None]:
    """Les événements émis dans ce bloc (et ses threads) vont dans la file, côté boucle."""
    loop = asyncio.get_running_loop()

    def sink(event: Dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    token = _sink.set(sink)
    try:
        yield
    finally:
        _sink.reset(token)
