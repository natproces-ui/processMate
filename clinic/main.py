"""
API FastAPI complète pour la génération de processus BPMN
- Parser WinDev
- Flowcharts Graphviz
- BPMN depuis documents
- Enrichissement IA
- Image vers Table1Row[] (nouveau flux simplifié)
- DOT to Table avec enrichissement Gemini intégré
- Découverte et génération multi-documents (PDF + Images)  ← NOUVEAU
"""

import os, sys, ssl
if sys.platform == "win32" and os.getenv("IS_PRODUCTION", "false").lower() != "true":
    # Avast/Kaspersky MITM proxy replaces TLS certs — disable verify in dev
    _orig_ctx = ssl.create_default_context
    def _no_verify_ctx(*a, **kw):
        ctx = _orig_ctx(*a, **kw)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    ssl.create_default_context = _no_verify_ctx

from fastapi import FastAPI
from manager.processing_level import ProcessingLevel, processing_level_scope
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import os


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


from config import API_CONFIG, CORS_CONFIG, IS_PRODUCTION, FRONTEND_URL, GOOGLE_API_KEY
from routers import (
    parser, windev_flowchart, bpmn, bpmn_ai, img_to_bpmn,
    dot_to_table, cobol_flowchart,
    doc_router, stt, interface_router, revision_router, chat_router,
    orchestration_router, irritants_router, orchestration_tasks_router,
    analysis_router, taxonomy_router, campaigns_router, reports_router, corrections_router,
    workspace_router, specifications_router, tools_router, jira_router, bian_scenarios_router,
    studio_router
)


# ✅ NOUVEAUX ROUTERS
from routers import process_discovery, process_generation

app = FastAPI(
    title="BPMN Process Generator API",
    description="API complète pour la génération et l'analyse de processus BPMN",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    **CORS_CONFIG
)

@app.middleware("http")
async def studio_processing_level(request, call_next):
    raw_level = request.headers.get("X-Processing-Level")
    try:
        level = ProcessingLevel(raw_level) if raw_level is not None else None
    except ValueError:
        return JSONResponse(
            status_code=422,
            content={"detail": "Niveau de traitement invalide (fast, normal, deep)."},
        )
    # Le contexte est isolé, y compris pour les processors partagés et to_thread.
    with processing_level_scope(level):
        return await call_next(request)


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🚀 BPMN Process Generator API Started")
    logger.info(f"📦 Version: 4.0.0")
    logger.info(f"🌍 Environment: {'PRODUCTION' if IS_PRODUCTION else 'DEVELOPMENT'}")
    logger.info(f"🔗 Frontend URL: {FRONTEND_URL}")
    logger.info(f"🔑 Google API Key: {'✅ Configured' if GOOGLE_API_KEY else '❌ Missing'}")
    logger.info("=" * 60)

# Routers existants
app.include_router(parser.router)
app.include_router(windev_flowchart.router)
app.include_router(cobol_flowchart.router)
app.include_router(bpmn.router)
app.include_router(bpmn_ai.router)
app.include_router(img_to_bpmn.router)
app.include_router(dot_to_table.router)
app.include_router(irritants_router.router)

app.include_router(stt.router)
app.include_router(doc_router.router)
app.include_router(interface_router.router)
app.include_router(revision_router.router)
# ✅ NOUVEAUX ROUTERS — Découverte et Génération multi-docs
app.include_router(process_discovery.router)
app.include_router(process_generation.router)
app.include_router(chat_router.router)  # Router pour le chat (sessions + messages)
app.include_router(orchestration_router.router)
app.include_router(orchestration_tasks_router.router)
app.include_router(analysis_router.router)
app.include_router(taxonomy_router.router)
app.include_router(campaigns_router.router)
app.include_router(reports_router.router)
app.include_router(corrections_router.router)
app.include_router(workspace_router.router)
app.include_router(specifications_router.router)
app.include_router(tools_router.router)
app.include_router(jira_router.router)
app.include_router(bian_scenarios_router.router)
app.include_router(studio_router.router)

@app.head("/")
async def head_root():
    return JSONResponse(content={}, status_code=200)


@app.get("/")
async def root():
    return {"service": "BPMN Process Generator API", "status": "ok", "health": "/health"}


@app.head("/health")
async def head_health():
    return JSONResponse(content={}, status_code=200)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "4.0.0",
        "environment": "production" if IS_PRODUCTION else "development",
        "frontend_url": FRONTEND_URL,
        "google_api": "configured" if GOOGLE_API_KEY else "missing",
        "service": "BPMN Process Generator API",
        "modules": {
            "parser": "active",
            "flowchart_generator": "active",
            "bpmn_generator": "active",
            "bpmn_ai_enricher": "active",
            "img_to_table_converter": "active",
            "dot_to_table_converter": "active",
            "process_discovery": "active ✨",       # ← NOUVEAU
            "process_generation": "active ✨"        # ← NOUVEAU
        }
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
