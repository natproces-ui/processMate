"""
generation.py — Génération de SFD depuis les procédures ProcessMate via Gemini.

Prompt adaptatif selon le scope (category / subcategory / procedures individuelles).
Utilise GeminiModelManager pour retry/fallback.
"""

import os
import json
import asyncio
import logging
from datetime import date
from typing import List, Dict, Any, Optional

from google import genai
from google.genai import types

from .schema import SFDDocument

logger = logging.getLogger(__name__)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL   = "gemini-2.5-flash"


# ─── HELPERS JSON REPAIR ──────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Extrait et parse le JSON depuis la réponse Gemini. Gère les cas tronqués."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    if text.startswith("```"):
        inner = text.split("\n", 1)[-1]
        if inner.endswith("```"):
            inner = inner[:-3]
        inner = inner.strip()
        try:
            return json.loads(inner)
        except json.JSONDecodeError:
            text = inner

    start = text.find("{")
    if start == -1:
        raise ValueError(f"Aucun JSON trouvé dans la réponse ({len(text)} chars)")

    for end in range(len(text) - 1, start, -1):
        if text[end] == "}":
            candidate = text[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    truncated = text[start:]
    repaired  = _repair_truncated_json(truncated)
    try:
        result = json.loads(repaired)
        logger.info(f"JSON réparé après troncature ({len(truncated)} → {len(repaired)} chars)")
        return result
    except json.JSONDecodeError:
        logger.error(f"Impossible de parser ({len(text)} chars) : {text[:300]}")
        raise


def _repair_truncated_json(text: str) -> str:
    """Répare un JSON tronqué en fermant les structures ouvertes."""
    text = text.rstrip()
    while text and text[-1] in (",", ":", " ", "\n", "\t"):
        text = text[:-1]

    in_string = False
    escape    = False
    stack     = []

    for ch in text:
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

    if in_string:
        text += '"'

    closing = {"{": "}", "[": "]"}
    for opener in reversed(stack):
        text += closing[opener]

    return text


# ─── PROMPT BUILDER ───────────────────────────────────────────────────────────

def _build_prompt(
    context: str,
    scope_type: str,
    scope_name: str,
    title: str,
    procedure_count: int,
    user_instructions: str = "",
) -> str:
    """Construit le prompt Gemini adapté au scope sélectionné."""

    today = date.today().strftime("%d/%m/%Y")

    # ── Introduction adaptée au scope ────────────────────────────────────────
    if scope_type == "theme":
        intro = f"""Tu produis un SFD de SYNTHÈSE MACROSCOPIQUE pour le thème "{scope_name}".
Ce document couvre {procedure_count} procédures réparties en plusieurs catégories et sous-catégories.

OBJECTIF : Produire une vue d'ensemble fonctionnelle transversale.
- Les MODULES reflètent les grands blocs fonctionnels du thème
- Chaque FONCTION agrège les tâches similaires issues de plusieurs procédures
- Les CAS D'UTILISATION décrivent les flux end-to-end inter-catégories
- Les SCHÉMAS MERMAID montrent les dépendances entre les grandes catégories (graph LR)
- Les RÈGLES DE GESTION sont consolidées et dédupliquées
- Les ACTEURS sont agrégés par rôle métier (pas de doublons)
- Le PÉRIMÈTRE liste les catégories incluses et exclues"""

    elif scope_type == "category":
        intro = f"""Tu produis un SFD de SYNTHÈSE FONCTIONNELLE pour la catégorie "{scope_name}".
Ce document couvre {procedure_count} procédures réparties en sous-catégories.

OBJECTIF : Produire une vue fonctionnelle cohérente à l'échelle de la catégorie.
- Les MODULES reflètent les sous-catégories ou blocs fonctionnels majeurs
- Chaque FONCTION couvre les tâches récurrentes de plusieurs procédures
- Les CAS D'UTILISATION décrivent les flux transversaux entre sous-catégories
- Les SCHÉMAS MERMAID montrent l'architecture fonctionnelle (graph LR) et le flux principal (sequenceDiagram)
- Les RÈGLES DE GESTION communes à plusieurs procédures sont consolidées
- Le PÉRIMÈTRE liste les sous-catégories incluses"""

    elif scope_type == "subcategory":
        intro = f"""Tu produis un SFD DÉTAILLÉ pour la sous-catégorie "{scope_name}".
Ce document couvre {procedure_count} procédures interdépendantes.

OBJECTIF : Produire une spécification fonctionnelle complète et cohérente.
- Chaque procédure source devient un MODULE ou contribue à un module logique
- Les FONCTIONS reprennent les étapes du workflow avec leurs enrichissements (descriptif, applicatif, KPI)
- Les CAS D'UTILISATION décrivent chaque flux procédural avec flux nominal/alternatifs/erreur
- Les SCHÉMAS MERMAID montrent le séquencement inter-procédures (sequenceDiagram) et les décisions (flowchart TD)
- Les RÈGLES DE GESTION sont numérotées et tracées vers les fonctions
- Les INTERFACES sont extraites des applicatifs identifiés dans les enrichissements
- Les DONNÉES sont extraites des données d'entrée/sortie des étapes"""

    else:  # 'procedures' — sélection individuelle
        intro = f"""Tu produis un SFD HYPER-DÉTAILLÉ pour {procedure_count} procédure(s) sélectionnée(s).

OBJECTIF : Produire une spécification exhaustive centrée sur ces flux spécifiques.
- Chaque étape du workflow génère une FONCTION détaillée
- Les enrichissements (descriptif, applicatif, déclencheur, durée, KPI) sont intégrés dans les données d'entrée/sortie et les contraintes
- Les GATEWAYS (ExclusiveGateway, ParallelGateway) deviennent des RÈGLES DE GESTION numérotées
- Chaque ACTEUR est décrit avec son rôle et département
- Les CAS D'UTILISATION incluent au minimum 6 étapes dans le flux nominal
- Les SCHÉMAS MERMAID reprennent fidèlement la séquence complète du workflow
- Les EXIGENCES NON-FONCTIONNELLES sont déduites des KPI et durées estimées"""

    # ── Section instructions utilisateur (optionnelle) ───────────────────────
    user_section = ""
    if user_instructions and user_instructions.strip():
        user_section = f"""
━━━ INSTRUCTIONS PARTICULIÈRES DU DEMANDEUR ━━━
{user_instructions.strip()}
Ces instructions ont PRIORITÉ sur les consignes générales.
"""

    # ── Prompt complet ────────────────────────────────────────────────────────
    return f"""Tu es un expert senior en analyse fonctionnelle et rédaction de Spécifications Fonctionnelles Détaillées (SFD).
Tu dois produire un SFD professionnel, complet et conforme aux standards français (MOA/MOE, MERISE).

{intro}

━━━ INFORMATIONS DU DOCUMENT ━━━
Titre du SFD : {title or scope_name}
Date : {today}
Périmètre : {scope_name}

━━━ PROCÉDURES SOURCE ━━━
{context}
{user_section}
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
  ❌ participant SysAuth as "Système Auth"

Flèches SANS guillemets autour du texte :
  ✅ Utilisateur->>Systeme: Saisit ses identifiants
  ❌ Utilisateur->>Systeme: "Saisit ses identifiants"

Noms de participants : UN seul mot, sans espace, sans accent :
  ✅ SystemeAuth   BDD   ApiPaiement
  ❌ Système Auth   système auth

━━ RÈGLES flowchart / graph ━━
Labels de nœuds TOUJOURS entre guillemets doubles :
  ✅ A["Mon label"]   B{{"Décision ?"}}   C(["Acteur"])
  ❌ A[Mon label]     B{{Décision ?}}

Labels de flèches UNIQUEMENT avec pipes :
  ✅ A -->|"Oui"| B
  ❌ A -- Oui --> B

JAMAIS de multi-source :
  ✅ E1 --> I1
     E2 --> I1
  ❌ E1 & E2 --> I1

IDs de nœuds : lettres+chiffres UNIQUEMENT :
  ✅ MOD1   AUTH   UC01
  ❌ MOD_1   step-a

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


# ─── GÉNÉRATION PRINCIPALE ────────────────────────────────────────────────────

async def generate_sfd(
    context: str,
    scope_type: str,
    scope_name: str,
    procedure_count: int,
    title: str = "",
    user_instructions: str = "",
    image_parts: Optional[List[Any]] = None,
) -> SFDDocument:
    """
    Génère un SFD depuis le contexte procédures via Gemini.

    Args:
        context:           Texte structuré produit par data_transformer.build_sfd_context()
        scope_type:        'theme' | 'category' | 'subcategory' | 'procedures'
        scope_name:        Nom du scope pour le titre du document
        procedure_count:   Nombre de procédures incluses
        title:             Titre personnalisé (optionnel)
        user_instructions: Instructions libres du demandeur (optionnel)
        image_parts:       Parts Gemini pour PDFs / images (multimodal, optionnel)

    Returns:
        SFDDocument validé par Pydantic
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY manquant dans l'environnement")

    prompt = _build_prompt(context, scope_type, scope_name, title, procedure_count, user_instructions)

    has_media = bool(image_parts)
    logger.info(
        f"[generate_sfd] Démarrage — scope={scope_type} name={scope_name} "
        f"procs={procedure_count} media={len(image_parts or [])} fichiers"
    )

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    # Construire contents : texte + éventuellement PDFs/images
    if has_media:
        contents: Any = [types.Part(text=prompt)] + list(image_parts)
    else:
        contents = [prompt]

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
    logger.info(f"[generate_sfd] Réponse Gemini reçue ({len(raw)} chars)")

    data = _extract_json(raw)
    sfd  = SFDDocument(**data)

    logger.info(f"[generate_sfd] SFD validé — {len(sfd.modules)} modules, {len(sfd.cas_utilisation)} UC")
    return sfd


# ─── CHAT AGENT ───────────────────────────────────────────────────────────────

async def chat_with_sfd(
    current_sfd: SFDDocument,
    user_message: str,
    chat_history: List[Dict[str, str]],
    scope_name: str = "",
) -> Dict[str, Any]:
    """
    Raffinement itératif du SFD via chat Gemini.

    Args:
        current_sfd:   Le SFDDocument actuel à modifier
        user_message:  Message de l'utilisateur
        chat_history:  Historique des échanges précédents
        scope_name:    Contexte du scope (pour le prompt)

    Returns:
        dict avec agent_message, sections_modified, sfd (SFDDocument mis à jour)
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY manquant dans l'environnement")

    current_sfd_json = json.dumps(current_sfd.model_dump(), ensure_ascii=False, indent=2)
    history_text = "\n".join([
        f"{'Utilisateur' if m['role'] == 'user' else 'Agent'} : {m['content']}"
        for m in chat_history[-10:]
    ])

    prompt = f"""Tu es un expert en rédaction de SFD (Spécification Fonctionnelle Détaillée).
Tu assistes dans la modification et l'enrichissement d'un SFD généré depuis des procédures ProcessMate.

━━━ CONTEXTE ━━━
Périmètre : {scope_name}

━━━ SFD ACTUEL (JSON complet) ━━━
{current_sfd_json}

━━━ HISTORIQUE DE LA CONVERSATION ━━━
{history_text if history_text else "Première interaction."}

━━━ INSTRUCTION ━━━
{user_message}

━━━ STRUCTURE EXACTE DES SECTIONS ━━━
meta: {{nom_projet, client, version, date, statut, auteurs:[str], historique_revisions:[{{version,date,auteur,description}}]}}
contexte: {{presentation_client, contexte_projet, objectifs_metier:[str]}}
perimetre: {{inclus:[str], exclus:[str], hypotheses:[str], contraintes_generales:[str]}}
acteurs: [{{id, nom, type, role, description}}]
cas_utilisation: [{{id, nom, acteur_principal, acteurs_secondaires:[str], preconditions:[str], flux_nominal:[{{numero:int, description}}], flux_alternatifs:[str], flux_erreur:[str], postconditions:[str]}}]
modules: [{{id, nom, description, fonctions:[{{id, nom, priorite, description, donnees_entree:[str], donnees_sortie:[str], regles_gestion_ids:[str], contraintes:[str]}}]}}]
regles_gestion: [{{id, description, type, fonctions_concernees:[str]}}]
specifications_donnees: [{{entite, attributs:[str], description, flux_associes:[str]}}]
interfaces: {{interfaces_ui:[...], interfaces_externes:[...]}}
exigences_non_fonctionnelles: {{performance:[str], securite:[str], disponibilite:[str], ergonomie:[str], maintenabilite:[str]}}
matrice_tracabilite: [{{id_besoin_source, description_besoin, fonctions_couvrant:[str]}}]
schemas_conceptuels: [{{id, titre, type, mermaid_code, description}}]
glossaire: {{terme: définition}}

━━━ DÉTECTION D'INTENTION ━━━
▶ QUESTION → sections_modified = [] / updates = {{}} / agent_message = réponse complète
▶ MODIFICATION → identifier sections, produire updates complets

━━━ FORMAT DE RÉPONSE ━━━
{{
  "agent_message": "Réponse ou confirmation (français)",
  "sections_modified": ["section1"],
  "updates": {{
    "section1": <valeur COMPLÈTE si modification>
  }}
}}"""

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    response = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=GEMINI_MODEL,
        contents=[prompt],
        config=types.GenerateContentConfig(
            temperature=0.4,
            max_output_tokens=32768,
            response_mime_type="application/json",
        )
    )

    data              = _extract_json(response.text)
    agent_message     = data.get("agent_message", "Modifications effectuées.")
    sections_modified = data.get("sections_modified", [])
    updates           = data.get("updates", {})

    sfd_dict = current_sfd.model_dump()
    for key, value in updates.items():
        if key in sfd_dict:
            sfd_dict[key] = value

    new_sfd = SFDDocument(**sfd_dict)

    return {
        "agent_message":     agent_message,
        "sections_modified": sections_modified,
        "sfd":               new_sfd,
    }
