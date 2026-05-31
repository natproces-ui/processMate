"""
html_renderer.py — Rendu HTML du SFD (preview WYSIWYG).
Support multi-thèmes via themes.py (al_maghrib | corporate_blue).
"""

import re
import json
from schemas.schema import SFDDocument
from themes import get_theme, DEFAULT_THEME, SFDTheme


# ─── CORRECTEUR MERMAID ───────────────────────────────────────────────────────

def fix_mermaid(code: str) -> str:
    """
    Corrige les erreurs de syntaxe Mermaid les plus fréquentes générées par Gemini.
    Appliqué avant tout rendu HTML et avant export Word (mermaid.ink).
    """
    if not code or not code.strip():
        return code

    lines  = code.split("\n")
    first  = lines[0].strip().lower()
    is_seq = first.startswith("sequencediagram")
    is_flow = first.startswith("flowchart") or first.startswith("graph")

    out = []
    for line in lines:

        # ── sequenceDiagram ──────────────────────────────────────────────────
        if is_seq:
            # 1. participant X as "Label"  →  participant X as Label
            #    (guillemets invalides dans as "..." en Mermaid 11)
            m = re.match(
                r'^(\s*)(actor|participant)\s+(\w+)\s+as\s+"([^"]+)"(.*)$',
                line
            )
            if m:
                indent, kw, alias, label, rest = m.groups()
                out.append(f'{indent}{kw} {alias} as {label}{rest}')
                continue

            # 2. Flèche avec guillemets : A->>B: "texte"  →  A->>B: texte
            m = re.match(r'^(\s*.+[-]+>+.+\s*:\s*)"(.+)"(.*)$', line)
            if m:
                prefix, label, rest = m.groups()
                out.append(f'{prefix}{label}{rest}')
                continue

        # ── flowchart / graph ────────────────────────────────────────────────
        if is_flow:
            # 3. Labels style sequenceDiagram : A --> B: texte
            #    →  A -->|"texte"| B
            m = re.match(
                r'^(\s*)(\w+)\s*([-]+>+|==+>|\.+>)\s*(\w+)\s*:\s*"?([^"\n]+)"?\s*$',
                line
            )
            if m:
                indent, src, arrow, dst, label = m.groups()
                out.append(f'{indent}{src} {arrow}|"{label.strip()}"| {dst}')
                continue

            # 4. Multi-source : A & B & C --> D  →  lignes séparées
            if " & " in line and "-->" in line:
                m = re.match(r'^(\s*)(.+?)\s*(-->.*)', line)
                if m:
                    indent, sources_part, arrow_part = m.groups()
                    sources = [s.strip() for s in sources_part.split("&")]
                    for src in sources:
                        out.append(f'{indent}{src} {arrow_part}')
                    continue

        out.append(line)

    result = "\n".join(out)

    # 5. IDs avec underscore dans flowchart : MOD_1  →  MOD1
    if is_flow:
        result = re.sub(r'\b([A-Za-z]+)_([A-Za-z0-9]+)\b', r'\1\2', result)

    # 6. Commentaires % seul → %% (partout)
    result = re.sub(r'(?m)^(\s*)%(?!%)(.*)$', r'\1%%\2', result)

    # 7. subgraph ID["Label long"] → subgraph ID[ID]
    #    (les labels longs avec guillemets causent des parse errors)
    result = re.sub(
        r'(subgraph\s+(\w+))\s*\["[^"]*"\]',
        r'\1[\2]',
        result
    )

    return result


# ─── CSS DYNAMIQUE ────────────────────────────────────────────────────────────

