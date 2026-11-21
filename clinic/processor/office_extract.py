# clinic/processor/office_extract.py
"""
Extraction des documents Word (.docx) et PowerPoint (.pptx) pour le Studio.

Gemini lit nativement les PDF et les images, pas les fichiers Office. On en tire :
- un texte structuré (titres, paragraphes, tableaux en Markdown, notes de diapositives) ;
- pour PowerPoint, les liaisons entre formes (« A → B ») : un logigramme dessiné avec
  des formes et des connecteurs n'existe que sous cette forme ;
- les images intégrées (captures, logigrammes collés), envoyées telles quelles.
"""
import io
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

MAX_IMAGES = 12
MIN_IMAGE_BYTES = 6_000          # ignore icônes et puces graphiques
MAX_TEXT_CHARS = 150_000

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# Fichiers lus comme du texte : tableaux exportés, notes, et code (COBOL, SQL, Java…) — une
# cartographie ou un existant applicatif arrive souvent sous ces formes
TEXT_EXTENSIONS = (".csv", ".tsv", ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".html", ".htm", ".bpmn", ".dot",
                   ".sql", ".cbl", ".cob", ".cpy", ".jcl", ".pli", ".pl1", ".rpg", ".rpgle", ".abap", ".java", ".py",
                   ".js", ".ts", ".cs", ".vb", ".bas", ".pls", ".pks", ".pkb", ".sh", ".bat", ".ps1", ".ini", ".properties")
# Types extraits à la réception (contenu dans f["office"]), envoyés au modèle comme texte (+ images)
EXTRACTED_TYPES = ("docx", "pptx", "xlsx", "texte")
MAX_SHEET_ROWS = 2000
LABELS = {"docx": "document Word", "pptx": "présentation PowerPoint", "xlsx": "classeur Excel", "texte": "fichier texte"}


def office_type(filename: str, content_type: str = "") -> str | None:
    name, ctype = (filename or "").lower(), (content_type or "").lower()
    if name.endswith(".docx") or ctype == DOCX_MIME:
        return "docx"
    if name.endswith(".pptx") or ctype == PPTX_MIME:
        return "pptx"
    if name.endswith((".xlsx", ".xlsm")) or ctype == XLSX_MIME:
        return "xlsx"
    if name.endswith(TEXT_EXTENSIONS) or ctype.startswith("text/"):
        return "texte"
    return None


def _md_table(rows: List[List[str]]) -> str:
    rows = [[(c or "").replace("\n", " ").replace("|", "/").strip() for c in r] for r in rows if any((c or "").strip() for c in r)]
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines)


def _extract_docx(data: bytes) -> Dict[str, Any]:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(io.BytesIO(data))
    out: List[str] = []
    body = doc.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            if style.lower().startswith(("heading", "titre")):
                level = "".join(ch for ch in style if ch.isdigit()) or "1"
                out.append("#" * min(int(level) + 1, 4) + " " + text)
            elif "list" in style.lower() or "liste" in style.lower():
                out.append("- " + text)
            else:
                out.append(text)
        elif tag == "tbl":
            table = Table(child, doc)
            md = _md_table([[cell.text for cell in row.cells] for row in table.rows])
            if md:
                out.append(md)
    images = []
    for rel in doc.part.rels.values():
        if "image" in rel.reltype:
            try:
                blob = rel.target_part.blob
                if len(blob) >= MIN_IMAGE_BYTES:
                    images.append(blob)
            except Exception:
                continue
    return {"text": "\n\n".join(out), "images": images[:MAX_IMAGES], "connections": 0}


