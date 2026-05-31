"""
web_explorer.py — Explorateur web autonome avec Playwright + Gemini.
"""

import asyncio
import json
import re
from io import BytesIO
from typing import Optional, Callable, Awaitable
from PIL import Image, ImageDraw

PLAYWRIGHT_AVAILABLE = False
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    pass


def screenshot_to_pil(b: bytes) -> Image.Image:
    return Image.open(BytesIO(b))


def add_label(img: Image.Image, label: str) -> Image.Image:
    img = img.copy()
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, img.width, 28], fill=(20, 20, 20))
    draw.text((8, 6), label[:120], fill=(255, 220, 0))
    return img


async def get_snapshot(page) -> dict:
    snap = {}
    snap["url"] = page.url
    snap["title"] = await page.title()

    snap["clickable"] = await page.evaluate("""
        () => {
            const els = [...document.querySelectorAll(
                'a[href], button, input, select, [role="button"], [role="tab"], [role="menuitem"], [role="link"]'
            )];
            return els
                .filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 &&
                           r.top >= 0 && r.top < window.innerHeight &&
                           getComputedStyle(el).visibility !== 'hidden' &&
                           getComputedStyle(el).display !== 'none';
                })
                .map((el, i) => ({
                    index: i,
                    tag: el.tagName,
                    type: el.type || '',
                    role: el.getAttribute('role') || '',
                    text: (el.innerText || el.placeholder || el.value ||
                           el.getAttribute('aria-label') || '').trim().slice(0, 80),
                    href: el.href || '',
                    x: Math.round(el.getBoundingClientRect().left + el.getBoundingClientRect().width/2),
                    y: Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height/2)
                }))
                .filter(el => el.text.length > 0)
                .slice(0, 25);
        }
    """)

    snap["visible_text"] = await page.evaluate("""
        () => {
            const els = [...document.querySelectorAll('h1,h2,h3,p,li,td,span')]
                .filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.top >= 0 && r.top < window.innerHeight &&
                           r.width > 0 && el.children.length === 0 &&
                           getComputedStyle(el).visibility !== 'hidden';
                });
            return [...new Set(els.map(el => el.innerText.trim()))]
                .filter(t => t.length > 3)
                .slice(0, 60)
                .join(' | ');
        }
    """)

    snap["scroll_position"] = await page.evaluate("window.pageYOffset")
    snap["page_height"]     = await page.evaluate("document.body.scrollHeight")
    snap["viewport_height"] = await page.evaluate("window.innerHeight")
    return snap