def _build_css(theme: SFDTheme) -> str:
    h = theme.html
    return f"""
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    background: #C8C8C8;
    color: {h['body']};
    font-size: 10pt;
    line-height: 1.45;
}}
.page {{
    max-width: 21cm;
    min-height: 29.7cm;
    margin: 24px auto;
    background: white;
    padding: 2.5cm;
    box-shadow: 0 4px 24px rgba(0,0,0,0.22);
}}
/* ── Couverture ── */
.cover {{ text-align: center; padding: 60px 0 40px 0; }}
.cover-label {{
    font-size: 11pt; font-weight: bold;
    color: {h['h2']}; letter-spacing: 3px;
    text-transform: uppercase; margin-bottom: 20px;
}}
.cover-title {{
    font-size: 26pt; font-weight: bold;
    color: {h['title']}; margin-bottom: 8px;
    line-height: 1.2;
}}
.cover-client {{
    font-size: 14pt; color: {h['h2']};
    margin-bottom: 40px;
}}
.cover-rule {{
    border: none; border-top: 3px solid {h['title']};
    margin: 24px auto; width: 80%;
}}
.cover-meta {{
    display: inline-block; min-width: 260px;
    margin-top: 32px; border-collapse: collapse;
}}
.cover-meta td {{
    padding: 5px 14px; border: 1px solid {h['border']};
    font-size: 10pt; text-align: left;
}}
.cover-meta td:first-child {{
    background: {h['meta_bg']}; font-weight: bold;
    color: {h['title']}; width: 110px;
}}
/* ── Bandeau thème bas de garde ── */
.cover-band {{
    margin-top: 40px;
    border-top: 3px solid {h['rule']};
    border-bottom: 3px solid {h['rule']};
    padding: 6px 0;
    font-size: 9pt; font-style: italic;
    color: {h['accent']};
    text-align: center;
}}
/* ── Titres ── */
h1 {{
    font-size: 13pt; font-weight: bold;
    color: {h['h1']}; text-transform: uppercase;
    border-bottom: 3px solid {h['rule']};
    padding-bottom: 4px;
    margin-top: 28pt; margin-bottom: 10pt;
}}
h2 {{
    font-size: 11pt; font-weight: bold;
    color: {h['h2']};
    margin-top: 18pt; margin-bottom: 6pt;
}}
h3 {{
    font-size: 10pt; font-weight: bold;
    color: {h['h3']};
    margin-top: 12pt; margin-bottom: 4pt;
}}
h4 {{
    font-size: 10pt; font-weight: bold; font-style: italic;
    color: #404040;
    margin-top: 8pt; margin-bottom: 2pt;
}}
p {{ margin-bottom: 6pt; }}
ul {{ padding-left: 20px; margin-bottom: 6pt; }}
li {{ margin-bottom: 3pt; }}
/* ── Tableaux ── */
table {{
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 10pt;
    font-size: 10pt;
}}
th {{
    background: {h['table_header']}; color: white;
    padding: 6px 10px; text-align: left;
    font-weight: bold; font-size: 10pt;
    border: 1px solid {h['table_header']};
}}
td {{
    padding: 5px 10px;
    border: 1px solid {h['border']};
}}
tr:nth-child(even) td {{ background: {h['table_alt']}; }}
.meta-table td:first-child {{
    background: {h['meta_bg']}; font-weight: bold;
    color: {h['title']}; width: 35%;
}}
/* ── Sommaire HTML ── */
.toc {{
    background: {h['meta_bg']};
    border: 1px solid {h['border']};
    border-radius: 4px;
    padding: 20px 24px;
    margin-bottom: 24pt;
}}
.toc-title {{
    font-size: 13pt; font-weight: bold;
    color: {h['h1']}; text-transform: uppercase;
    border-bottom: 2px solid {h['rule']};
    padding-bottom: 6px; margin-bottom: 12px;
}}
.toc-h1 {{
    display: flex; justify-content: space-between;
    font-size: 10pt; font-weight: bold;
    color: {h['h1']}; margin: 5px 0 2px 0;
    text-decoration: none;
}}
.toc-h1:hover {{ color: {h['h2']}; }}
.toc-h2 {{
    display: flex; justify-content: space-between;
    font-size: 9.5pt; color: {h['h2']};
    margin: 2px 0 2px 16px;
    text-decoration: none;
}}
.toc-h2:hover {{ opacity: 0.7; }}
.toc-dots {{
    flex: 1; border-bottom: 1px dotted {h['border']};
    margin: 0 6px 3px 6px;
}}
/* ── Badges ── */
.badge {{
    display: inline-block; padding: 2px 8px;
    border-radius: 3px; font-size: 8.5pt; font-weight: bold;
}}
.badge-haute    {{ background: #fee2e2; color: #dc2626; }}
.badge-moyenne  {{ background: #fef9c3; color: #ca8a04; }}
.badge-basse    {{ background: #dcfce7; color: #16a34a; }}
.badge-interne  {{ background: #eff6ff; color: #1d4ed8; }}
.badge-externe  {{ background: #f0fdf4; color: #15803d; }}
.badge-systeme  {{ background: #faf5ff; color: #7c3aed; }}
.badge-calcul   {{ background: #fff7ed; color: #c2410c; }}
.badge-validation {{ background: #eff6ff; color: #1d4ed8; }}
.badge-decision {{ background: #fdf4ff; color: #86198f; }}
/* ── Cas d'utilisation ── */
.uc-card {{
    border: 1px solid {h['border']};
    border-radius: 4px;
    margin-bottom: 12pt;
    overflow: hidden;
}}
.uc-header {{
    background: {h['meta_bg']};
    padding: 7px 12px;
    display: flex; align-items: center; gap: 10px;
}}
.uc-id {{
    font-size: 9pt; font-weight: bold;
    color: {h['h2']}; white-space: nowrap;
}}
.uc-nom {{ font-size: 10pt; font-weight: bold; color: {h['h1']}; }}
.uc-body {{ padding: 10px 12px; }}
.uc-section-label {{
    font-size: 9pt; font-weight: bold;
    color: {h['h2']}; text-transform: uppercase;
    letter-spacing: 0.5px; margin-top: 8px; margin-bottom: 4px;
}}
.flux-list {{ list-style: none; padding: 0; }}
.flux-item {{
    display: flex; align-items: flex-start;
    gap: 8px; margin-bottom: 4px;
}}
.flux-num {{
    background: {h['table_header']}; color: white;
    border-radius: 50%; min-width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    font-size: 8pt; font-weight: bold; flex-shrink: 0;
    margin-top: 1px;
}}
/* ── Fonction ── */
.fonction-card {{
    border-left: 3px solid {h['h2']};
    padding: 8px 12px;
    background: {h['table_alt']};
    margin-bottom: 8pt;
}}
.fonction-id {{ font-size: 8.5pt; font-weight: bold; color: {h['h2']}; }}
/* ── Section surlignée ── */
.section-highlight {{
    outline: 2px solid {h['h2']};
    outline-offset: 4px;
    border-radius: 2px;
    transition: outline 0.5s;
}}
/* ── Édition inline ── */
[data-editable]:hover {{
    outline: 1px dashed {h['h2']}80;
    outline-offset: 2px;
    border-radius: 2px;
    cursor: text;
}}
[data-editable]:focus {{
    outline: 2px solid {h['h2']};
    outline-offset: 2px;
    border-radius: 2px;
    background: #fffef0;
}}
.edit-saved {{
    outline: 2px solid #22c55e !important;
    transition: outline 0.4s;
}}
.edit-toolbar {{
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #1e293b;
    color: white;
    font-size: 11px;
    padding: 6px 12px;
    border-radius: 8px;
    display: none;
    align-items: center;
    gap: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}}
.edit-toolbar.visible {{ display: flex; }}
/* ── Séparateur de page ── */
.page-sep {{
    border: none; border-top: 1px dashed #D0D0D0;
    margin: 30pt 0;
}}
/* ── Schémas Mermaid ── */
.mermaid-block {{
    background: #F8FAFD;
    border: 1px solid {h['border']};
    border-radius: 4px;
    padding: 14px 16px;
    margin-bottom: 12pt;
    overflow-x: auto;
}}
.mermaid-block svg {{ max-width: 100%; height: auto; display: block; margin: 0 auto; }}
.mermaid-block pre.mermaid-fallback {{
    font-family: 'Courier New', monospace;
    font-size: 8.5pt;
    color: #404040;
    white-space: pre-wrap;
    margin: 0;
}}
"""


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _e(text) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _badge(value: str, category: str = "") -> str:
    key = value.lower().strip()
    return f'<span class="badge badge-{key}">{_e(value)}</span>'


