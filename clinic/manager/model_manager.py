"""
Gestionnaire intelligent de modèles Gemini avec retry et fallback
VERSION OPTIMISÉE : 1 tentative par modèle avant switch
"""

import logging
from typing import Optional, Callable, Any, Dict, List
from enum import Enum
import asyncio
from google import genai
from google.genai import errors as genai_errors
from google.api_core import exceptions as google_exceptions
from config import GEMINI_MODEL_PRO, GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE, GEMINI_MODEL_TRANSCRIBE, GOOGLE_API_KEY
from manager.processing_level import ProcessingLevel, get_processing_level

logger = logging.getLogger(__name__)


class GeminiModel(Enum):
    """Modèles Gemini disponibles (noms réels dans config.py, surchargeables par env)."""
    PRO = GEMINI_MODEL_PRO      # Approfondi : réfléchit davantage
    FLASH = GEMINI_MODEL_FLASH  # Normal : équilibre rapidité / qualité
    LITE = GEMINI_MODEL_LITE    # Rapide


# Modèle principal puis secours, par niveau. Sans en-tête X-Processing-Level → Normal.
_MODELS_BY_LEVEL = {
    ProcessingLevel.FAST: [GeminiModel.LITE, GeminiModel.FLASH],
    ProcessingLevel.NORMAL: [GeminiModel.FLASH, GeminiModel.LITE],
    ProcessingLevel.DEEP: [GeminiModel.PRO, GeminiModel.FLASH],
}


def get_models_for_request() -> List[GeminiModel]:
    level = get_processing_level() or ProcessingLevel.NORMAL
    return list(dict.fromkeys(_MODELS_BY_LEVEL[level]))


def _is_retryable(e: Exception) -> bool:
    """Erreurs pour lesquelles on tente le modèle suivant (quota, surcharge, timeout, modèle retiré)."""
    if isinstance(e, (google_exceptions.ResourceExhausted, google_exceptions.DeadlineExceeded,
                      TimeoutError, genai_errors.ServerError)):
        return True
    return isinstance(e, genai_errors.ClientError) and getattr(e, "code", None) in (404, 429)


_shared_client: Optional[genai.Client] = None


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


def generate_content(contents: Any, config: Any = None, task_name: str = "Gemini",
                     models: Optional[List[GeminiModel]] = None):
    """Appel Gemini synchrone avec la chaîne de secours du niveau courant.

    Point d'entrée unique pour les appels directs (hors execute_with_fallback) :
    un seul client, mêmes modèles et même secours partout. Lève la dernière
    erreur si tous les modèles échouent, comme le faisait l'appel SDK direct.
    """
    models = models or get_models_for_request()  # liste imposée (ex : aiguillage toujours rapide)
    for i, model in enumerate(models):
        try:
            return _client().models.generate_content(model=model.value, contents=contents, config=config)
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
                    result = await task_func(model.value)

                    logger.info(f"✅ {task_name} réussi avec {model.value} (tentative {attempt})")

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
