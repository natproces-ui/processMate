"""
themes.py — Palettes de couleurs et configuration des thèmes Word/HTML pour SFD Generator.
Deux thèmes disponibles : al_maghrib (défaut) et corporate_blue (ancien style).
"""

from docx.shared import RGBColor
from dataclasses import dataclass, field
from typing import Dict


# ============================================================================
# DATACLASS THÈME
# ============================================================================

@dataclass
class SFDTheme:
    """Palette complète d'un thème."""

    name: str
    label: str                      # Nom affiché dans l'UI

    # Couleurs Word (RGBColor)
    color_title: RGBColor           # Titre principal (page de garde)
    color_h1: RGBColor              # Titres H1
    color_h2: RGBColor              # Titres H2
    color_h3: RGBColor              # Titres H3
    color_accent: RGBColor          # Accent (italique source, liens)
    color_body: RGBColor            # Corps de texte

    # Couleurs tableaux (hex string, sans #)
    table_header_bg: str            # Fond en-tête tableau
    table_header_fg: str            # Texte en-tête tableau (blanc ou sombre)
    table_row_alt: str              # Fond lignes alternées
    table_row_normal: str           # Fond lignes normales
    table_border: str               # Couleur bordures

    # Couleurs métadonnées (page de garde)
    meta_bg: str                    # Fond cellule clé
    meta_fg_key: RGBColor           # Couleur texte clé
    meta_fg_val: RGBColor           # Couleur texte valeur

    # Règle horizontale (sous H1)
    rule_color: str                 # Hex couleur ligne
    rule_thickness: int             # Épaisseur (twips/8)

    # Police principale
    font_name: str

    # Couleurs HTML (pour html_renderer)
    html: Dict[str, str] = field(default_factory=dict)


# ============================================================================
# THÈME 1 — AL MAGHRIB (défaut)
# ============================================================================

THEME_AL_MAGHRIB = SFDTheme(
    name="al_maghrib",
    label="Bank Al-Maghrib",

    # Bordeaux institutionnel + or
    color_title   = RGBColor(0x7B, 0x0C, 0x0C),   # bordeaux foncé #7B0C0C
    color_h1      = RGBColor(0x7B, 0x0C, 0x0C),   # bordeaux foncé
    color_h2      = RGBColor(0xA0, 0x20, 0x20),   # bordeaux moyen #A02020
    color_h3      = RGBColor(0xC4, 0x92, 0x2A),   # or #C4922A
    color_accent  = RGBColor(0xA0, 0x20, 0x20),
    color_body    = RGBColor(0x1A, 0x1A, 0x1A),

    table_header_bg  = "7B0C0C",    # bordeaux
    table_header_fg  = "FFFFFF",
    table_row_alt    = "FAF3F3",    # rose très léger
    table_row_normal = "FFFFFF",
    table_border     = "D4A0A0",    # bordeaux pâle

    meta_bg      = "F5ECEC",        # fond rosé clair
    meta_fg_key  = RGBColor(0x7B, 0x0C, 0x0C),
    meta_fg_val  = RGBColor(0x2A, 0x2A, 0x2A),

    rule_color     = "7B0C0C",
    rule_thickness = 8,

    font_name = "Calibri",

    html = {
        "title":        "#7B0C0C",
        "h1":           "#7B0C0C",
        "h2":           "#A02020",
        "h3":           "#C4922A",
        "accent":       "#A02020",
        "body":         "#1A1A1A",
        "table_header": "#7B0C0C",
        "table_alt":    "#FAF3F3",
        "border":       "#D4A0A0",
        "meta_bg":      "#F5ECEC",
        "rule":         "#7B0C0C",
    }
)


# ============================================================================
# THÈME 2 — CORPORATE BLUE (ancien style, conservé tel quel)
# ============================================================================

THEME_CORPORATE_BLUE = SFDTheme(
    name="corporate_blue",
    label="Corporate Blue",

    color_title   = RGBColor(0x1F, 0x39, 0x64),   # bleu nuit #1F3964
    color_h1      = RGBColor(0x1F, 0x39, 0x64),
    color_h2      = RGBColor(0x2E, 0x74, 0xB5),   # bleu moyen #2E74B5
    color_h3      = RGBColor(0x2E, 0x74, 0xB5),
    color_accent  = RGBColor(0x2E, 0x74, 0xB5),
    color_body    = RGBColor(0x20, 0x20, 0x20),

    table_header_bg  = "2E74B5",
    table_header_fg  = "FFFFFF",
    table_row_alt    = "F7FAFD",
    table_row_normal = "FFFFFF",
    table_border     = "BFBFBF",

    meta_bg      = "E8EEF5",
    meta_fg_key  = RGBColor(0x1F, 0x39, 0x64),
    meta_fg_val  = RGBColor(0x40, 0x40, 0x40),

    rule_color     = "1F3964",
    rule_thickness = 8,

    font_name = "Calibri",

    html = {
        "title":        "#1F3964",
        "h1":           "#1F3964",
        "h2":           "#2E74B5",
        "h3":           "#2E74B5",
        "accent":       "#2E74B5",
        "body":         "#202020",
        "table_header": "#2E74B5",
        "table_alt":    "#F7FAFD",
        "border":       "#BFBFBF",
        "meta_bg":      "#E8EEF5",
        "rule":         "#1F3964",
    }
)


# ============================================================================
# REGISTRE
# ============================================================================

THEMES: Dict[str, SFDTheme] = {
    "al_maghrib":    THEME_AL_MAGHRIB,
    "corporate_blue": THEME_CORPORATE_BLUE,
}

DEFAULT_THEME = "al_maghrib"


def get_theme(name: str) -> SFDTheme:
    """Retourne le thème par nom, avec fallback sur le thème par défaut."""
    return THEMES.get(name, THEME_AL_MAGHRIB)


def list_themes() -> list[dict]:
    """Liste les thèmes disponibles pour l'API."""
    return [
        {"name": t.name, "label": t.label}
        for t in THEMES.values()
    ]