def _ul(items: list, path: str = "") -> str:
    if not items:
        return ""
    lis = ""
    for i, item in enumerate(items):
        if item:
            p = f' data-editable data-path="{path}.{i}"' if path else ""
            lis += f"<li{p}>{_e(item)}</li>"
    return f"<ul>{lis}</ul>"


def _editable(text: str, path: str, tag: str = "p") -> str:
    """Élément texte éditable avec data-path."""
    return f'<{tag} data-editable data-path="{path}">{_e(str(text))}</{tag}>'


def _table(headers: list, rows: list) -> str:
    ths = "".join(f"<th>{_e(h)}</th>" for h in headers)
    trs = ""
    for row in rows:
        tds = "".join(f"<td>{v}</td>" for v in row)
        trs += f"<tr>{tds}</tr>"
    return f"<table><thead><tr>{ths}</tr></thead><tbody>{trs}</tbody></table>"


def _section(key: str, number: str, title: str, content: str) -> str:
    return (
        f'<div class="section" data-section="{key}" id="section-{key}">'
        f"<h1>{number}. {title.upper()}</h1>"
        f"{content}"
        f"</div>"
    )


# ─── SOMMAIRE HTML ────────────────────────────────────────────────────────────

_SECTIONS_MAP = [
    ("contexte",                  "1",  "Contexte Général"),
    ("perimetre",                 "2",  "Périmètre Fonctionnel"),
    ("acteurs",                   "3",  "Acteurs du Système"),
    ("cas_utilisation",           "4",  "Cas d'Utilisation"),
    ("modules",                   "5",  "Modules et Fonctions"),
    ("regles_gestion",            "6",  "Règles de Gestion"),
    ("specifications_donnees",    "7",  "Spécifications des Données"),
    ("interfaces",                "8",  "Interfaces"),
    ("exigences_non_fonctionnelles", "9", "Exigences Non-Fonctionnelles"),
    ("matrice_tracabilite",       "10", "Matrice de Traçabilité"),
    ("schemas_conceptuels",       "11", "Schémas Conceptuels"),
    ("glossaire",                 "12", "Glossaire"),
]


