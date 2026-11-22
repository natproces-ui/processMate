"""
Reconstitue le message de l'assistant d'un tour du Studio à partir des événements SSE
envoyés au navigateur, pour l'enregistrer dans conversation_messages.

Le payload reprend les champs du message affiché par ChatInterface (étapes, proposition,
générations, relecture, suggestions, résultat du chat) : à la réouverture, la conversation
s'affiche comme elle a été vue. Les procédures générées sont gardées en entier
(« generated ») pour rouvrir leurs onglets ; c'est l'utilisateur qui décide ensuite de les
enregistrer dans le référentiel.
"""

from typing import Any, Dict, List, Optional


def _chat_summary(intent: str, title: str, steps: int) -> str:
    verbs = {"generate": "généré", "regen": "regénéré", "web_search": "constitué depuis les connaissances réglementaires",
             "transcribe": "transcrit"}
    verb = verbs.get(intent)
    return f"Processus « {title} » {verb} — {steps} étapes" if verb else f"« {title} » — {steps} étapes"


class TurnRecorder:
    def __init__(self) -> None:
        self.role = "assistant"
        self.texts: List[str] = []
        self.steps: Dict[str, Dict[str, Any]] = {}
        self.payload: Dict[str, Any] = {}
        self.generated: List[Dict[str, Any]] = []
        self.error: Optional[str] = None
        self._streaming: Optional[int] = None
        self.chat_data: Optional[Dict[str, Any]] = None
        self.target_key: Optional[str] = None

    def feed(self, ev: Dict[str, Any]) -> None:
        t = ev.get("type")
        if t == "status":
            step = {"id": ev.get("id"), "label": ev.get("label"), "state": ev.get("state")}
            if ev.get("kind"):
                step["kind"] = ev["kind"]  # pensée du modèle : affichée comme du texte à la réouverture
            sid = ev.get("id", "")
            old = self.steps.get(sid)
            if old and old.get("state") == "running" and step.get("state") != "running" and not step.get("kind"):
                # action terminée après des pensées : elle passe à la suite (même ordre qu'à l'écran)
                self.steps.pop(sid)
            self.steps[sid] = step
        elif t == "message":
            if ev.get("text"):
                self.texts.append(ev["text"])
        elif t == "text_delta":
            # réponse écrite au fil de l'eau (analyse des sources) : un seul texte, complété morceau par morceau
            if self._streaming is None:
                self._streaming = len(self.texts)
                self.texts.append("")
            self.texts[self._streaming] += ev.get("text") or ""
        elif t == "text_reset":
            if self._streaming is not None:
                self.texts[self._streaming] = ""
        elif t == "procedures_archived":
            self.payload.setdefault("archived", []).append(
                {"keys": ev.get("keys") or [], "titles": ev.get("titles") or [], "by": ev.get("by") or []})
        elif t == "referential_proposal":
            self.payload["referentiel"] = ev.get("proposal") or {}
        elif t == "proposal":
            self.payload["proposal"] = {"procedures": ev.get("procedures") or [], "selected": ev.get("selected") or []}
        elif t == "procedure_started":
            self.payload.setdefault("generations", []).append(
                {"id": ev.get("id"), "title": ev.get("title"), "status": "generating"})
        elif t == "procedure_ready":
            self._set_generation(ev.get("id"), title=ev.get("title"), status="ready",
                                 steps=len(ev.get("workflow") or []))
            self.generated.append({"id": ev.get("id"), "title": ev.get("title"), "workflow": ev.get("workflow") or [],
                                   "enrichments": ev.get("enrichments") or {},
                                   "procedureMetadata": ev.get("procedureMetadata") or {}})
        elif t == "agent_proposal":
            self.payload.setdefault("agentProposals", []).append(
                {k: ev.get(k) for k in ("proposal_id", "kind", "explanation", "operations", "point", "point_id", "answer")})
        elif t == "open_points":
            # Rangés avec la procédure générée : ils reviennent avec elle à la réouverture
            for g in self.generated:
                if g.get("id") == ev.get("id"):
                    g["procedureMetadata"] = {**(g.get("procedureMetadata") or {}), "open_points": ev.get("points") or []}
        elif t == "procedure_error":
            self._set_generation(ev.get("id"), status="error", error=ev.get("message"))
        elif t == "remarks_delta":
            self.payload["remarks"] = self.payload.get("remarks", "") + (ev.get("text") or "")
        elif t == "suggestions":
            self.payload["suggestions"] = ev.get("items") or []
        elif t == "analysis":
            # analyse d'une procédure (irritants, améliorations, réglementaire) : éléments structurés gardés avec le message
            self.payload.setdefault("analyses", []).append(
                {k: ev.get(k) for k in ("kind", "titre", "procedure_key", "title", "elements")})
        elif t == "web_search":
            # recherche sur internet : requêtes et sources, affichées avec la réponse et dans le panneau
            self.payload.setdefault("searches", []).append({"queries": ev.get("queries") or [], "sources": ev.get("sources") or []})
        elif t == "chat_result":
            self._chat_result(ev.get("result") or {})
        elif t == "target_procedure":
            # le message visait une autre procédure de la conversation : son nom reste sur la carte
            self.payload["targetTitle"] = ev.get("title")
            self.target_key = ev.get("key")
        elif t == "error":
            self.error = ev.get("message")

    def _set_generation(self, gid: Any, **fields) -> None:
        for g in self.payload.setdefault("generations", []):
            if g.get("id") == gid:
                g.update({k: v for k, v in fields.items() if v is not None})
                return
        self.payload["generations"].append({"id": gid, **{k: v for k, v in fields.items() if v is not None}})

    def _chat_result(self, data: Dict[str, Any]) -> None:
        self.chat_data = data  # le serveur applique lui-même la modification (conversation_procedures)
        intent = data.get("intent") or "generate"
        self.payload["intent"] = intent
        if intent == "clarify":
            self.role = "clarify"
            self.texts.append(data.get("clarify_question") or "Pouvez-vous préciser votre demande ?")
        elif intent == "explain":
            self.texts.append(data.get("answer") or "")
        elif intent == "patch":
            self.texts.append(data.get("explanation") or "Modifications appliquées")
            self.payload["operationsCount"] = data.get("operations_count") or 0
        else:
            workflow = data.get("workflow") or []
            title = data.get("title") or "Procédure"
            self.payload.update({"title": title, "totalSteps": len(workflow)})
            self.texts.append(_chat_summary(intent, title, len(workflow)))
            if workflow:
                self.generated.append({"id": "chat", "title": title, "workflow": workflow,
                                       "enrichments": data.get("enrichments") or {},
                                       "procedureMetadata": data.get("procedureMetadata") or {}})

    def finish(self, stopped: bool = False) -> Dict[str, Any]:
        """Renvoie {role, content, payload} à enregistrer."""
        steps = list(self.steps.values())
        if stopped:
            for s in steps:
                if s.get("state") == "running":
                    s["state"] = "stopped"
            for g in self.payload.get("generations", []):
                if g.get("status") == "generating":
                    g["status"] = "stopped"
        payload = dict(self.payload)
        if steps:
            payload["steps"] = steps
        if self.generated:
            payload["generated"] = self.generated
        content = "\n\n".join(x for x in self.texts if x)
        if not content and self.error:
            content = self.error
        elif not content and stopped and not payload.get("generations"):
            content = "Arrêté."
        return {"role": self.role, "content": content, "payload": payload}
