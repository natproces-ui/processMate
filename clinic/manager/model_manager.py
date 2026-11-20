"""
Gestionnaire intelligent de modèles Gemini avec retry et fallback
VERSION OPTIMISÉE : 1 tentative par modèle avant switch
"""

import logging
from typing import Optional, Callable, Any, Dict, Iterator, List
from enum import Enum
import asyncio
import time
from contextlib import contextmanager
from contextvars import ContextVar
from types import SimpleNamespace
from google import genai
from google.genai import errors as genai_errors
from google.api_core import exceptions as google_exceptions
from config import (GEMINI_MODEL_PRO, GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE, GEMINI_MODEL_TRANSCRIBE, GOOGLE_API_KEY,
                    GEMINI_MODEL_VISION_FAST, GEMINI_MODEL_CODE_FAST, MODEL_ROUTING_ENABLED, STUDIO_USE_INTERACTIONS)
from manager.processing_level import ProcessingLevel, get_processing_level

logger = logging.getLogger(__name__)


class GeminiModel(Enum):
    """Modèles Gemini disponibles (noms réels dans config.py, surchargeables par env)."""
    PRO = GEMINI_MODEL_PRO      # Approfondi : réfléchit davantage
    FLASH = GEMINI_MODEL_FLASH  # Normal : équilibre rapidité / qualité
    LITE = GEMINI_MODEL_LITE    # Rapide
    # Profils spécialisés (manager/model_routing.py). Si une valeur égale une autre,
    # le membre devient un alias (comportement normal d'Enum) : aucun impact.
    VISION_FAST = GEMINI_MODEL_VISION_FAST  # images et PDF scannés, niveau Rapide
    CODE_FAST = GEMINI_MODEL_CODE_FAST      # code source, niveau Rapide


# Modèle principal puis secours, par niveau. Sans en-tête X-Processing-Level → Normal.
_MODELS_BY_LEVEL = {
    ProcessingLevel.FAST: [GeminiModel.LITE, GeminiModel.FLASH],
    ProcessingLevel.NORMAL: [GeminiModel.FLASH, GeminiModel.LITE],
    ProcessingLevel.DEEP: [GeminiModel.PRO, GeminiModel.FLASH],
}


def get_models_for_request() -> List[GeminiModel]:
    """Chaîne de modèles de la requête courante.

    Par défaut : selon le niveau seul. Si MODEL_ROUTING_ENABLED et qu'un routing_scope est
    posé (tâche + types de sources), selon la table de model_routing.
    """
    level = get_processing_level() or ProcessingLevel.NORMAL
    if MODEL_ROUTING_ENABLED:
        from manager.model_routing import current_routing, resolve
        routing = current_routing()
        if routing is not None:
            task, kinds = routing
            chain = list(dict.fromkeys(GeminiModel[name] for name in resolve(task, kinds, level)))
            logger.info(f"🧭 Routage : tâche={task.value} sources={','.join(kinds) or '-'} "
                        f"niveau={level.value} → {chain[0].value}")
            return chain
    return list(dict.fromkeys(_MODELS_BY_LEVEL[level]))


def _is_retryable(e: Exception) -> bool:
    """Erreurs pour lesquelles on tente le modèle suivant (quota, surcharge, timeout, modèle retiré)."""
    if isinstance(e, (google_exceptions.ResourceExhausted, google_exceptions.DeadlineExceeded,
                      TimeoutError, genai_errors.ServerError)):
        return True
    return isinstance(e, genai_errors.ClientError) and getattr(e, "code", None) in (404, 429)


_shared_client: Optional[genai.Client] = None