def _toc(theme: SFDTheme) -> str:
    """Sommaire HTML cliquable — liens vers les ancres de sections."""
    items = ""
    for key, num, label in _SECTIONS_MAP:
        items += f"""
<a class="toc-h1" href="#section-{key}">
  <span>{num}. {_e(label)}</span>
  <span class="toc-dots"></span>
</a>"""
    return f"""
<div class="toc" id="toc">
  <div class="toc-title">Sommaire</div>
  {items}
</div>
"""


# ─── SECTIONS ─────────────────────────────────────────────────────────────────

def _cover(sfd: SFDDocument, theme: SFDTheme) -> str:
    m = sfd.meta
    rows = [
        ("Client",  _e(m.client)),
        ("Version", _e(m.version)),
        ("Date",    _e(m.date)),
        ("Statut",  _e(m.statut)),
    ]
    if m.auteurs:
        rows.append(("Auteurs", _e(", ".join(m.auteurs))))

    meta_rows = "".join(f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in rows)

    hist_html = ""
    if m.historique_revisions:
        rows_hist = [
            [_e(r.version), _e(r.date), _e(r.auteur), _e(r.description)]
            for r in m.historique_revisions
        ]
        hist_html = (
            "<hr class='page-sep'>"
            "<h2>Historique des révisions</h2>"
            + _table(["Version", "Date", "Auteur", "Description"], rows_hist)
        )

    docs_html = ""
    if sfd.documents_reference:
        rows_docs = [
            [_e(d.nom), _e(d.type), _e(d.version), _e(d.description)]
            for d in sfd.documents_reference
        ]
        docs_html = (
            "<h2>Documents de référence</h2>"
            + _table(["Nom", "Type", "Version", "Description"], rows_docs)
        )

    return f"""
<div class="cover">
  <div class="cover-label">Spécification Fonctionnelle Détaillée</div>
  <div class="cover-title">{_e(m.nom_projet)}</div>
  <div class="cover-client">{_e(m.client)}</div>
  <hr class="cover-rule">
  <table class="cover-meta">
    {meta_rows}
  </table>
  <div class="cover-band">{_e(theme.label)} — Document généré automatiquement</div>
</div>
<hr class="page-sep">
{hist_html}
{docs_html}
"""


def _contexte(sfd: SFDDocument) -> str:
    c = sfd.contexte
    html = ""
    if c.presentation_client:
        html += f"<h2>Présentation du client</h2>" + _editable(c.presentation_client, "contexte.presentation_client")
    if c.contexte_projet:
        html += f"<h2>Contexte du projet</h2>" + _editable(c.contexte_projet, "contexte.contexte_projet")
    if c.objectifs_metier:
        html += "<h2>Objectifs métier</h2>" + _ul(c.objectifs_metier, "contexte.objectifs_metier")
    return _section("contexte", "1", "Contexte Général", html)


def _perimetre(sfd: SFDDocument) -> str:
    p = sfd.perimetre
    html = ""
    if p.inclus:
        html += "<h2>Dans le périmètre</h2>" + _ul(p.inclus, "perimetre.inclus")
    if p.exclus:
        html += "<h2>Hors périmètre</h2>" + _ul(p.exclus, "perimetre.exclus")
    if p.hypotheses:
        html += "<h2>Hypothèses</h2>" + _ul(p.hypotheses, "perimetre.hypotheses")
    if p.contraintes_generales:
        html += "<h2>Contraintes générales</h2>" + _ul(p.contraintes_generales, "perimetre.contraintes_generales")
    return _section("perimetre", "2", "Périmètre Fonctionnel", html)


