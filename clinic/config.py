# clinic/config.py
from pathlib import Path
import os
from dotenv import load_dotenv

# ============================================
# CHARGEMENT DES VARIABLES D'ENVIRONNEMENT
# ============================================

# Charger automatiquement le fichier .env (uniquement en local)
load_dotenv()

# ============================================
# CONFIGURATION ENVIRONNEMENT
# ============================================

# Mode développement vs production
# clinic/config.py - ligne ~12
IS_PRODUCTION = os.getenv("IS_PRODUCTION", "false").lower() == "true"

# URL du frontend (dynamique selon l'environnement)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# 🔑 Clé API Google (importante pour les routers IA)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY and IS_PRODUCTION:
    raise ValueError("❌ GOOGLE_API_KEY manquante en production !")

# ============================================
# CONFIGURATION CORS
# ============================================

CORS_CONFIG = {
    "allow_origins": [
        FRONTEND_URL,                    # Frontend Render
        "http://localhost:3000",         # Dev local Next.js
        "http://localhost:3001",         # Alternative
        "http://127.0.0.1:3000",
    ],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# ============================================
# CONFIGURATION CHEMINS
# ============================================

# Base directory (fonctionne partout : Windows, Linux, Render)
BASE_DIR = Path(__file__).parent

# Dossier pour les flowcharts générés
FLOWCHARTS_DIR = BASE_DIR / "flowcharts"
FLOWCHARTS_DIR.mkdir(parents=True, exist_ok=True)  # Créé automatiquement si absent

# Fichier HTML statique
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
HTML_FILE = STATIC_DIR / "index.html"

# ============================================
# CONFIGURATION PARSER
# ============================================

# Extensions de fichiers supportées
ALLOWED_EXTENSIONS = [".swift", ".wl", ".txt", ".windev"]

# Patterns de détection pour les flowcharts
FLOWCHART_PATTERNS = {
    "cpt": "cpt_flowchart",
    "gar": "gar_flowchart"
}

# ============================================
# CONFIGURATION API
# ============================================

API_CONFIG = {
    "title": "BPMN Process Generator API",
    "description": "API complète pour la génération et l'analyse de processus BPMN",
    "version": "3.0.0"
}

# ============================================
# LOGGING
# ============================================

import logging

logging.basicConfig(
    level=logging.INFO if not IS_PRODUCTION else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Log de configuration au démarrage (optionnel mais utile)
if IS_PRODUCTION:
    logger.info("🚀 Mode PRODUCTION activé")
    logger.info(f"📡 Frontend URL: {FRONTEND_URL}")
else:
    logger.info("🔧 Mode DÉVELOPPEMENT activé")
    logger.info(f"📡 Frontend URL: {FRONTEND_URL}")