def _log_call(task_name: str, model: "GeminiModel", started: float, response: Any = None, fallback: bool = False) -> None:
    """Mesure par appel : tâche, modèle, secours, durée, jetons. Jamais de contenu utilisateur."""
    usage = getattr(response, "usage_metadata", None)
    tokens_in = getattr(usage, "prompt_token_count", None)
    tokens_out = getattr(usage, "candidates_token_count", None)
    logger.info(f"📏 {task_name} | modèle={model.value} | secours={'oui' if fallback else 'non'} | "
                f"{time.monotonic() - started:.1f}s | jetons={tokens_in}/{tokens_out}")
    from manager import usage_meter  # consommation par organisation (console plateforme)
    usage_meter.record(task_name, tokens_in, tokens_out)


def _client() -> genai.Client:
    global _shared_client
    if _shared_client is None:
        _shared_client = genai.Client(api_key=GOOGLE_API_KEY)
    return _shared_client


def transcribe_audio(audio_bytes: bytes, mime_type: str, language_codes: List[str] = ["fr-FR"]) -> str:
    """Dictée : texte fidèle d'un enregistrement audio.

    Modèle dédié gemini-3.5-transcribe via l'API Interactions (SDK google-genai >= 2.x).
    Si elle est indisponible (SDK plus ancien) ou échoue, secours sur la chaîne
    générale (Normal : FLASH puis LITE), qui transcrit aussi très bien.
    """
    import base64
    client = _client()
    if hasattr(client, "interactions"):
        try:
            it = client.interactions.create(
                model=GEMINI_MODEL_TRANSCRIBE,
                input=[{"type": "audio", "data": base64.b64encode(audio_bytes).decode(), "mime_type": mime_type}],
                generation_config={"transcription_config": {"language_codes": list(language_codes)}},
            )
            text = (getattr(it, "output_text", None) or "").strip()
            if text:
                return text
            logger.warning("⚠️ Transcription vide via le modèle dédié → secours")
        except Exception as e:
            logger.warning(f"⚠️ Modèle de transcription indisponible ({str(e)[:120]}) → secours")
    response = generate_content(
        [{"inline_data": {"mime_type": mime_type, "data": audio_bytes}},
         "Transcris fidèlement cet audio, sans le résumer ni le reformuler. Corrige seulement l'orthographe."],
        task_name="Transcription audio (secours)",
    )
    return (response.text or "").strip()


def _with_thoughts(config: Any) -> Any:
    """Config avec résumés de réflexion si un tour est affiché en direct (suivi « ce que je fais »),
    sinon None. Ne touche pas à un réglage de réflexion explicite."""
    from google.genai import types as gtypes
    from manager import turn_progress
    if not turn_progress.active():
        return None
    try:
        base = config if isinstance(config, gtypes.GenerateContentConfig) else (
            gtypes.GenerateContentConfig(**config) if isinstance(config, dict) else gtypes.GenerateContentConfig())
        tc = base.thinking_config
        if tc is not None and (tc.include_thoughts is not None or tc.thinking_budget == 0):
            return None
        new_tc = (tc.model_copy(update={"include_thoughts": True}) if tc is not None
                  else gtypes.ThinkingConfig(include_thoughts=True))
        return base.model_copy(update={"thinking_config": new_tc})
    except Exception:
        return None


def _chunk_parts(chunk: Any):
    """(texte, est_une_pensée) pour chaque morceau d'une réponse en flux."""
    try:
        parts = chunk.candidates[0].content.parts or []
    except Exception:
        parts = None
    if parts is None:
        text = getattr(chunk, "text", None)
        return [(text, False)] if text else []
    return [(p.text, bool(getattr(p, "thought", False))) for p in parts if getattr(p, "text", None)]