def _acteurs(sfd: SFDDocument) -> str:
    if not sfd.acteurs:
        return _section("acteurs", "3", "Acteurs du Système",
                        "<p><em>Aucun acteur défini.</em></p>")
    rows = [
        [
            f"<strong>{_e(a.id)}</strong>",
            _e(a.nom),
            _badge(a.type),
            _e(a.role),
            _e(a.description),
        ]
        for a in sfd.acteurs
    ]
    html = _table(["ID", "Nom", "Type", "Rôle", "Description"], rows)
    return _section("acteurs", "3", "Acteurs du Système", html)


def _cas_utilisation(sfd: SFDDocument) -> str:
    if not sfd.cas_utilisation:
        return _section("cas_utilisation", "4", "Cas d'Utilisation",
                        "<p><em>Aucun cas d'utilisation défini.</em></p>")
    cards = ""
    for uc in sfd.cas_utilisation:
        flux_items = "".join(
            f'<li class="flux-item">'
            f'<span class="flux-num">{e.numero}</span>'
            f'<span>{_e(e.description)}</span>'
            f'</li>'
            for e in uc.flux_nominal
        )
        pre  = _ul(uc.preconditions)
        alt  = _ul(uc.flux_alternatifs)
        err  = _ul(uc.flux_erreur)
        post = _ul(uc.postconditions)
        sec_actors = (
            f"<p><strong>Acteurs secondaires :</strong> {_e(', '.join(uc.acteurs_secondaires))}</p>"
            if uc.acteurs_secondaires else ""
        )
        cards += f"""
<div class="uc-card">
  <div class="uc-header">
    <span class="uc-id">{_e(uc.id)}</span>
    <span class="uc-nom">{_e(uc.nom)}</span>
    <span style="margin-left:auto;font-size:9pt;color:#555">
      Acteur : <strong>{_e(uc.acteur_principal)}</strong>
    </span>
  </div>
  <div class="uc-body">
    {sec_actors}
    {"<div class='uc-section-label'>Préconditions</div>" + pre if pre else ""}
    <div class="uc-section-label">Flux nominal</div>
    <ul class="flux-list">{flux_items}</ul>
    {"<div class='uc-section-label'>Flux alternatifs</div>" + alt if alt else ""}
    {"<div class='uc-section-label'>Gestion des erreurs</div>" + err if err else ""}
    {"<div class='uc-section-label'>Postconditions</div>" + post if post else ""}
  </div>
</div>"""
    return _section("cas_utilisation", "4", "Cas d'Utilisation", cards)


def _modules(sfd: SFDDocument) -> str:
    if not sfd.modules:
        return _section("modules", "5", "Modules et Fonctions",
                        "<p><em>Aucun module défini.</em></p>")
    html = ""
    for mod in sfd.modules:
        html += f"<h2>{_e(mod.id)} — {_e(mod.nom)}</h2>"
        if mod.description:
            html += f"<p>{_e(mod.description)}</p>"
        for fn in mod.fonctions:
            rg_refs = (
                f"<p><strong>Règles de gestion :</strong> {_e(', '.join(fn.regles_gestion_ids))}</p>"
                if fn.regles_gestion_ids else ""
            )
            html += f"""
<div class="fonction-card">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <span class="fonction-id">{_e(fn.id)}</span>
    <strong>{_e(fn.nom)}</strong>
    {_badge(fn.priorite)}
  </div>
  {"<p>" + _e(fn.description) + "</p>" if fn.description else ""}
  <table style="margin-top:6px">
    <tr>
      <th>Données d'entrée</th>
      <th>Données de sortie</th>
    </tr>
    <tr>
      <td>{"<br>".join(_e(d) for d in fn.donnees_entree) if fn.donnees_entree else "—"}</td>
      <td>{"<br>".join(_e(d) for d in fn.donnees_sortie) if fn.donnees_sortie else "—"}</td>
    </tr>
  </table>
  {rg_refs}
  {"<p><strong>Contraintes :</strong> " + "; ".join(_e(c) for c in fn.contraintes) + "</p>"
   if fn.contraintes else ""}
</div>"""
    return _section("modules", "5", "Modules et Fonctions", html)


