# sfd-generator/config.py
from pathlib import Path
import os
from dotenv import load_dotenv
import logging

# ============================================
# CHARGEMENT DES VARIABLES D'ENVIRONNEMENT
# ============================================

load_dotenv()

# ============================================
# CONFIGURATION ENVIRONNEMENT
# ============================================

IS_PRODUCTION = os.getenv("IS_PRODUCTION", "false").lower() == "true"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# 🔑 Clé API Google Gemini (obligatoire)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("❌ GOOGLE_API_KEY manquante dans .env !")

# ============================================
# CONFIGURATION CORS
# ============================================

CORS_CONFIG = {
    "allow_origins": [
        FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
    ],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# ============================================
# CONFIGURATION CHEMINS
# ============================================

BASE_DIR = Path(__file__).parent

DOCUMENTS_DIR = BASE_DIR / "generated_documents"
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# ============================================
# CONFIGURATION API
# ============================================

API_CONFIG = {
    "title": "SFD Generator API",
    "description": "API pour générer des Spécifications Fonctionnelles Détaillées (SFD) avec Gemini AI",
    "version": "1.0.0"
}

# ============================================
# LOGGING
# ============================================

logging.basicConfig(
    level=logging.INFO if not IS_PRODUCTION else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

if IS_PRODUCTION:
    logger.info("🚀 SFD Generator - Mode PRODUCTION")
    logger.info(f"📡 Frontend URL: {FRONTEND_URL}")
else:
    logger.info("🔧 SFD Generator - Mode DÉVELOPPEMENT")
    logger.info(f"📡 Frontend URL: {FRONTEND_URL}")