def generate_content_stream(contents: Any, config: Any = None, task_name: str = "Gemini",
                            models: Optional[List[GeminiModel]] = None):
    """Comme generate_content, mais renvoie le texte morceau par morceau (générateur synchrone).

    Bascule sur le modèle suivant seulement si rien n'a encore été envoyé : on ne
    mélange jamais deux réponses partielles.
    """
    models = models or get_models_for_request()
    narrate_cfg = _with_thoughts(config)
    for i, model in enumerate(models):
        started = False
        cfg = narrate_cfg if narrate_cfg is not None else config
        try:
            t0 = time.monotonic()
            chunk = None
            for chunk in _client().models.generate_content_stream(model=model.value, contents=contents, config=cfg):
                for text, is_thought in _chunk_parts(chunk):
                    if is_thought:
                        from manager import turn_progress
                        turn_progress.thought(text)
                    elif text:
                        started = True
                        yield text
            _log_call(task_name, model, t0, chunk if started else None, fallback=i > 0)
            return
        except Exception as e:
            if not started and narrate_cfg is not None:
                # résumés de réflexion refusés par ce modèle : même appel, sans eux
                logger.info(f"ℹ️ {task_name} : résumés de réflexion indisponibles sur {model.value} ({str(e)[:80]})")
                narrate_cfg = None
                yield from generate_content_stream(contents, config, task_name, models[i:])
                return
            if not started and i + 1 < len(models) and _is_retryable(e):
                logger.warning(f"⚠️ {task_name} : échec sur {model.value} ({str(e)[:120]}) → {models[i + 1].value}")
                continue
            raise


# ── API Interactions (lot 3) ────────────────────────────────────
# Recommandée par Google depuis juin 2026 (generateContent est « legacy »). Utilisée pour les
# appels faits dans un interactions_scope, si STUDIO_USE_INTERACTIONS=true. Toute erreur ou
# tout contenu non convertible → repli sur generateContent, sans effet visible.
# store=False pour un invité : Google ne conserve rien. L'identifiant de l'interaction est
# remonté dans le scope (enregistré sur le message de la conversation).

_interactions: ContextVar[Optional[Dict[str, Any]]] = ContextVar("interactions_scope", default=None)


@contextmanager
def interactions_scope(scope: Dict[str, Any]) -> Iterator[None]:
    """scope = {"store": bool, "ids": []} — partagé par référence avec l'appelant."""
    token = _interactions.set(scope)
    try:
        yield
    finally:
        _interactions.reset(token)


def _to_interaction_input(contents: Any) -> Optional[List[Dict[str, Any]]]:
    """Convertit les contenus generateContent (texte, inline_data, images PIL). None si impossible."""
    import base64
    import io
    items = contents if isinstance(contents, list) else [contents]
    out: List[Dict[str, Any]] = []
    for c in items:
        if isinstance(c, str):
            out.append({"type": "text", "text": c})
        elif isinstance(c, dict) and "inline_data" in c:
            data = c["inline_data"].get("data")
            mime = c["inline_data"].get("mime_type", "")
            if isinstance(data, bytes):
                data = base64.b64encode(data).decode()
            kind = "image" if mime.startswith("image/") else "document" if mime == "application/pdf" else None
            if not kind:
                return None
            out.append({"type": kind, "data": data, "mime_type": mime})
        elif c.__class__.__module__.startswith("PIL."):
            buf = io.BytesIO()
            img = c
            if img.mode not in ("RGB", "RGBA", "L", "LA"):
                # CMYK (diapositives, scans d'imprimeur), palettes… : PNG n'accepte que ces modes
                img = img.convert("RGBA" if "transparency" in img.info or img.mode == "PA" else "RGB")
            img.save(buf, format="PNG")
            out.append({"type": "image", "data": base64.b64encode(buf.getvalue()).decode(), "mime_type": "image/png"})
        else:
            return None
    return out


def _try_interaction(model: "GeminiModel", contents: Any, config: Any, task_name: str):
    scope = _interactions.get()
    if not STUDIO_USE_INTERACTIONS or scope is None:
        return None
    client = _client()
    if not hasattr(client, "interactions"):
        return None
    started = time.monotonic()
    try:
        # Toute erreur de conversion ou d'appel → generateContent : l'API Interactions
        # n'est qu'une voie préférée, jamais une cause d'échec du tour.
        payload = _to_interaction_input(contents)
        if payload is None:
            return None
        kwargs: Dict[str, Any] = {"model": model.value, "input": payload, "store": bool(scope.get("store"))}
        temperature = getattr(config, "temperature", None)
        if temperature is not None:
            kwargs["generation_config"] = {"temperature": temperature}
        it = client.interactions.create(**kwargs)
        text = getattr(it, "output_text", None)
        if not text:
            return None
        if getattr(it, "id", None) and scope.get("store"):
            scope.setdefault("ids", []).append(it.id)
        logger.info(f"📏 {task_name} | API Interactions | modèle={model.value} | {time.monotonic() - started:.1f}s")
        return SimpleNamespace(text=text, usage_metadata=getattr(it, "usage", None))
    except Exception as e:
        logger.warning(f"⚠️ {task_name} : API Interactions indisponible ({str(e)[:120]}) → generateContent")
        return None


def generate_content(contents: Any, config: Any = None, task_name: str = "Gemini",
                     models: Optional[List[GeminiModel]] = None):
    """Appel Gemini synchrone avec la chaîne de secours du niveau courant.

    Point d'entrée unique pour les appels directs (hors execute_with_fallback) :
    un seul client, mêmes modèles et même secours partout. Lève la dernière
    erreur si tous les modèles échouent, comme le faisait l'appel SDK direct.
    """
    models = models or get_models_for_request()  # liste imposée (ex : aiguillage toujours rapide)
    for i, model in enumerate(models):
        started = time.monotonic()
        via_interactions = _try_interaction(model, contents, config, task_name)
        if via_interactions is not None:
            return via_interactions
        try:
            response = _client().models.generate_content(model=model.value, contents=contents, config=config)
            _log_call(task_name, model, started, response, fallback=i > 0)
            return response
        except Exception as e:
            if i + 1 < len(models) and _is_retryable(e):
                logger.warning(f"⚠️ {task_name} : échec sur {model.value} ({str(e)[:120]}) → {models[i + 1].value}")
                continue
            raise