def _regles_gestion(sfd: SFDDocument) -> str:
    if not sfd.regles_gestion:
        return _section("regles_gestion", "6", "Règles de Gestion",
                        "<p><em>Aucune règle définie.</em></p>")
    rows = [
        [
            f"<strong>{_e(rg.id)}</strong>",
            _badge(rg.type, "type"),
            _e(rg.description),
            _e(", ".join(rg.fonctions_concernees)) if rg.fonctions_concernees else "—",
        ]
        for rg in sfd.regles_gestion
    ]
    html = _table(["ID", "Type", "Description", "Fonctions concernées"], rows)
    return _section("regles_gestion", "6", "Règles de Gestion", html)


def _specifications_donnees(sfd: SFDDocument) -> str:
    if not sfd.specifications_donnees:
        return _section("specifications_donnees", "7", "Spécifications des Données",
                        "<p><em>Aucune spécification définie.</em></p>")
    html = ""
    for spec in sfd.specifications_donnees:
        html += f"<h3>{_e(spec.entite)}</h3>"
        if spec.description:
            html += f"<p>{_e(spec.description)}</p>"
        if spec.attributs:
            rows = [[_e(a)] for a in spec.attributs]
            html += _table(["Attributs"], rows)
        if spec.flux_associes:
            html += f"<p><strong>Flux associés :</strong> {_e(', '.join(spec.flux_associes))}</p>"
    return _section("specifications_donnees", "7", "Spécifications des Données", html)


def _interfaces(sfd: SFDDocument) -> str:
    html = ""
    if sfd.interfaces.interfaces_ui:
        html += "<h2>Interfaces utilisateur (IHM)</h2>"
        for ihm in sfd.interfaces.interfaces_ui:
            rows = [
                [_e(e.nom), _e(e.type), _e(e.description),
                 "Oui" if e.obligatoire else "Non"]
                for e in ihm.elements
            ]
            html += f"""
<h3>{_e(ihm.id)} — {_e(ihm.nom_ecran)}</h3>
<p>{_e(ihm.description)}</p>
<p><strong>Acteur :</strong> {_e(ihm.acteur)}</p>
"""
            if rows:
                html += _table(["Élément", "Type", "Description", "Obligatoire"], rows)

    if sfd.interfaces.interfaces_externes:
        html += "<h2>Interfaces externes</h2>"
        rows = [
            [
                f"<strong>{_e(i.id)}</strong>",
                _e(i.nom),
                _badge(i.type),
                _e(i.systeme_tiers),
                _e(i.description),
                _e(i.format_echange),
            ]
            for i in sfd.interfaces.interfaces_externes
        ]
        html += _table(
            ["ID", "Nom", "Type", "Système tiers", "Description", "Format"],
            rows
        )

    if not html:
        html = "<p><em>Aucune interface définie.</em></p>"

    return _section("interfaces", "8", "Interfaces", html)


def _exigences_nf(sfd: SFDDocument) -> str:
    enf = sfd.exigences_non_fonctionnelles
    categories = [
        ("Performance",    enf.performance,    "exigences_non_fonctionnelles.performance"),
        ("Sécurité",       enf.securite,       "exigences_non_fonctionnelles.securite"),
        ("Disponibilité",  enf.disponibilite,  "exigences_non_fonctionnelles.disponibilite"),
        ("Ergonomie",      enf.ergonomie,      "exigences_non_fonctionnelles.ergonomie"),
        ("Maintenabilité", enf.maintenabilite, "exigences_non_fonctionnelles.maintenabilite"),
    ]
    html = ""
    for label, items, path in categories:
        if items:
            html += f"<h2>{label}</h2>" + _ul(items, path)
    if not html:
        html = "<p><em>Aucune exigence définie.</em></p>"
    return _section(
        "exigences_non_fonctionnelles", "9",
        "Exigences Non-Fonctionnelles", html
    )


def _matrice_tracabilite(sfd: SFDDocument) -> str:
    if not sfd.matrice_tracabilite:
        return _section("matrice_tracabilite", "10", "Matrice de Traçabilité",
                        "<p><em>Matrice non définie.</em></p>")
    rows = [
        [
            f"<strong>{_e(m.id_besoin_source)}</strong>",
            _e(m.description_besoin),
            _e(", ".join(m.fonctions_couvrant)) if m.fonctions_couvrant else "—",
        ]
        for m in sfd.matrice_tracabilite
    ]
    html = _table(["ID Besoin", "Description du besoin", "Fonctions couvrant"], rows)
    return _section("matrice_tracabilite", "10", "Matrice de Traçabilité", html)