async def gemini_plan_actions(
    client, snapshot: dict, screenshot: Optional[Image.Image],
    history: list, target_url: str, actions_per_call: int = 6
) -> list:
    from google.genai import types

    def pil_to_part(img: Image.Image):
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=75)
        return types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg")

    history_text = "\n".join([
        f"  Étape {i+1}: {h['action']} → {h['result']}"
        for i, h in enumerate(history)
    ])

    visited_urls = list(set([
        h.get("url_after", "")
        for h in history
        if h.get("url_after", "").startswith("http")
    ]))

    prompt = f"""
Tu es un agent de navigation web autonome. Tu explores un site web pour comprendre son fonctionnement
afin de générer une Spécification Fonctionnelle Détaillée (SFD).

═══ ÉTAT ACTUEL ═══
URL de départ : {target_url}
URL actuelle  : {snapshot['url']}
Titre         : {snapshot['title']}
Scroll        : {snapshot['scroll_position']}px / {snapshot['page_height']}px

ÉLÉMENTS CLIQUABLES (avec index) :
{json.dumps(snapshot['clickable'], ensure_ascii=False, indent=2)}

TEXTE VISIBLE :
{snapshot['visible_text'][:1500]}

═══ HISTORIQUE ═══
{history_text if history_text else "Aucune action encore effectuée."}

URLs DÉJÀ VISITÉES (à éviter) :
{json.dumps(visited_urls, ensure_ascii=False)}

═══ TON OBJECTIF POUR LE SFD ═══
Explorer MÉTHODIQUEMENT pour identifier :
- La structure et l'architecture du site
- Toutes les fonctionnalités disponibles (menus, sous-menus, formulaires, filtres)
- Les modules et sections principales
- Les interactions utilisateur
- Les parcours de navigation possibles
- Les rôles utilisateurs visibles (public, connecté, admin)

═══ RÈGLES ═══
1. N'utilise JAMAIS "back" — utilise "goto" avec l'URL exacte
2. Ne scroll pas plus de 2 fois consécutives
3. Ne revisite pas une URL déjà visitée
4. URL de départ : {target_url}
5. PRÉFÈRE "goto" à "click" pour les liens <a> avec href visible — plus fiable que le clic sur les menus déroulants
6. Utilise "click" uniquement pour les boutons, formulaires, onglets (éléments sans href)

Planifie exactement {actions_per_call} actions. JSON uniquement :

{{
  "plan": [
    {{"action": "click", "index": 3, "text": "Menu X", "reason": "Explorer le menu"}},
    {{"action": "scroll_down", "amount": 600, "reason": "Voir le contenu plus bas"}},
    {{"action": "goto", "url": "https://exemple.com/page", "reason": "Visiter cette section"}},
    {{"action": "type", "index": 5, "text": "mot clé", "submit": true, "reason": "Tester la recherche"}},
    {{"action": "click", "index": 2, "text": "Bouton Y", "reason": "Explorer"}},
    {{"action": "goto", "url": "{target_url}", "reason": "Retour accueil"}}
  ],
  "strategy": "Ta stratégie en 1 phrase"
}}

Actions : click, scroll_down, scroll_up, type, goto, done.
⚠️ Jamais "back". JSON uniquement, rien d'autre.
"""

    contents = [prompt] if screenshot is None else [prompt, pil_to_part(screenshot)]

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=contents
    )

    raw = response.text.strip()
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'^```\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    try:
        parsed = json.loads(raw)
        plan = parsed.get("plan", [])
        strategy = parsed.get("strategy", "")
        if strategy:
            print(f"   💡 Stratégie : {strategy[:100]}")
        return plan
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group()).get("plan", [])
            except Exception:
                pass
        return [{"action": "goto", "url": target_url, "reason": "Fallback"}]


async def execute_action(page, action_dict: dict, snapshot: dict, target_url: str) -> str:
    action = action_dict.get("action")
    result = "Action exécutée"

    try:
        if action == "click":
            index = action_dict.get("index", 0)
            clickable = snapshot["clickable"]
            if index < len(clickable):
                el = clickable[index]
                x, y = el["x"], el["y"]
                url_pre_click = page.url
                try:
                    await page.mouse.click(x, y)
                    await asyncio.sleep(0.8)
                    # Si le clic n'a pas changé l'URL (dropdown/hover menu), forcer goto
                    if page.url == url_pre_click and el.get("href", "").startswith("http"):
                        await page.goto(el["href"], wait_until='domcontentloaded', timeout=20000)
                        result = f"Clic sans navigation → goto {el['href']}"
                    else:
                        result = f"Cliqué sur '{el['text']}' à ({x},{y})"
                except Exception:
                    if el.get("href") and el["href"].startswith("http"):
                        await page.goto(el["href"], wait_until='domcontentloaded', timeout=20000)
                        result = f"Navigation vers {el['href']}"
                    else:
                        result = f"Clic échoué sur '{el['text']}'"
            else:
                await page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
                result = "Index hors limites — retour accueil"

        elif action == "scroll_down":
            amount = action_dict.get("amount", 500)
            current = await page.evaluate("window.pageYOffset")
            await page.evaluate(f"window.scrollTo(0, {current + amount})")
            result = f"Scrollé de {amount}px vers le bas"

        elif action == "scroll_up":
            amount = action_dict.get("amount", 500)
            current = await page.evaluate("window.pageYOffset")
            await page.evaluate(f"window.scrollTo(0, {max(0, current - amount)})")
            result = f"Scrollé de {amount}px vers le haut"

        elif action == "type":
            index = action_dict.get("index", 0)
            text = action_dict.get("text", "")
            submit = action_dict.get("submit", False)
            clickable = snapshot["clickable"]
            if index < len(clickable):
                el = clickable[index]
                await page.mouse.click(el["x"], el["y"])
                await asyncio.sleep(0.4)
                await page.keyboard.type(text, delay=50)
                if submit:
                    await page.keyboard.press("Enter")
                result = f"Tapé '{text}'" + (" + Enter" if submit else "")
            else:
                result = "Index type hors limites"

        elif action == "goto":
            url = action_dict.get("url", target_url)
            if not url.startswith("http"):
                url = target_url
            await page.goto(url, wait_until='domcontentloaded', timeout=20000)
            result = f"Navigation vers {url}"

        elif action in ("back", "done"):
            if action == "back":
                await page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
                result = f"Back intercepté → goto {target_url}"
            else:
                result = "Exploration terminée"

    except Exception as e:
        result = f"Erreur : {str(e)[:100]}"
        try:
            if not page.url.startswith("http") or "blank" in page.url:
                await page.goto(target_url, wait_until='domcontentloaded', timeout=20000)
        except Exception:
            pass

    await asyncio.sleep(1.5)

    if action in ["click", "goto", "type"]:
        try:
            await page.wait_for_load_state('networkidle', timeout=5000)
        except Exception:
            await asyncio.sleep(1)

    return result


