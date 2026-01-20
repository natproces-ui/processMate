"""
Gestionnaire intelligent de modèles Gemini avec retry et fallback
"""

import logging
from typing import Optional, Callable, Any, Dict
from enum import Enum
import time
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

logger = logging.getLogger(__name__)


class GeminiModel(Enum):
    """Modèles Gemini disponibles"""
    FLASH = "gemini-2.5-flash"
    FLASH_LITE = "gemini-2.5-flash-lite"


class ModelRetryStrategy:
    """
    Stratégie de retry intelligente avec fallback entre modèles
    
    Règles :
    - Erreur 429 (quota expiré) → Switch immédiat vers modèle lite
    - Timeout → Retry 3x avec même modèle, puis switch
    - 429 sur les deux modèles → Erreur finale
    """
    
    def __init__(self, max_retries: int = 3, retry_delay: float = 2.0):
        self.max_retries = max_retries
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
            
            # Retry pour timeouts
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
                    # 429 - Quota expiré
                    logger.warning(f"⚠️ Quota expiré sur {model.value}: {str(e)}")
                    
                    if model == GeminiModel.FLASH:
                        logger.info("🔄 Switch vers Flash Lite")
                        break  # Passer au modèle suivant
                    else:
                        # Déjà sur Flash Lite, on ne peut plus fallback
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
                        # Retry avec le même modèle
                        wait_time = self.retry_delay * attempt
                        logger.info(f"⏳ Attente de {wait_time}s avant retry...")
                        time.sleep(wait_time)
                        continue
                    else:
                        # 3 échecs avec ce modèle
                        if model == GeminiModel.FLASH:
                            logger.info("🔄 3 timeouts sur Flash, switch vers Flash Lite")
                            break  # Passer au modèle suivant
                        else:
                            # Déjà sur Flash Lite après 3 timeouts
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
        genai.configure(api_key=api_key)
        self.retry_strategy = ModelRetryStrategy(max_retries=3, retry_delay=2.0)
        
    def get_model(self, model_name: str) -> genai.GenerativeModel:
        """Crée une instance de modèle Gemini"""
        return genai.GenerativeModel(model_name)
    
    async def execute_with_fallback(
        self,
        task_func: Callable,
        task_name: str = "Gemini task"
    ) -> Dict[str, Any]:
        """
        Wrapper pour exécuter une tâche avec fallback automatique
        """
        return await self.retry_strategy.execute_with_retry(task_func, task_name)
    




from google.cloud import service_usage_v1
from google.oauth2 import service_account

def get_gemini_quota_usage(project_id: str, service_account_file: str):
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