def _schemas_conceptuels(sfd: SFDDocument) -> str:
    if not sfd.schemas_conceptuels:
        return ""
    html = ""
    for sch in sfd.schemas_conceptuels:
        sch_id   = _e(sch.id)
        html    += f"<h2>{sch_id} — {_e(sch.titre)}</h2>"
        if sch.description:
            html += f"<p>{_e(sch.description)}</p>"
        code_json = json.dumps(fix_mermaid(sch.mermaid_code)).replace('</', '<\\/')
        html += (
            f'<div class="mermaid-block">'
            f'<script type="application/json" class="mermaid-src" data-id="{sch_id}">'
            f'{code_json}'
            f'</script>'
            f'<div id="mermaid-{sch_id}"></div>'
            f'</div>'
        )
    return _section("schemas_conceptuels", "11", "Schémas Conceptuels", html)


def _glossaire(sfd: SFDDocument) -> str:
    if not sfd.glossaire:
        return ""
    rows = [[f"<strong>{_e(k)}</strong>", _e(v)] for k, v in sfd.glossaire.items()]
    html = _table(["Terme", "Définition"], rows)
    return _section("glossaire", "12", "Glossaire", html)


# ─── RENDERER PRINCIPAL ───────────────────────────────────────────────────────

def render_html(sfd: SFDDocument, style: str = DEFAULT_THEME) -> str:
    """
    Génère le HTML complet du SFD avec le thème spécifié.

    Args:
        sfd:   L'objet SFDDocument à rendre.
        style: Nom du thème ('al_maghrib' ou 'corporate_blue').

    Returns:
        Chaîne HTML auto-contenue (CSS inclus).
    """
    theme = get_theme(style)
    css   = _build_css(theme)

    body = (
        _cover(sfd, theme)
        + _toc(theme)
        + _contexte(sfd)
        + _perimetre(sfd)
        + _acteurs(sfd)
        + _cas_utilisation(sfd)
        + _modules(sfd)
        + _regles_gestion(sfd)
        + _specifications_donnees(sfd)
        + _interfaces(sfd)
        + _exigences_nf(sfd)
        + _matrice_tracabilite(sfd)
        + _schemas_conceptuels(sfd)
        + _glossaire(sfd)
    )

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_e(sfd.meta.nom_projet)} — SFD</title>
<style>{css}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
</head>
<body>
<div class="page">
{body}
</div>
<script>
// ── Clicks section → parent ───────────────────────────────────────────────────
document.addEventListener('click', function(e) {{
  if (e.target.closest('[data-editable]')) return; // ne pas déclencher si édition
  var el = e.target;
  while (el && !el.getAttribute('data-section')) {{ el = el.parentElement; }}
  if (el) {{ window.parent.postMessage({{ type: 'sfd-section-click', key: el.getAttribute('data-section') }}, '*'); }}
}});

// ── Highlight & scroll ← parent ──────────────────────────────────────────────
window.addEventListener('message', function(e) {{
  if (!e.data) return;
  if (e.data.type === 'sfd-highlight') {{
    (e.data.keys || []).forEach(function(key) {{
      var el = document.querySelector('[data-section="' + key + '"]');
      if (el) {{
        el.classList.add('section-highlight');
        setTimeout(function() {{ el.classList.remove('section-highlight'); }}, 3000);
      }}
    }});
  }}
  if (e.data.type === 'sfd-scroll') {{
    var el = document.querySelector('[data-section="' + e.data.key + '"]');
    if (el) {{ el.scrollIntoView({{ behavior: 'smooth', block: 'start' }}); }}
  }}
}});

