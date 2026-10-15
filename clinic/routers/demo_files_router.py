"""
Router Fichiers de démo — bibliothèque partagée entre tous les admins.

Les fichiers vivent dans le bucket privé `processmate-files` (le même que le reste
de l'app, voir supabase_client.py) sous le préfixe `demo/`. Aucun autre routeur ne
vérifie l'appelant ; celui-ci si, car la bibliothèque contient des procédures
internes : le jeton Supabase du frontend (Authorization: Bearer) doit appartenir à
un utilisateur dont user_profiles.global_role vaut 'admin'.
"""

import logging
import mimetypes
import re
import unicodedata
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response

from database.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/demo-files", tags=["Fichiers de démo"])

BUCKET = "processmate-files"
PREFIX = "demo"
ALLOWED_EXT = {"pdf", "docx", "pptx", "png", "jpg", "jpeg", "webp"}
MAX_BYTES = 20 * 1024 * 1024  # même limite que le chat (ChatInterface.addFiles)


def require_admin(authorization: str = Header(default="")) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Connexion requise")
    db = get_supabase()
    try:
        user = db.auth.get_user(token).user
    except Exception:
        user = None
    if not user:
        raise HTTPException(401, "Session invalide ou expirée")
    profile = db.table("user_profiles").select("global_role").eq("id", user.id).execute().data
    if not profile or profile[0].get("global_role") != "admin":
        raise HTTPException(403, "Réservé aux administrateurs")
    return user.id


def _safe_name(name: str) -> str:
    """Nom de fichier sans chemin, réduit aux caractères qu'accepte une clé Storage
    (Supabase refuse les accents : « décès » devient « deces »)."""
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^\w !\-.*'()&$@=;:+,]", "_", name, flags=re.ASCII)
    name = re.sub(r"\s+", " ", name).strip()
    if not name or name in {".", ".."}:
        raise HTTPException(400, "Nom de fichier invalide")
    if name.rsplit(".", 1)[-1].lower() not in ALLOWED_EXT:
        raise HTTPException(400, f"Format non supporté (attendu : {', '.join(sorted(ALLOWED_EXT))})")
    return name


def _mime(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


@router.get("")
def list_demo_files(_: str = Depends(require_admin)):
    db = get_supabase()
    entries = db.storage.from_(BUCKET).list(PREFIX, {"limit": 1000, "sortBy": {"column": "name", "order": "asc"}})
    files = [
        {
            "name": e["name"],
            "size": (e.get("metadata") or {}).get("size"),
            "updated_at": e.get("updated_at"),
        }
        # Les sous-dossiers reviennent sans id ; le placeholder de dossier vide aussi est ignoré
        for e in entries if e.get("id") and e["name"] != ".emptyFolderPlaceholder"
    ]
    return {"files": files}


@router.get("/{name}")
def get_demo_file(name: str, _: str = Depends(require_admin)):
    name = _safe_name(name)
    try:
        data = get_supabase().storage.from_(BUCKET).download(f"{PREFIX}/{name}")
    except Exception:
        raise HTTPException(404, "Fichier de démo introuvable")
    return Response(
        content=data,
        media_type=_mime(name),
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(name)}"},
    )


@router.post("")
async def upload_demo_file(file: UploadFile = File(...), _: str = Depends(require_admin)):
    name = _safe_name(file.filename or "")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Fichier vide")
    if len(raw) > MAX_BYTES:
        raise HTTPException(400, "Fichier trop lourd (20 Mo maximum)")
    get_supabase().storage.from_(BUCKET).upload(
        path=f"{PREFIX}/{name}",
        file=raw,
        # upsert : redéposer un fichier du même nom le remplace
        file_options={"content-type": _mime(name), "upsert": "true"},
    )
    logger.info(f"📁 Fichier de démo déposé : {name}")
    return {"success": True, "name": name, "size": len(raw)}


@router.delete("/{name}")
def delete_demo_file(name: str, _: str = Depends(require_admin)):
    name = _safe_name(name)
    get_supabase().storage.from_(BUCKET).remove([f"{PREFIX}/{name}"])
    logger.info(f"🗑️ Fichier de démo supprimé : {name}")
    return {"success": True}
