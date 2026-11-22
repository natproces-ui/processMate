"""
Suivi en production des durées de rédaction et des échecs (lecture seule).

Lit les réponses du chat enregistrées (conversation_messages.payload) : durée de chaque procédure rédigée
(« generations[].duree_s »), durée du travail confié au chat (« duree_chat_s »), et les échecs (délai dépassé
« ne répond plus », crédit épuisé, service saturé). Les durées ne sont enregistrées que depuis le 22/11/2026.

Usage (depuis clinic/, avec SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env) :
    python bench/durees_prod.py              # 14 derniers jours
    python bench/durees_prod.py --jours 3
"""

import argparse
import statistics
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

LIMITE_S = 180  # délai sans réponse du modèle au-delà duquel la rédaction échoue (multi_doc_processor)


def cause_of(text: str) -> str:
    low = (text or "").lower()
    if "ne répond plus" in low:
        return "délai dépassé (pas de réponse du modèle)"
    if "crédit" in low or "prepayment" in low or "402" in low:
        return "crédit épuisé"
    if "sollicité" in low or "429" in low or "quota" in low:
        return "service saturé"
    return "autre"


def resume(nom: str, values: list) -> str:
    if not values:
        return f"{nom} : aucune mesure"
    v = sorted(values)
    p90 = v[max(0, int(len(v) * 0.9) - 1)]
    lents = sum(x >= LIMITE_S * 0.8 for x in v)
    return (f"{nom} : {len(v)} mesures · médiane {statistics.median(v):.0f} s · 90 % sous {p90:.0f} s · max {v[-1]:.0f} s"
            f" · {lents} à plus de {int(LIMITE_S * 0.8)} s (proches de la limite de {LIMITE_S} s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jours", type=int, default=14)
    args = ap.parse_args()
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    from database.supabase_client import get_raw_supabase
    db = get_raw_supabase()
    since = (datetime.now(timezone.utc) - timedelta(days=args.jours)).isoformat()
    rows, start = [], 0
    while True:
        page = (db.table("conversation_messages").select("created_at,payload").eq("role", "assistant")
                .gte("created_at", since).order("created_at").range(start, start + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            break
        start += 1000

    redaction, chat, causes, sans_duree = [], [], Counter(), 0
    for r in rows:
        p = r.get("payload") or {}
        for g in p.get("generations") or []:
            if g.get("status") == "ready":
                if g.get("duree_s") is not None:
                    redaction.append(float(g["duree_s"]))
                else:
                    sans_duree += 1
            elif g.get("status") == "error":
                causes[cause_of(g.get("cause") or g.get("error") or "")] += 1
        if p.get("duree_chat_s") is not None:
            chat.append(float(p["duree_chat_s"]))

    print(f"Réponses du chat lues : {len(rows)} (depuis {args.jours} jours)")
    print(resume("Rédaction d'une procédure", redaction))
    print(resume("Travail confié au chat (modification, réécriture…)", chat))
    if sans_duree:
        print(f"Procédures rédigées avant l'enregistrement des durées : {sans_duree}")
    total_err = sum(causes.values())
    print(f"Rédactions en échec : {total_err}" + (" — " + ", ".join(f"{c} : {n}" for c, n in causes.most_common()) if total_err else ""))


if __name__ == "__main__":
    main()
