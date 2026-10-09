"""Niveau de traitement propre à chaque requête Studio."""
from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from typing import Iterator, Optional


class ProcessingLevel(str, Enum):
    FAST = "fast"
    NORMAL = "normal"
    DEEP = "deep"


_processing_level: ContextVar[Optional[ProcessingLevel]] = ContextVar(
    "processing_level", default=None
)


def get_processing_level() -> Optional[ProcessingLevel]:
    return _processing_level.get()


@contextmanager
def processing_level_scope(level: Optional[ProcessingLevel]) -> Iterator[None]:
    token = _processing_level.set(level)
    try:
        yield
    finally:
        _processing_level.reset(token)
