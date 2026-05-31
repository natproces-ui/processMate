from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

# Import de la configuration centralisée
from config import API_CONFIG, CORS_CONFIG, IS_PRODUCTION, FRONTEND_URL, GOOGLE_API_KEY

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Importer les routers
from routers import format1_router, format2_router, word_router, sfd_router, generator_router,mockup_router

# Créer l'application FastAPI
app = FastAPI(**API_CONFIG)

# Configuration CORS
app.add_middleware(CORSMiddleware, **CORS_CONFIG)

# Inclure les routers
app.include_router(format1_router)
app.include_router(format2_router)
app.include_router(word_router)
app.include_router(sfd_router)
app.include_router(generator_router)
app.include_router(mockup_router)


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🚀 SFD Generator API Started")
    logger.info(f"📦 Version: 2.0.0")
    logger.info(f"🌍 Environment: {'PRODUCTION' if IS_PRODUCTION else 'DEVELOPMENT'}")
    logger.info(f"🔗 Frontend URL: {FRONTEND_URL}")
    logger.info(f"🔑 Google API Key: {'✅ Configured' if GOOGLE_API_KEY else '❌ Missing'}")
    logger.info("=" * 60)
    logger.info("")
    logger.info("📋 Endpoints disponibles:")
    logger.info("  Format 1 (Classique):")
    logger.info("    POST   /api/format1/extract-json")
    logger.info("    POST   /api/format1/extract-download")
    logger.info("    GET    /api/format1/download-json/{filename}")
    logger.info("  Format 2 (Agile):")
    logger.info("    POST   /api/format2/extract-json")
    logger.info("    POST   /api/format2/extract-download")
    logger.info("    GET    /api/format2/download-json/{filename}")
    logger.info("  Word Generation:")
    logger.info("    POST   /api/word/json-file-to-word-download")
    logger.info("    POST   /api/word/json-text-to-word-download")
    logger.info("    POST   /api/word/generate (legacy)")
    logger.info("    GET    /api/word/download/{filename}")
    logger.info("  SFD Generator (Exploration Web + Documents):")
    logger.info("    POST   /api/sfd/generate")
    logger.info("    POST   /api/sfd/generate-json")
    logger.info("    GET    /api/sfd/download/{filename}")
    logger.info("    GET    /api/sfd/health")
    logger.info("")
    logger.info("📝 Formats supportés:")
    logger.info("  Documents: PDF, DOCX, DOC, PPTX, PPT, TXT")
    logger.info("  Images: JPG, JPEG, PNG, GIF, WEBP")
    logger.info("")
    logger.info("=" * 60)


@app.get("/")
async def root():
    """
    Page d'accueil de l'API SFD Generator

    Retourne les informations sur l'API et la liste des endpoints disponibles.
    """
    return {
        "message": "Bienvenue sur l'API SFD Generator",
        "version": "2.0.0",
        "environment": "production" if IS_PRODUCTION else "development",
        "documentation": "/docs",
        "endpoints": {
            "format1": {
                "extract_json": "POST /api/format1/extract-json",
                "extract_download": "POST /api/format1/extract-download",
                "download_json": "GET /api/format1/download-json/{filename}",
                "health": "GET /api/format1/health"
            },
            "format2": {
                "extract_json": "POST /api/format2/extract-json",
                "extract_download": "POST /api/format2/extract-download",
                "download_json": "GET /api/format2/download-json/{filename}",
                "health": "GET /api/format2/health"
            },
            "word": {
                "json_file_to_word": "POST /api/word/json-file-to-word-download",
                "json_text_to_word": "POST /api/word/json-text-to-word-download",
                "generate_legacy": "POST /api/word/generate",
                "download": "GET /api/word/download/{filename}",
                "health": "GET /api/word/health"
            },
            "sfd": {
                "generate": "POST /api/sfd/generate",
                "generate_json": "POST /api/sfd/generate-json",
                "download": "GET /api/sfd/download/{filename}",
                "health": "GET /api/sfd/health"
            }
        },
        "features": {
            "supported_formats": ["PDF", "DOCX", "DOC", "PPTX", "PPT", "TXT", "JPG", "PNG", "GIF", "WEBP"],
            "max_file_size": "10 MB",
            "output_formats": ["JSON", "DOCX"],
            "sfd_formats": ["Format 1 (Classique)", "Format 2 (Agile)", "SFD (Exploration Web + Docs)"]
        },
        "workflow": {
            "step1": "Upload un fichier ou coller du texte",
            "step2": "Choisir le format (Format 1, Format 2 ou SFD)",
            "step3": "Extraction / exploration automatique par Gemini AI",
            "step4": "Récupérer le JSON ou générer un Word"
        }
    }


@app.get("/health")
async def health():
    """
    Vérifier la santé de l'API

    Retourne le statut de tous les services.
    """
    playwright_available = False
    try:
        from playwright.async_api import async_playwright  # noqa: F401
        playwright_available = True
    except ImportError:
        pass

    return {
        "status": "healthy",
        "version": "2.0.0",
        "environment": "production" if IS_PRODUCTION else "development",
        "api_key_configured": bool(GOOGLE_API_KEY),
        "services": {
            "format1": "operational",
            "format2": "operational",
            "word_generator": "operational",
            "sfd_generator": "operational",
            "gemini_ai": "connected" if GOOGLE_API_KEY else "disconnected",
            "playwright": "available" if playwright_available else "unavailable (fallback httpx)"
        },
        "supported_operations": {
            "extraction": ["format1", "format2"],
            "generation": ["word_docx", "sfd_docx"],
            "file_types": ["pdf", "docx", "doc", "pptx", "ppt", "txt", "images"]
        }
    }


if __name__ == "__main__":
    import uvicorn

    # Port configuration (Render utilise la variable PORT)
    port = int(os.getenv("PORT", 8004))

    logger.info(f"🚀 Démarrage du serveur sur le port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )