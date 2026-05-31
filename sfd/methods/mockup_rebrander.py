"""
mockup_rebrander.py — Rebrande chaque screenshot via Gemini Flash Vision.
Prend un screenshot en base64 + infos client → retourne du HTML rebrandé.
"""

import asyncio
import base64
import re
from google import genai
from google.genai import types


async def rebrand_screenshot(
    client: genai.Client,
    screenshot_b64: str,
    page_title: str,
    client_name: str,
    primary_color: str,
    secondary_color: str,
    logo_b64: str | None = None,
    logo_mime: str = "image/png",
) -> str:
    """
    Envoie un screenshot à Gemini Flash Vision et retourne du HTML rebrandé.
    Retry automatique sur 503 (3 tentatives × backoff) puis fallback Flash Lite.
    """

    logo_instruction = ""
    if logo_b64:
        logo_instruction = (
            f"- Remplace tout logo ou nom de marque existant par '{client_name}'. "
            f"Le logo sera injecté en CSS via une image séparée.\n"
        )

    prompt = f"""Tu es un expert UI/UX. Analyse ce screenshot d'interface web et recrée-le en HTML/CSS autonome (tout inline, pas de fichiers externes sauf les CDN publics).

INSTRUCTIONS DE REBRANDING :
- Nom du client : {client_name}
- Couleur primaire : {primary_color} (remplace toutes les couleurs principales : navbar, boutons primaires, headers)
- Couleur secondaire : {secondary_color} (remplace les accents, hover states, highlights)
- Remplace tous les textes "démo", noms de marque du site source, ou contenus génériques par des contenus plausibles pour {client_name}
{logo_instruction}
RÈGLES TECHNIQUES :
- HTML complet et autonome (<!DOCTYPE html> ... </html>)
- CSS inline dans <style> — zéro fichier externe sauf polices Google Fonts et icônes Lucide/FontAwesome via CDN
- Reproduis fidèlement la STRUCTURE et le LAYOUT de l'écran (navbar, sidebar, tables, cartes, graphiques)
- Utilise des données fictives mais réalistes pour {client_name} (données financières, bancaires si pertinent)
- Les graphiques peuvent être simulés avec des barres CSS ou Chart.js CDN
- Responsive non requis — cible desktop 1440px
- NE génère PAS de JavaScript complexe, garde l'UI statique

Retourne UNIQUEMENT le code HTML, sans aucun texte avant ou après, sans balises markdown.
"""

    content_parts = [
        types.Part.from_bytes(
            data=base64.b64decode(screenshot_b64),
            mime_type="image/png",
        ),
        types.Part.from_text(text=prompt),
    ]

    # Retry sur 503 : 3 tentatives par modèle, fallback Flash Lite
    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash-lite"]
    response = None

    for model in models_to_try:
        for attempt in range(3):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model,
                    contents=content_parts,
                    config=types.GenerateContentConfig(
                        max_output_tokens=16384,
                        temperature=0.2,
                    ),
                )
                break  # succès → sortir des tentatives
            except Exception as e:
                err = str(e)
                if "503" in err or "UNAVAILABLE" in err:
                    if attempt < 2:
                        wait = 10 * (attempt + 1)  # 10s puis 20s
                        await asyncio.sleep(wait)
                        continue
                    # 3 tentatives épuisées sur ce modèle → essayer le suivant
                    break
                raise  # autre erreur → remonter immédiatement
        if response is not None:
            break

    if response is None:
        raise RuntimeError(
            "Gemini indisponible (503) après retries sur tous les modèles. "
            "Réessaie dans quelques minutes."
        )

    html = response.text or ""

    # Nettoyer les éventuels backticks markdown
    html = re.sub(r"^```(?:html)?\s*", "", html.strip(), flags=re.IGNORECASE)
    html = re.sub(r"\s*```$", "", html.strip())

    # Injecter le logo si fourni
    if logo_b64 and html:
        logo_data_url = f"data:{logo_mime};base64,{logo_b64}"
        html = _inject_logo(html, logo_data_url, client_name)

    return html


def _inject_logo(html: str, logo_data_url: str, client_name: str) -> str:
    """
    Injecte le logo client dans le HTML en remplaçant le premier img de header/navbar,
    ou en ajoutant un style CSS si pas d'img trouvé.
    """
    # Tentative 1 : remplacer le premier <img> dans une navbar/header
    pattern = r'(<(?:nav|header)[^>]*>.*?)(<img[^>]*>)(.*?</(?:nav|header)>)'
    match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
    if match:
        logo_tag = f'<img src="{logo_data_url}" alt="{client_name}" style="height:36px;object-fit:contain;">'
        html = html[:match.start(2)] + logo_tag + html[match.end(2):]
        return html

    # Tentative 2 : remplacer le texte du nom de marque dans la navbar par une image
    brand_pattern = r'(<(?:span|div|a)[^>]*class="[^"]*(?:brand|logo|navbar-brand)[^"]*"[^>]*>)[^<]*(</(?:span|div|a)>)'
    match = re.search(brand_pattern, html, re.IGNORECASE)
    if match:
        logo_tag = (
            f'{match.group(1)}'
            f'<img src="{logo_data_url}" alt="{client_name}" style="height:32px;object-fit:contain;">'
            f'{match.group(2)}'
        )
        html = html[:match.start()] + logo_tag + html[match.end():]

    return html