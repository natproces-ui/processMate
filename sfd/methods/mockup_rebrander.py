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

    prompt = f"""You are a pixel-perfect UI replication expert. Your task is to reproduce this screenshot as an EXACT HTML/CSS replica, changing ONLY the brand identity.

═══ WHAT TO CHANGE (brand only) ═══
- Replace every occurrence of the source brand name with: {client_name}
- Replace primary color with: {primary_color}
- Replace secondary/accent color with: {secondary_color}
{logo_instruction}
═══ WHAT TO KEEP IDENTICAL ═══
- EVERY layout element: navbar, sidebar, breadcrumb, hero, cards, tables, charts, footer
- EVERY micro-component: buttons, badges, pills, tags, arrows, icons, tooltips, progress bars
- EVERY spacing: margins, paddings, gaps between elements
- EVERY typography: font sizes, weights, line heights, text transforms
- EVERY visual effect: gradients, shadows, borders, border-radius, opacity
- EVERY data value: numbers, dates, currencies, percentages (only replace brand names in text)
- EVERY interactive element appearance: hover states visually rendered as in the screenshot

═══ TECHNICAL REQUIREMENTS ═══
- Complete standalone HTML (<!DOCTYPE html>...</html>)
- All CSS in a single <style> block — no external files except:
  * Google Fonts CDN (match the fonts visible in the screenshot)
  * Font Awesome or Lucide icons CDN (match the icons exactly)
  * Chart.js CDN only if the screenshot contains actual charts/graphs
- Target: desktop 1440px width, no responsive needed
- For icons: inspect the screenshot carefully and use the matching icon names
- For gradients: extract the exact gradient colors from the screenshot
- For data cards: reproduce the EXACT card structure — title, value, date, trend arrow, source label, action button
- For charts: use Chart.js with data that approximates what is visible in the screenshot
- Static HTML only — no complex JavaScript

═══ CRITICAL RULES ═══
1. DO NOT simplify — if the original has 12 navigation items, reproduce all 12
2. DO NOT omit elements — every visible pixel must be accounted for
3. DO NOT change layouts — same column count, same grid, same sidebar width
4. DO NOT invent new elements — only reproduce what you see
5. If text is a brand name (the source site name) → replace with {client_name}
6. If text is data/content (numbers, descriptions, dates) → keep as-is

Return ONLY the HTML code. No markdown, no explanation, no comments outside the code.
"""

    content_parts = [
        types.Part.from_bytes(
            data=base64.b64decode(screenshot_b64),
            mime_type="image/png",
        ),
        types.Part.from_text(text=prompt),
    ]

    # Retry sur 503 : 3 tentatives par modèle, fallback Flash Lite
    models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash"]
    response = None

    for model in models_to_try:
        for attempt in range(3):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model,
                    contents=content_parts,
                    config=types.GenerateContentConfig(
                        max_output_tokens=32768,
                        temperature=0.1,
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