# Type du callback de progression
ProgressCallback = Callable[[str, str], Awaitable[None]]


async def explore_website(
    target_url: str,
    gemini_api_key: str,
    max_gemini_calls: int = 6,
    actions_per_call: int = 6,
    on_progress: Optional[ProgressCallback] = None
) -> dict:

    async def notify(stage: str, message: str):
        print(message)
        if on_progress:
            await on_progress(stage, message)

    if not PLAYWRIGHT_AVAILABLE:
        await notify("exploration", "⚠️ Playwright non disponible — fallback HTTP")
        return await _fallback_scrape(target_url)

    await notify("exploration", f"🌐 Chargement de {target_url}...")

    from google import genai
    client = genai.Client(api_key=gemini_api_key)

    history         = []
    all_screenshots = []
    visited_urls    = set()
    step            = 0
    done            = False
    site_title      = ""

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox',
                      '--disable-blink-features=AutomationControlled']
            )
            context = await browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                locale='fr-FR'
            )
            page = await context.new_page()

            try:
                await page.goto(target_url, wait_until='networkidle', timeout=45000)
            except Exception:
                try:
                    await page.goto(target_url, wait_until='load', timeout=30000)
                except Exception:
                    await page.goto(target_url, wait_until='commit', timeout=20000)
            await asyncio.sleep(2)

            site_title = await page.title()
            visited_urls.add(page.url)
            await notify("exploration", f"✅ Site chargé : {site_title}")

            for call_num in range(1, max_gemini_calls + 1):
                if done:
                    break

                await notify(
                    "exploration",
                    f"📋 Plan {call_num}/{max_gemini_calls} — {step} actions effectuées"
                )

                snapshot = await get_snapshot(page)
                try:
                    shot_bytes = await page.screenshot(type='jpeg', quality=80, timeout=15000)
                    screenshot = screenshot_to_pil(shot_bytes)
                except Exception as se:
                    print(f"⚠️ Screenshot échoué ({str(se)[:60]}), mode texte seul")
                    screenshot = None

                action_plan = await gemini_plan_actions(
                    client, snapshot, screenshot, history, target_url, actions_per_call
                )

                for i, action_dict in enumerate(action_plan):
                    step += 1
                    action_type = action_dict.get("action", "?")
                    reason      = action_dict.get("reason", "")

                    print(f"  ▶ [{step}] {action_type.upper()} — {reason[:70]}")

                    if action_type == "done":
                        print("   ✅ Exploration terminée par l'agent")
                        done = True
                        break

                    try:
                        shot_bytes = await page.screenshot(type='jpeg', quality=70, timeout=12000)
                        labeled = add_label(
                            screenshot_to_pil(shot_bytes),
                            f"Plan {call_num} | Act {i+1} | {action_type.upper()} | {page.url[:55]}"
                        )
                        all_screenshots.append(labeled)
                    except Exception:
                        pass  # screenshot optionnel pour l'historique

                    url_before = page.url
                    try:
                        result    = await execute_action(page, action_dict, snapshot, target_url)
                        url_after = page.url
                    except Exception as action_err:
                        err_str = str(action_err)
                        if "execution context" in err_str or "Target closed" in err_str or "detached" in err_str:
                            print(f"   ⚠️ Contexte détruit, retour à {target_url}")
                            try:
                                await page.goto(target_url, wait_until="load", timeout=20000)
                                await page.wait_for_timeout(1500)
                            except Exception:
                                pass
                            result    = "contexte détruit, navigation reset"
                            url_after = page.url
                        else:
                            raise

                    if action_type in ["click", "goto", "type"]:
                        try:
                            snapshot = await get_snapshot(page)
                        except Exception:
                            snapshot = {}
                        if url_after.startswith("http"):
                            visited_urls.add(url_after)

                    print(f"     ✅ {result[:70]} → {url_after[:60]}")

                    history.append({
                        "step":                step,
                        "plan":                call_num,
                        "url_before":          url_before,
                        "action":              f"{action_type}: {str(action_dict.get('text', action_dict.get('url', action_dict.get('amount', action_dict.get('reason', '')))))[:60]}",
                        "reason":              reason,
                        "result":              result,
                        "url_after":           url_after,
                        "visible_text_sample": snapshot.get("visible_text", "")[:300]
                    })

            await browser.close()

    except Exception as e:
        await notify("exploration", f"❌ Erreur Playwright : {str(e)[:80]}")
        print(f"   Collecté avant erreur : {step} actions, {len(visited_urls)} URLs")

    text_summary = _build_text_summary(history, site_title, target_url, visited_urls)

    await notify("exploration", f"✅ Exploration terminée : {step} actions, {len(visited_urls)} pages visitées")

    return {
        "url":             target_url,
        "title":           site_title,
        "history":         history,
        "visited_urls":    list(visited_urls),
        "steps_completed": step,
        "text_summary":    text_summary,
        "screenshots":     all_screenshots
    }


