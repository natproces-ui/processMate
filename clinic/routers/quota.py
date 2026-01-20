from fastapi import APIRouter
from manager.model_manager import get_gemini_quota_usage

router = APIRouter(
    prefix="/quota",
    tags=["quota"]
)

# Remplace par tes valeurs
PROJECT_ID = "TON_PROJECT_ID"
SERVICE_ACCOUNT_FILE = "service-account.json"  # chemin vers le fichier JSON


@router.get("/")
def get_quota():
    """
    Retourne les quotas Gemini : utilisé / restant / limite.
    """
    try:
        quota = get_gemini_quota_usage(PROJECT_ID, SERVICE_ACCOUNT_FILE)

        # On transforme un peu pour un rendu clair
        response = {
            "success": True,
            "quotas": {}
        }

        for key, q in quota["quotas"].items():
            response["quotas"][key] = {
                "limit": q["limit"],
                "used": q["used"],
                "remaining": q["remaining"]
            }

        return response

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