// ── Édition inline ────────────────────────────────────────────────────────────
(function() {{
  var toolbar = document.createElement('div');
  toolbar.className = 'edit-toolbar';
  toolbar.innerHTML = '✏️ <span id="edit-status">Double-cliquez pour éditer</span>';
  document.body.appendChild(toolbar);

  var saveTimer = null;
  var activeEl  = null;

  function showToolbar(msg) {{
    toolbar.querySelector('#edit-status').textContent = msg;
    toolbar.classList.add('visible');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function() {{
      toolbar.classList.remove('visible');
    }}, 2500);
  }}

  // Double-clic → active contenteditable
  document.addEventListener('dblclick', function(e) {{
    var el = e.target.closest('[data-editable]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();

    if (activeEl && activeEl !== el) {{
      activeEl.contentEditable = 'false';
    }}

    el.contentEditable = 'true';
    el.focus();

    // Placer le curseur à l'endroit du clic
    var range = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null;
    if (range) {{
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }}

    activeEl = el;
    showToolbar('Édition en cours — cliquez ailleurs pour sauvegarder');
  }});

  // Blur → sauvegarde
  document.addEventListener('focusout', function(e) {{
    var el = e.target;
    if (!el.getAttribute('data-editable') || el.contentEditable !== 'true') return;

    el.contentEditable = 'false';
    var path  = el.getAttribute('data-path');
    var value = el.innerText.trim();

    if (!path) return;

    // Envoie au parent React
    window.parent.postMessage({{
      type:  'sfd-edit',
      path:  path,
      value: value,
    }}, '*');

    // Feedback visuel
    el.classList.add('edit-saved');
    setTimeout(function() {{ el.classList.remove('edit-saved'); }}, 1200);
    showToolbar('✅ Sauvegardé');

    activeEl = null;
  }});

  // Entrée = confirme (sans créer de nouvelle ligne pour les <p> et <li>)
  document.addEventListener('keydown', function(e) {{
    var el = e.target;
    if (!el.getAttribute('data-editable') || el.contentEditable !== 'true') return;
    if (e.key === 'Enter' && (el.tagName === 'P' || el.tagName === 'LI')) {{
      e.preventDefault();
      el.blur();
    }}
    if (e.key === 'Escape') {{
      el.contentEditable = 'false';
      activeEl = null;
      toolbar.classList.remove('visible');
    }}
  }});
}})();

// ── Rendu Mermaid séquentiel ──────────────────────────────────────────────────
(function() {{
  var sources = document.querySelectorAll('script.mermaid-src[type="application/json"]');
  if (!sources.length) return;
  function waitMermaid(cb) {{
    if (typeof mermaid !== 'undefined') {{ cb(); return; }}
    setTimeout(function() {{ waitMermaid(cb); }}, 150);
  }}
  waitMermaid(function() {{
    mermaid.initialize({{ startOnLoad: false, theme: 'default' }});
    var queue = Array.prototype.slice.call(sources);
    var counter = 0;
    function next() {{
      if (!queue.length) return;
      var sc = queue.shift();
      var code, targetId, el;
      try {{
        code     = JSON.parse(sc.textContent);
        targetId = sc.getAttribute('data-id');
        el       = document.getElementById('mermaid-' + targetId);
      }} catch(e) {{ next(); return; }}
      if (!el) {{ next(); return; }}
      var uid = 'msv' + (counter++) + String(Date.now());
      function showErr(err) {{
        var msg = err && err.message ? err.message : String(err);
        el.innerHTML =
          '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:10px 12px;margin-bottom:6px;">'
          + '<strong style="color:#856404;">⚠ Erreur Mermaid :</strong> '
          + '<span style="color:#856404;font-size:9pt;">' + msg.replace(/</g,'&lt;').substring(0,300) + '</span>'
          + '</div>'
          + '<pre class="mermaid-fallback">' + code.replace(/</g,'&lt;') + '</pre>';
        next();
      }}
      mermaid.render(uid, code).then(function(r) {{
        el.innerHTML = r.svg; next();
      }}).catch(function(err) {{
        var msg = err && err.message ? err.message : String(err);
        var isFlowErr = /suitable point/i.test(msg);
        var isSvgErr  = /svg element not in render tree/i.test(msg);
        if ((isFlowErr || isSvgErr) && /^(flowchart|graph)/i.test(code.trim())) {{
          var code2 = '%%{{init: {{"flowchart": {{"curve": "linear"}}}}}}%%\\n' + code;
          mermaid.render(uid + 'r', code2).then(function(r2) {{
            el.innerHTML = r2.svg; next();
          }}).catch(function(e2) {{ showErr(e2); }});
        }} else if (isSvgErr) {{
          setTimeout(function() {{
            mermaid.render(uid + 't', code).then(function(r3) {{
              el.innerHTML = r3.svg; next();
            }}).catch(function(e3) {{ showErr(e3); }});
          }}, 200);
        }} else {{
          showErr(err);
        }}
      }});
    }}
    next();
  }});
}})();
</script>
</body>
</html>"""