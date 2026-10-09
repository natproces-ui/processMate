# clinic/processor/workflow_stream.py
"""
Lecture d'un JSON de procédure pendant qu'il arrive (génération en flux).

Le modèle écrit {"title", "procedureMetadata", "workflow": [{...}, {...}], "enrichments"}.
Dès qu'un objet du tableau "workflow" est complet, on le renvoie : le Studio peut
afficher la ligne sans attendre la fin. Le JSON final reste la référence (il est
relu en entier à la fin), les lignes envoyées ici ne sont qu'un aperçu.
"""
import json
import re
from typing import Any, Dict, List

_WORKFLOW_KEY = re.compile(r'"workflow"\s*:\s*\[')


class WorkflowRowStream:
    def __init__(self) -> None:
        self._buf = ""
        self._pos = -1          # position de lecture dans le tableau "workflow" (-1 : pas encore trouvé)
        self._closed = False
        self._decoder = json.JSONDecoder()

    @property
    def closed(self) -> bool:
        """Vrai quand le tableau "workflow" est terminé (la suite : enrichissements)."""
        return self._closed

    def feed(self, chunk: str) -> List[Dict[str, Any]]:
        """Ajoute un morceau de texte et renvoie les lignes devenues complètes."""
        self._buf += chunk
        rows: List[Dict[str, Any]] = []
        if self._closed:
            return rows
        if self._pos < 0:
            m = _WORKFLOW_KEY.search(self._buf)
            if not m:
                return rows
            self._pos = m.end()
        buf, n = self._buf, len(self._buf)
        while True:
            i = self._pos
            while i < n and buf[i] in " \t\r\n,":
                i += 1
            if i >= n:
                return rows
            if buf[i] == "]":
                self._closed = True
                return rows
            if buf[i] != "{":            # contenu inattendu : on laisse la lecture finale trancher
                self._closed = True
                return rows
            try:
                obj, end = self._decoder.raw_decode(buf, i)
            except json.JSONDecodeError:
                return rows              # objet encore incomplet
            self._pos = end
            if isinstance(obj, dict):
                rows.append(obj)
