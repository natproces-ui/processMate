"""
themes.py — Palettes de couleurs et configuration des thèmes Word/HTML pour SFD.

4 thèmes génériques et professionnels, utilisables par n'importe quelle
organisation (aucune charte graphique propre à une entreprise en particulier).
"""

from docx.shared import RGBColor
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class SFDTheme:
    name: str
    label: str
    color_title: RGBColor
    color_h1: RGBColor
    color_h2: RGBColor
    color_h3: RGBColor
    color_accent: RGBColor
    color_body: RGBColor
    table_header_bg: str
    table_header_fg: str
    table_row_alt: str
    table_row_normal: str
    table_border: str
    meta_bg: str
    meta_fg_key: RGBColor
    meta_fg_val: RGBColor
    rule_color: str
    rule_thickness: int
    font_name: str
    html: Dict[str, str] = field(default_factory=dict)


THEME_CORPORATE_BLUE = SFDTheme(
    name="corporate_blue",
    label="Bleu Corporate",
    color_title   = RGBColor(0x1F, 0x39, 0x64),
    color_h1      = RGBColor(0x1F, 0x39, 0x64),
    color_h2      = RGBColor(0x2E, 0x74, 0xB5),
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
        "title": "#1F3964", "h1": "#1F3964", "h2": "#2E74B5", "h3": "#2E74B5",
        "accent": "#2E74B5", "body": "#202020", "table_header": "#2E74B5",
        "table_alt": "#F7FAFD", "border": "#BFBFBF", "meta_bg": "#E8EEF5",
        "rule": "#1F3964",
    }
)

THEME_GRAPHITE = SFDTheme(
    name="graphite",
    label="Graphite",
    color_title   = RGBColor(0x2B, 0x2B, 0x2B),
    color_h1      = RGBColor(0x2B, 0x2B, 0x2B),
    color_h2      = RGBColor(0x59, 0x59, 0x59),
    color_h3      = RGBColor(0x8C, 0x8C, 0x8C),
    color_accent  = RGBColor(0x40, 0x40, 0x40),
    color_body    = RGBColor(0x1A, 0x1A, 0x1A),
    table_header_bg  = "404040",
    table_header_fg  = "FFFFFF",
    table_row_alt    = "F5F5F5",
    table_row_normal = "FFFFFF",
    table_border     = "D0D0D0",
    meta_bg      = "EDEDED",
    meta_fg_key  = RGBColor(0x2B, 0x2B, 0x2B),
    meta_fg_val  = RGBColor(0x40, 0x40, 0x40),
    rule_color     = "2B2B2B",
    rule_thickness = 8,
    font_name = "Calibri",
    html = {
        "title": "#2B2B2B", "h1": "#2B2B2B", "h2": "#595959", "h3": "#8C8C8C",
        "accent": "#404040", "body": "#1A1A1A", "table_header": "#404040",
        "table_alt": "#F5F5F5", "border": "#D0D0D0", "meta_bg": "#EDEDED",
        "rule": "#2B2B2B",
    }
)

THEME_EMERALD = SFDTheme(
    name="emerald",
    label="Émeraude",
    color_title   = RGBColor(0x1B, 0x5E, 0x3F),
    color_h1      = RGBColor(0x1B, 0x5E, 0x3F),
    color_h2      = RGBColor(0x2E, 0x8B, 0x57),
    color_h3      = RGBColor(0x4C, 0xAF, 0x7D),
    color_accent  = RGBColor(0x2E, 0x8B, 0x57),
    color_body    = RGBColor(0x1A, 0x1A, 0x1A),
    table_header_bg  = "1B5E3F",
    table_header_fg  = "FFFFFF",
    table_row_alt    = "F0F7F3",
    table_row_normal = "FFFFFF",
    table_border     = "BFE0CC",
    meta_bg      = "E6F4EC",
    meta_fg_key  = RGBColor(0x1B, 0x5E, 0x3F),
    meta_fg_val  = RGBColor(0x33, 0x33, 0x33),
    rule_color     = "1B5E3F",
    rule_thickness = 8,
    font_name = "Calibri",
    html = {
        "title": "#1B5E3F", "h1": "#1B5E3F", "h2": "#2E8B57", "h3": "#4CAF7D",
        "accent": "#2E8B57", "body": "#1A1A1A", "table_header": "#1B5E3F",
        "table_alt": "#F0F7F3", "border": "#BFE0CC", "meta_bg": "#E6F4EC",
        "rule": "#1B5E3F",
    }
)

THEME_BORDEAUX_PREMIUM = SFDTheme(
    name="bordeaux_premium",
    label="Bordeaux Premium",
    color_title   = RGBColor(0x7B, 0x0C, 0x0C),
    color_h1      = RGBColor(0x7B, 0x0C, 0x0C),
    color_h2      = RGBColor(0xA0, 0x20, 0x20),
    color_h3      = RGBColor(0xC4, 0x92, 0x2A),
    color_accent  = RGBColor(0xA0, 0x20, 0x20),
    color_body    = RGBColor(0x1A, 0x1A, 0x1A),
    table_header_bg  = "7B0C0C",
    table_header_fg  = "FFFFFF",
    table_row_alt    = "FAF3F3",
    table_row_normal = "FFFFFF",
    table_border     = "D4A0A0",
    meta_bg      = "F5ECEC",
    meta_fg_key  = RGBColor(0x7B, 0x0C, 0x0C),
    meta_fg_val  = RGBColor(0x2A, 0x2A, 0x2A),
    rule_color     = "7B0C0C",
    rule_thickness = 8,
    font_name = "Calibri",
    html = {
        "title": "#7B0C0C", "h1": "#7B0C0C", "h2": "#A02020", "h3": "#C4922A",
        "accent": "#A02020", "body": "#1A1A1A", "table_header": "#7B0C0C",
        "table_alt": "#FAF3F3", "border": "#D4A0A0", "meta_bg": "#F5ECEC",
        "rule": "#7B0C0C",
    }
)

THEMES: Dict[str, SFDTheme] = {
    "corporate_blue":   THEME_CORPORATE_BLUE,
    "graphite":         THEME_GRAPHITE,
    "emerald":          THEME_EMERALD,
    "bordeaux_premium": THEME_BORDEAUX_PREMIUM,
}

DEFAULT_THEME = "corporate_blue"


def get_theme(name: str) -> SFDTheme:
    return THEMES.get(name, THEME_CORPORATE_BLUE)


def list_themes() -> list[dict]:
    return [{"name": t.name, "label": t.label} for t in THEMES.values()]
