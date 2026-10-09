"""
Gestionnaire intelligent de modèles Gemini avec retry et fallback
VERSION OPTIMISÉE : 1 tentative par modèle avant switch
"""

import logging
from typing import Optional, Callable, Any, Dict
from enum import Enum
import asyncio
from google import genai
from google.genai import errors as genai_errors
from google.api_core import exceptions as google_exceptions
from config import GEMINI_MODEL_PRO, GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE
from manager.processing_level import ProcessingLevel, get_processing_level

logger = logging.getLogger(__name__)


class GeminiModel(Enum):
    """Modèles Gemini disponibles"""
    FLASH = GEMINI_MODEL_PRO
    FLASH_LITE = GEMINI_MODEL_LITE
    BALANCED = GEMINI_MODEL_FLASH


def get_models_for_request():
    """Ordre de secours par niveau ; comportement existant sans choix Studio."""
    models = {
        ProcessingLevel.FAST: [GeminiModel.FLASH_LITE, GeminiModel.BALANCED],
        ProcessingLevel.NORMAL: [GeminiModel.BALANCED, GeminiModel.FLASH_LITE],
        ProcessingLevel.DEEP: [GeminiModel.FLASH, GeminiModel.BALANCED],
    }.get(get_processing_level(), [GeminiModel.FLASH_LITE, GeminiModel.FLASH])
    return list(dict.fromkeys(models))


def get_primary_model(default: str) -> str:
    """Pour les appels directs : préserver le modèle habituel hors Studio."""
    return get_models_for_request()[0].value if get_processing_level() else default


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
        self.current_model = GeminiModel.FLASH_LITE

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
