"""
Consommation IA par organisation (prompt 3) : jetons et nombre d'appels, par jour et par
tâche. Jamais de contenu. Sert à la console plateforme (quotas, coûts).

Les mesures sont cumulées en mémoire et écrites au plus une fois par minute (et à la
demande, flush()). Table ai_usage (commune). Les appels sans organisation (invités,
comptes libres) sont comptés sous HORS_ORGANISATION.
Inactif sans ORGANISATIONS_ENABLED. Ne lève jamais.
"""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

HORS_ORGANISATION = "00000000-0000-0000-0000-000000000000"
FLUSH_EVERY = 60.0

_lock = threading.Lock()
_buffer: Dict[Tuple[str, str, str], Dict[str, int]] = {}
_last_flush = time.monotonic()


def record(task: str, tokens_in: Optional[int], tokens_out: Optional[int]) -> None:
    from database.org_scope import current_org_id, enabled
    if not enabled():
        return
    try:
        key = (current_org_id() or HORS_ORGANISATION, datetime.now(timezone.utc).date().isoformat(), (task or "autre")[:60])
        with _lock:
            c = _buffer.setdefault(key, {"appels": 0, "jetons_entree": 0, "jetons_sortie": 0})
            c["appels"] += 1
            c["jetons_entree"] += int(tokens_in or 0)
            c["jetons_sortie"] += int(tokens_out or 0)
            due = time.monotonic() - _last_flush > FLUSH_EVERY
        if due:
            threading.Thread(target=flush, daemon=True).start()
    except Exception as e:
        logger.debug(f"Mesure ignorée : {e}")


def flush() -> None:
    global _last_flush
    with _lock:
        pending = dict(_buffer)
        _buffer.clear()
        _last_flush = time.monotonic()
    if not pending:
        return
    try:
        from database.supabase_client import get_supabase
        db = get_supabase()
        for (org, jour, tache), c in pending.items():
            rows = (db.table("ai_usage").select("id,appels,jetons_entree,jetons_sortie")
                    .eq("organisation_id", org).eq("jour", jour).eq("tache", tache).limit(1).execute().data)
            if rows:
                r = rows[0]
                db.table("ai_usage").update({k: (r.get(k) or 0) + v for k, v in c.items()}).eq("id", r["id"]).execute()
            else:
                db.table("ai_usage").insert({"organisation_id": org, "jour": jour, "tache": tache, **c}).execute()
    except Exception as e:
        logger.warning(f"Consommation IA non enregistrée : {str(e)[:120]}")


def month_totals(month_prefix: str) -> Dict[str, Dict[str, int]]:
    """{organisation_id: {appels, jetons_entree, jetons_sortie}} pour un mois « AAAA-MM »."""
    from database.supabase_client import get_supabase
    out: Dict[str, Dict[str, int]] = {}
    year, month = (int(x) for x in month_prefix.split("-"))
    next_month = f"{year + month // 12:04d}-{month % 12 + 1:02d}-01"  # pas de « 2026-11-31 » : date invalide en SQL
    rows = (get_supabase().table("ai_usage").select("organisation_id,jour,appels,jetons_entree,jetons_sortie")
            .gte("jour", f"{month_prefix}-01").lt("jour", next_month).execute().data or [])
    for r in rows:
        t = out.setdefault(r["organisation_id"], {"appels": 0, "jetons_entree": 0, "jetons_sortie": 0})
        for k in t:
            t[k] += r.get(k) or 0
    return out
