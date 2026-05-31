"""
Gestionnaire intelligent de modèles Gemini avec retry et fallback
VERSION OPTIMISÉE : 1 tentative par modèle avant switch
"""

import logging
from typing import Optional, Callable, Any, Dict
from enum import Enum
import time
from google import genai
from google.genai import errors as genai_errors
from google.api_core import exceptions as google_exceptions

logger = logging.getLogger(__name__)


class GeminiModel(Enum):
    """Modèles Gemini disponibles"""
    FLASH = "gemini-2.5-pro"
    FLASH_LITE = "gemini-3.1-flash-lite-preview"


class ModelRetryStrategy:
    """
    Stratégie de retry intelligente avec fallback entre modèles

    Règles OPTIMISÉES :
    - Erreur 429 (quota expiré) → Switch immédiat vers modèle lite
    - Timeout → 1 tentative puis switch (pas 3 tentatives)
    - 503 (serveur indisponible) → Switch vers Flash Lite
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

        models_to_try = [GeminiModel.FLASH, GeminiModel.FLASH_LITE]

        for model in models_to_try:
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

                    if model == GeminiModel.FLASH:
                        logger.info("🔄 Switch immédiat vers Flash Lite (quota expiré)")
                        break  # Passer au modèle suivant
                    else:
                        return {
                            "success": False,
                            "error": "quota_exhausted",
                            "message": (
                                "⚠️ Les quotas gratuits de Gemini sont temporairement épuisés. "
                                "Veuillez réessayer dans quelques minutes ou utiliser une clé API payante."
                            )
                        }

                except (TimeoutError, google_exceptions.DeadlineExceeded) as e:
                    # Timeout
                    logger.warning(f"⏱️ Timeout sur {model.value} (tentative {attempt}/{self.max_retries}): {str(e)}")

                    if attempt < self.max_retries:
                        wait_time = self.retry_delay * attempt
                        logger.info(f"⏳ Attente de {wait_time}s avant retry...")
                        time.sleep(wait_time)
                        continue
                    else:
                        if model == GeminiModel.FLASH:
                            logger.info("🔄 Timeout sur Flash → Switch vers Flash Lite")
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
                    status = getattr(e, 'status_code', 503)
                    logger.warning(f"⚠️ Erreur serveur {status} sur {model.value}: {str(e)[:100]}")

                    if model == GeminiModel.FLASH:
                        logger.info(f"🔄 Erreur serveur {status} → Switch vers Flash Lite")
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
                    status = getattr(e, 'status_code', 400)
                    logger.error(f"❌ Erreur client {status} sur {model.value}: {str(e)[:200]}")
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


def get_gemini_quota_usage(project_id: str, service_account_file: str):
    from google.cloud import service_usage_v1
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_file(
        service_account_file,
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )

    client = service_usage_v1.ServiceUsageClient(credentials=credentials)

    parent = f"projects/{project_id}/services/generativelanguage.googleapis.com"
    service = client.get_service(name=parent)

    quotas = {}

    for metric in service.consumer_quota_metrics:
        for limit in metric.consumer_quota_limits:
            limit_name = limit.name.split("/")[-1]
            quotas[limit_name] = {
                "used": limit.quota_consumed,
                "limit": limit.limit,
                "remaining": max(0, limit.limit - limit.quota_consumed),
            }

    return {"success": True, "quotas": quotas}