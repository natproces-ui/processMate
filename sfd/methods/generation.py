"""
generation.py — Pipeline de génération SFD : init depuis les sources + chat agent.
"""

import os
import json
import asyncio
from datetime import date
from typing import List, Optional, Callable, Awaitable

from fastapi import UploadFile
from google import genai
from google.genai import types

from schemas.schema import SFDDocument
from session_store import (
    SFDSession, create_session, get_session, update_sfd, add_chat_message
)
from methods.sfd_methods import extract_files_content
from methods.web_explorer import explore_website

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL   = "gemini-2.5-flash"

ProgressCallback = Callable[[str, str], Awaitable[None]]


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Extrait et parse le JSON depuis la réponse Gemini.

    Gère trois cas :
    1. JSON pur (response_mime_type='application/json') — cas nominal
    2. JSON enveloppé dans des backticks markdown
    3. JSON tronqué par max_output_tokens — tentative de réparation
    """
    text = text.strip()

    # ── Cas 1 : JSON pur direct ───────────────────────────────────────────────
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # ── Cas 2 : enveloppé dans ```json ... ``` ────────────────────────────────
    if text.startswith("```"):
        inner = text.split("\n", 1)[-1]
        if inner.endswith("```"):
            inner = inner[:-3]
        inner = inner.strip()
        try:
            return json.loads(inner)
        except json.JSONDecodeError:
            text = inner  # continue avec le texte nettoyé

    # ── Cas 3 : extraire le bloc { ... } ─────────────────────────────────────
    start = text.find("{")
    if start == -1:
        raise ValueError(f"Aucun JSON trouvé dans la réponse ({len(text)} chars)")

    # Cherche la fermeture en remontant depuis la fin
    for end in range(len(text) - 1, start, -1):
        if text[end] == "}":
            candidate = text[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    # ── Cas 4 : JSON tronqué — réparer en fermant les structures ouvertes ─────
    truncated = text[start:]
    repaired  = _repair_truncated_json(truncated)
    try:
        result = json.loads(repaired)
        print(f"[_extract_json] JSON réparé après troncature ({len(truncated)} → {len(repaired)} chars)")
        return result
    except json.JSONDecodeError as e:
        print(f"[_extract_json] Impossible de parser ({len(text)} chars) : {text[:300]}")
        raise


def _repair_truncated_json(text: str) -> str:
    """
    Répare un JSON tronqué en fermant les structures ouvertes.
    Stratégie : compter les { [ " ouverts et fermer dans l'ordre inverse.
    """
    # Retire les derniers caractères invalides (virgule, deux-points, espace...)
    text = text.rstrip()
    while text and text[-1] in (",", ":", " ", "\n", "\t"):
        text = text[:-1]

    # Si la dernière valeur est une string ouverte, la fermer
    # (compte les guillemets non échappés)
    in_string = False
    escape    = False
    stack     = []  # '{' ou '['

    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in ("{", "["):
            stack.append(ch)
        elif ch in ("}", "]"):
            if stack:
                stack.pop()

    # Fermer la string si elle est ouverte
    if in_string:
        text += '"'

    # Fermer les structures dans l'ordre inverse
    closing = {"{": "}", "[": "]"}
    for opener in reversed(stack):
        text += closing[opener]

    return text


def _build_docs_text_summary(docs_content: list) -> str:
    """Résumé textuel des sources pour inclusion dans les prompts chat."""
    lines = []
    for doc in docs_content:
        if doc["type"] == "text":
            lines.append(f"[{doc['filename']}]\n{doc['text'][:3000]}")
        else:
            lines.append(f"[{doc['filename']}] (document binaire fourni lors de l'initialisation)")
    return "\n\n".join(lines)


# ─── INIT ─────────────────────────────────────────────────────────────────────

async def init_sfd(
    session_id: str,
    project_name: str,
    client: str,
    description: str,
    files: List[UploadFile],
    urls: List[str],
    on_progress: Optional[ProgressCallback] = None,
) -> SFDDocument:
    """
    Crée une session, extrait les sources et génère le premier draft SFD complet.
    """
    async def notify(stage: str, msg: str):
        print(f"[{stage}] {msg}")
        if on_progress:
            await on_progress(stage, msg)

    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY manquant")

    session = create_session(session_id)
    session.sources["project_name"] = project_name
    session.sources["client"]       = client
    session.sources["description"]  = description
    session.sources["urls"]         = urls

    await notify("extraction", "Extraction des documents...")
    docs_content = await extract_files_content(files)
    session.sources["docs_content"] = docs_content

    web_summary = ""
    for url in urls:
        if url.strip():
            await notify("exploration", f"Exploration de {url}...")
            result = await explore_website(
                target_url=url.strip(),
                gemini_api_key=GOOGLE_API_KEY,
                max_gemini_calls=4,
                on_progress=on_progress,
            )
            web_summary += result.get("text_summary", "")

    await notify("generation", "Génération du SFD avec Gemini...")

    today    = date.today().strftime("%d/%m/%Y")
    docs_text = _build_docs_text_summary(docs_content)

    prompt = f"""Tu es un expert senior en analyse fonctionnelle et rédaction de Spécifications Fonctionnelles Détaillées (SFD).
Tu dois produire un SFD professionnel, complet et conforme aux standards français (MOA/MOE, MERISE).

━━━ INFORMATIONS DU PROJET ━━━
Nom du projet : {project_name}
Client : {client}
Date : {today}
Description : {description}
{f"━━━ DOCUMENTS FOURNIS ━━━{chr(10)}{docs_text}" if docs_text else ""}
{f"━━━ EXPLORATION WEB ━━━{chr(10)}{web_summary[:5000]}" if web_summary else ""}

━━━ CONSIGNES DE GÉNÉRATION ━━━
1. Génère un SFD COMPLET et DÉTAILLÉ, toutes les sections doivent être renseignées
2. Les IDs suivent le format : ACT001, UC001, MOD001, F001, RG001, IHM001, INT001, SCH001
3. Chaque cas d'utilisation doit avoir au minimum 4 étapes dans le flux nominal
4. Chaque module doit avoir au minimum 2 fonctions détaillées
5. Les règles de gestion sont numérotées (RG001, RG002...) et référencées dans les fonctions
6. La matrice de traçabilité lie chaque objectif métier aux fonctions qui le couvrent
7. Le glossaire contient tous les termes métier et acronymes utilisés
8. Retourne UNIQUEMENT le JSON valide, sans markdown ni commentaires

━━━ PRINCIPES RÉDACTIONNELS (obligatoires) ━━━
A. CLARTÉ ET NON-AMBIGUÏTÉ
   - Chaque champ `description` = factuel et précis ; JAMAIS de règle métier ni de condition dedans
   - Les règles métier vont EXCLUSIVEMENT dans `regles_gestion`, référencées via `regles_gestion_ids`
   - Formulations actives : "Le système vérifie...", "L'utilisateur saisit..."

B. SÉPARATION FONCTIONNALITÉS / IHM
   - `modules` = CE QUE fait la fonctionnalité (logique métier, règles, données)
   - `interfaces` = COMMENT l'utilisateur interagit (écrans, champs, boutons)

C. EXIGENCES NON-FONCTIONNELLES MESURABLES
   - Chaque ENF doit être quantifiable : valeur numérique, seuil, pourcentage, unité
   - ✅ "Temps de réponse < 2s pour 95% des requêtes"  ❌ "Le système doit être rapide"

D. SCHÉMAS MERMAID — 3 schémas OBLIGATOIRES, syntaxe STRICTE

SCH001 : sequenceDiagram  →  flux nominal principal
SCH002 : flowchart TD     →  processus décisionnel clé
SCH003 : graph LR         →  cartographie globale de tous les modules

━━ RÈGLES sequenceDiagram ━━
Déclarer TOUS les participants en haut, SANS guillemets dans `as` :
  ✅ participant SysAuth as Système Auth
  ❌ participant SysAuth as "Système Auth"   ← INTERDIT, casse le rendu

Flèches SANS guillemets autour du texte :
  ✅ Utilisateur->>Systeme: Saisit ses identifiants
  ❌ Utilisateur->>Systeme: "Saisit ses identifiants"   ← INTERDIT

Noms de participants : UN seul mot, sans espace, sans accent :
  ✅ SystemeAuth   BDD   MoteurVirt   ApiPaiement
  ❌ Système Auth   système auth   Moteur de Virtualisation

━━ RÈGLES flowchart / graph ━━
Labels de nœuds TOUJOURS entre guillemets doubles :
  ✅ A["Mon label"]   B{{"Décision ?"}}   C(["Acteur"])
  ❌ A[Mon label]     B{{Décision ?}}

Labels de flèches UNIQUEMENT avec pipes :
  ✅ A -->|"Oui"| B
  ❌ A -- Oui --> B    ← syntaxe invalide en flowchart

JAMAIS de multi-source : écrire une ligne par source :
  ✅ E1 --> I1
     E2 --> I1
     E3 --> I1
  ❌ E1 & E2 & E3 --> I1   ← INTERDIT, non supporté

IDs de nœuds : lettres+chiffres UNIQUEMENT :
  ✅ MOD1   AUTH   UC01   StepA
  ❌ MOD_1   step-a   UC.01

subgraph TOUJOURS avec ID et label entre guillemets :
  ✅ subgraph AUTH["Authentification"]
  ❌ subgraph Authentification
  PAS de subgraph imbriqué dans un autre subgraph

━━━ STRUCTURE JSON ATTENDUE ━━━
{{
  "meta": {{"nom_projet":"", "client":"", "version":"1.0", "date":"", "statut":"Draft", "auteurs":[], "historique_revisions":[{{"version":"","date":"","auteur":"","description":""}}]}},
  "documents_reference": [{{"nom":"","type":"","version":"","description":""}}],
  "contexte": {{"presentation_client":"", "contexte_projet":"", "objectifs_metier":[]}},
  "perimetre": {{"inclus":[], "exclus":[], "hypotheses":[], "contraintes_generales":[]}},
  "acteurs": [{{"id":"ACT001","nom":"","type":"interne","role":"","description":""}}],
  "cas_utilisation": [{{"id":"UC001","nom":"","acteur_principal":"ACT001","acteurs_secondaires":[],"preconditions":[],"flux_nominal":[{{"numero":1,"description":""}}],"flux_alternatifs":[],"flux_erreur":[],"postconditions":[]}}],
  "modules": [{{"id":"MOD001","nom":"","description":"","fonctions":[{{"id":"F001","nom":"","priorite":"Haute","description":"","donnees_entree":[],"donnees_sortie":[],"regles_gestion_ids":[],"contraintes":[]}}]}}],
  "regles_gestion": [{{"id":"RG001","description":"","type":"validation","fonctions_concernees":[]}}],
  "specifications_donnees": [{{"entite":"","attributs":[],"description":"","flux_associes":[]}}],
  "interfaces": {{
    "interfaces_ui": [{{"id":"IHM001","nom_ecran":"","description":"","acteur":"ACT001","elements":[{{"nom":"","type":"champ","description":"","obligatoire":true}}]}}],
    "interfaces_externes": [{{"id":"INT001","nom":"","type":"externe","systeme_tiers":"","description":"","format_echange":""}}]
  }},
  "exigences_non_fonctionnelles": {{"performance":[],"securite":[],"disponibilite":[],"ergonomie":[],"maintenabilite":[]}},
  "matrice_tracabilite": [{{"id_besoin_source":"OBJ001","description_besoin":"","fonctions_couvrant":[]}}],
  "schemas_conceptuels": [{{"id":"SCH001","titre":"","type":"sequence","mermaid_code":"","description":""}}],
  "glossaire": {{}}
}}"""

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    contents = [prompt]
    for doc in docs_content:
        if doc["type"] in ("pdf", "image"):
            import base64
            contents.append(types.Part.from_bytes(
                data=base64.b64decode(doc["b64"]),
                mime_type=doc["mime"]
            ))

    response = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=65536,
            response_mime_type="application/json",
        )
    )

    raw = response.text
    print(f"[init_sfd] Réponse Gemini ({len(raw)} chars)")
    data = _extract_json(raw)
    sfd  = SFDDocument(**data)
    update_sfd(session_id, sfd)

    await notify("done", "SFD généré avec succès")
    return sfd


# ─── CHAT AGENT ───────────────────────────────────────────────────────────────

async def chat_with_agent(
    session_id: str,
    user_message: str,
) -> dict:
    """
    L'agent lit le message utilisateur, modifie les sections concernées du SFD
    et retourne le SFD mis à jour + un message explicatif.
    """
    session = get_session(session_id)
    if not session or not session.sfd:
        raise ValueError("Session introuvable ou SFD non initialisé")

    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY manquant")

    add_chat_message(session_id, "user", user_message)

    current_sfd_json = json.dumps(
        session.sfd.model_dump(), ensure_ascii=False, indent=2
    )
    docs_summary    = _build_docs_text_summary(session.sources.get("docs_content", []))
    sources_summary = f"""Projet : {session.sources.get('project_name', '')}
Client : {session.sources.get('client', '')}
Description : {session.sources.get('description', '')}
URLs : {', '.join(session.sources.get('urls', []))}
{f'Documents : {docs_summary[:3000]}' if docs_summary else ''}"""

    history_text = "\n".join([
        f"{'Utilisateur' if m['role'] == 'user' else 'Agent'} : {m['content']}"
        for m in session.chat_history[-10:]
    ])

    prompt = f"""Tu es un expert en rédaction de SFD (Spécification Fonctionnelle Détaillée).
Tu assistes dans la modification et l'enrichissement d'un SFD professionnel.

━━━ CONTEXTE DU PROJET ━━━
{sources_summary}

━━━ SFD ACTUEL (JSON complet) ━━━
{current_sfd_json}

━━━ HISTORIQUE DE LA CONVERSATION ━━━
{history_text if history_text else "Première interaction."}

━━━ INSTRUCTION ━━━
{user_message}

━━━ STRUCTURE EXACTE DES SECTIONS (utiliser STRICTEMENT ces noms de champs) ━━━
meta: {{nom_projet, client, version, date, statut, auteurs:[str], historique_revisions:[{{version,date,auteur,description}}]}}
contexte: {{presentation_client, contexte_projet, objectifs_metier:[str]}}
perimetre: {{inclus:[str], exclus:[str], hypotheses:[str], contraintes_generales:[str]}}
acteurs: [{{id, nom, type, role, description}}]
cas_utilisation: [{{id, nom, acteur_principal, acteurs_secondaires:[str], preconditions:[str], flux_nominal:[{{numero:int, description}}], flux_alternatifs:[str], flux_erreur:[str], postconditions:[str]}}]
modules: [{{id, nom, description, fonctions:[{{id, nom, priorite, description, donnees_entree:[str], donnees_sortie:[str], regles_gestion_ids:[str], contraintes:[str]}}]}}]
regles_gestion: [{{id, description, type, fonctions_concernees:[str]}}]
specifications_donnees: [{{entite, attributs:[str], description, flux_associes:[str]}}]
interfaces: {{
  interfaces_ui: [{{id, nom_ecran, description, acteur:str, elements:[{{nom, type, description, obligatoire:bool}}]}}],
  interfaces_externes: [{{id, nom, type, systeme_tiers, description, format_echange}}]
}}
exigences_non_fonctionnelles: {{performance:[str], securite:[str], disponibilite:[str], ergonomie:[str], maintenabilite:[str]}}
matrice_tracabilite: [{{id_besoin_source, description_besoin, fonctions_couvrant:[str]}}]
schemas_conceptuels: [{{id, titre, type, mermaid_code, description}}]
glossaire: {{terme: définition}}

━━━ DÉTECTION D'INTENTION ━━━
▶ QUESTION (comprendre, expliquer, analyser, résumer, lister...) :
  → sections_modified = []  /  updates = {{}}  /  agent_message = réponse complète

▶ MODIFICATION (ajouter, modifier, supprimer, corriger, enrichir...) :
  → identifier les sections à modifier
  → produire les updates complets selon STRUCTURE EXACTE

━━━ CONSIGNES MODIFICATIONS ━━━
1. Utilise UNIQUEMENT les noms de champs définis ci-dessus
2. Fournis la valeur COMPLÈTE de chaque section modifiée (toute la liste/objet)
3. Maintiens la cohérence des IDs et références entre sections

━━━ FORMAT DE RÉPONSE ━━━
{{
  "agent_message": "Réponse ou confirmation (français)",
  "sections_modified": ["section1"],
  "updates": {{
    "section1": <valeur COMPLÈTE si modification>
  }}
}}"""

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    contents = [prompt]
    for doc in session.sources.get("docs_content", []):
        if doc["type"] in ("pdf", "image"):
            import base64
            contents.append(types.Part.from_bytes(
                data=base64.b64decode(doc["b64"]),
                mime_type=doc["mime"]
            ))

    response = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.4,
            max_output_tokens=32768,
            response_mime_type="application/json",
        )
    )

    data            = _extract_json(response.text)
    agent_message   = data.get("agent_message", "Modifications effectuées.")
    sections_modified = data.get("sections_modified", [])
    updates         = data.get("updates", {})

    sfd_dict = session.sfd.model_dump()
    for key, value in updates.items():
        if key in sfd_dict:
            sfd_dict[key] = value

    new_sfd = SFDDocument(**sfd_dict)
    update_sfd(session_id, new_sfd)
    add_chat_message(session_id, "agent", agent_message)

    return {
        "agent_message":      agent_message,
        "sections_modified":  sections_modified,
        "sfd":                new_sfd.model_dump(),
    }