def _build_text_summary(history: list, title: str, url: str, visited_urls: set) -> str:
    lines = [
        f"=== EXPLORATION DE {url} ===",
        f"Titre : {title}",
        f"",
        f"PAGES VISITÉES ({len(visited_urls)}) :",
    ]
    for u in sorted(visited_urls):
        lines.append(f"  - {u}")

    lines.append(f"\nNAVIGATIONS ET INTERACTIONS ({len(history)}) :")
    for h in history:
        url_before = h.get("url_before", "")
        url_after  = h.get("url_after", "")
        action     = h.get("action", "")
        result     = h.get("result", "")

        if url_before != url_after:
            lines.append(f"  [{h['step']}] 🔀 NAVIGATION : {url_before} ➜ {url_after}")
            lines.append(f"       Via : {action}")
        else:
            lines.append(f"  [{h['step']}] 🖱️  INTERACTION : {action} → {result[:80]}")

    return "\n".join(lines)


async def _fallback_scrape(url: str) -> dict:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; SFDBot/1.0)"
            })
            content = resp.text[:8000]
            return {
                "url":             url,
                "title":           "Site analysé (mode fallback)",
                "history":         [],
                "visited_urls":    [url],
                "steps_completed": 0,
                "text_summary":    f"Contenu brut récupéré via HTTP:\n{content}",
                "screenshots":     []
            }
    except Exception as e:
        return {
            "url":             url,
            "title":           "Non accessible",
            "history":         [],
            "visited_urls":    [],
            "steps_completed": 0,
            "text_summary":    f"Impossible d'accéder à {url}: {str(e)}",
            "screenshots":     []
        }