class ModelRetryStrategy:
    """
    Stratégie de retry intelligente avec fallback entre modèles

    Règles OPTIMISÉES :
    - Erreur 429 (quota expiré) → Switch immédiat vers modèle de secours
    - Timeout → 1 tentative puis switch (pas 3 tentatives)
    - 503 (serveur indisponible) → Switch vers le modèle de secours
    - 429 sur les deux modèles → Erreur finale
    """

    def __init__(self, max_retries: int = 1, retry_delay: float = 2.0):
        self.max_retries = max_retries  # ← 1 seule tentative par défaut
        self.retry_delay = retry_delay
        self.current_model = GeminiModel.FLASH

    async def execute_with_retry(
        self,
        task_func: Callable,
        task_name: str = "Gemini task"
    ) -> Dict[str, Any]:
        """
        Exécute une tâche Gemini avec stratégie de retry intelligente

        Args:
            task_func: Fonction async qui prend un model_name en paramètre
            task_name: Nom de la tâche pour les logs

        Returns:
            Dict avec "success", "result" ou "error"
        """

        models_to_try = get_models_for_request()

        for model_index, model in enumerate(models_to_try):
            has_fallback = model_index + 1 < len(models_to_try)
            logger.info(f"🤖 Tentative avec {model.value}")

            # Retry pour timeouts (1 seule fois maintenant)
            for attempt in range(1, self.max_retries + 1):
                try:
                    t0 = time.monotonic()
                    result = await task_func(model.value)
                    _log_call(task_name, model, t0, result, fallback=model_index > 0)

                    return {
                        "success": True,
                        "result": result,
                        "model_used": model.value,
                        "attempts": attempt
                    }

                except google_exceptions.ResourceExhausted as e:
                    # 429 - Quota expiré → Switch immédiat
                    logger.warning(f"⚠️ Quota expiré sur {model.value}: {str(e)}")

                    if has_fallback:
                        logger.info("🔄 Switch immédiat vers le modèle de secours (quota expiré)")
                        break  # Passer au modèle suivant
                    else:
                        return {
                            "success": False,
                            "error": "quota_exhausted",
                            "message": (
                                "⚠️ Les quotas du service sont temporairement atteints. "
                                "Veuillez réessayer dans quelques minutes."
                            )
                        }

                except (TimeoutError, google_exceptions.DeadlineExceeded) as e:
                    # Timeout
                    logger.warning(f"⏱️ Timeout sur {model.value} (tentative {attempt}/{self.max_retries}): {str(e)}")

                    if attempt < self.max_retries:
                        wait_time = self.retry_delay * attempt
                        logger.info(f"⏳ Attente de {wait_time}s avant retry...")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        if has_fallback:
                            logger.info("🔄 Timeout sur le modèle courant → Switch vers le modèle de secours")
                            break
                        else:
                            return {
                                "success": False,
                                "error": "timeout_exhausted",
                                "message": (
                                    "⏱️ L'analyse de cette image est trop complexe et prend trop de temps. "
                                    "Suggestions :\n"
                                    "- Simplifiez le diagramme\n"
                                    "- Réduisez la résolution de l'image\n"
                                    "- Divisez le processus en plusieurs images"
                                )
                            }

                except genai_errors.ServerError as e:
                    # 503 UNAVAILABLE ou autres erreurs serveur temporaires
                    status = getattr(e, 'code', None) or 503  # APIError expose le code HTTP dans .code
                    logger.warning(f"⚠️ Erreur serveur {status} sur {model.value}: {str(e)[:100]}")

                    if has_fallback:
                        logger.info(f"🔄 Erreur serveur {status} → Switch vers le modèle de secours")
                        break
                    else:
                        return {
                            "success": False,
                            "error": "server_error",
                            "message": (
                                "⚠️ Le service Gemini est temporairement indisponible (surcharge). "
                                "Veuillez réessayer dans quelques minutes."
                            )
                        }

                except genai_errors.ClientError as e:
                    # Erreurs client (4xx autres que 429)
                    status = getattr(e, 'code', None) or 400
                    logger.error(f"❌ Erreur client {status} sur {model.value}: {str(e)[:200]}")
                    if status == 429:
                        if has_fallback:
                            logger.info("🔄 Quota atteint → modèle de secours")
                            break
                        return {
                            "success": False,
                            "error": "quota_exhausted",
                            "message": "Les quotas du service sont temporairement atteints. Veuillez réessayer plus tard.",
                        }
                    if status == 404 and has_fallback:
                        # Modèle retiré par Google → on bascule sur le secours plutôt que d'échouer
                        logger.info("🔄 Modèle introuvable (404) → Switch vers le modèle de secours")
                        break
                    return {
                        "success": False,
                        "error": "client_error",
                        "message": f"Erreur de requête Gemini ({status}): {str(e)[:200]}"
                    }

                except Exception as e:
                    # Autre erreur inattendue
                    logger.error(f"❌ Erreur inattendue avec {model.value}: {str(e)}", exc_info=True)
                    return {
                        "success": False,
                        "error": "unexpected_error",
                        "message": f"Erreur inattendue lors de l'analyse: {str(e)}"
                    }

        # Ne devrait jamais arriver ici
        return {
            "success": False,
            "error": "unknown",
            "message": "Erreur inconnue lors de l'analyse"
        }


class GeminiModelManager:
    """
    Gestionnaire de modèles Gemini avec configuration centralisée
    """

    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.retry_strategy = ModelRetryStrategy(max_retries=1, retry_delay=2.0)

    def get_model(self, model_name: str):
        """Retourne l'objet models du client (nouveau SDK google.genai)"""
        return self.client.models

    async def execute_with_fallback(
        self,
        task_func: Callable,
        task_name: str = "Gemini task"
    ) -> Dict[str, Any]:
        """
        Wrapper pour exécuter une tâche avec fallback automatique
        """
        return await self.retry_strategy.execute_with_retry(task_func, task_name)