def _extract_pptx(data: bytes) -> Dict[str, Any]:
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(io.BytesIO(data))
    out: List[str] = []
    images: List[bytes] = []
    total_links = 0
    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

    def walk(shapes):
        for sh in shapes:
            if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
                yield from walk(sh.shapes)
            else:
                yield sh

    for idx, slide in enumerate(prs.slides, 1):
        shapes = list(walk(slide.shapes))
        title = slide.shapes.title.text.strip() if slide.shapes.title is not None and slide.shapes.title.has_text_frame else ""
        out.append(f"## Diapositive {idx}" + (f" : {title}" if title else ""))
        text_by_id: Dict[int, str] = {}
        ordered = sorted(shapes, key=lambda s: ((s.top or 0) // 200_000, s.left or 0))  # lecture haut → bas, gauche → droite
        for sh in ordered:
            if sh.has_text_frame and sh.text_frame.text.strip():
                text = " ".join(sh.text_frame.text.split())
                text_by_id[sh.shape_id] = text
                if text != title:
                    out.append("- " + text)
            if getattr(sh, "has_table", False) and sh.has_table:
                md = _md_table([[c.text for c in r.cells] for r in sh.table.rows])
                if md:
                    out.append(md)
            if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    blob = sh.image.blob
                    if len(blob) >= MIN_IMAGE_BYTES:
                        images.append(blob)
                except Exception:
                    pass
        # Connecteurs : début/fin rattachés à des formes → enchaînement du logigramme
        links = []
        for sh in shapes:
            el = sh._element
            if el.tag.rsplit("}", 1)[-1] != "cxnSp":
                continue
            st, en = el.find(f".//{ns}stCxn"), el.find(f".//{ns}endCxn")
            if st is None or en is None:
                continue
            a, b = text_by_id.get(int(st.get("id", -1))), text_by_id.get(int(en.get("id", -1)))
            label = " ".join(sh.text_frame.text.split()) if sh.has_text_frame and sh.text_frame.text.strip() else ""
            if a and b:
                links.append(f"- {a} → {b}" + (f" [{label}]" if label else ""))
        if links:
            total_links += len(links)
            out.append("Enchaînements (flèches du schéma) :")
            out.extend(links)
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                out.append("Notes : " + " ".join(notes.split()))
    return {"text": "\n".join(out), "images": images[:MAX_IMAGES], "connections": total_links}


def _extract_xlsx(data: bytes) -> Dict[str, Any]:
    """Chaque feuille en tableau Markdown (valeurs calculées, lignes vides ignorées)."""
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        rows = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i >= MAX_SHEET_ROWS:
                rows.append([f"… (feuille tronquée à {MAX_SHEET_ROWS} lignes)"])
                break
            rows.append(["" if v is None else str(v) for v in row])
        table = _md_table(rows)
        if table:
            out.append(f"## Feuille « {ws.title} »\n{table}")
    wb.close()
    return {"text": "\n\n".join(out), "images": [], "connections": 0}


def _extract_text(data: bytes) -> Dict[str, Any]:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return {"text": data.decode(enc), "images": [], "connections": 0}
        except UnicodeDecodeError:
            continue
    return {"text": data.decode("utf-8", "replace"), "images": [], "connections": 0}


def extract_office(data: bytes, kind: str) -> Dict[str, Any]:
    """{text, images, connections, has_diagram} ; lève ValueError si le fichier est illisible."""
    try:
        res = {"docx": _extract_docx, "pptx": _extract_pptx, "xlsx": _extract_xlsx, "texte": _extract_text}[kind](data)
    except Exception as e:
        raise ValueError(f"Fichier {kind.upper()} illisible : {e}")
    res["text"] = res["text"][:MAX_TEXT_CHARS]
    res["has_diagram"] = bool(res["images"]) or res["connections"] > 0
    return res


def to_sendable(img):
    """Image dans un mode que le client Gemini sait convertir en PNG. Les images CMJN (impression),
    16 bits ou à palette faisaient échouer tout le tour (« cannot write mode CMYK as PNG »)."""
    if img.mode in ("RGB", "RGBA", "L", "LA"):
        return img
    if img.mode == "P" and "transparency" in img.info:
        return img.convert("RGBA")
    return img.convert("RGB")


def office_parts(f: Dict[str, Any]) -> list:
    """Parts Gemini d'un fichier Office déjà extrait (f['office'])."""
    office = f.get("office") or {}
    label = LABELS.get(f.get("type"), "document")
    parts: list = [f"=== Contenu extrait du {label} « {f.get('filename')} » ===\n{office.get('text') or '(aucun texte)'}"]
    if office.get("images"):
        from PIL import Image
        parts.append(f"Images intégrées dans « {f.get('filename')} » ({len(office['images'])}) :")
        for blob in office["images"]:
            try:
                img = Image.open(io.BytesIO(blob))
                img.load()
                if max(img.size) > 1024:
                    img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                parts.append(to_sendable(img))
            except Exception:
                continue
    return parts
