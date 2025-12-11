"""
data_division_parser.py
Parser spécialisé pour la DATA DIVISION
Gère : FILE SECTION, WORKING-STORAGE SECTION, LINKAGE SECTION
"""

import re
from typing import Dict, List, Any, Optional, Tuple


class DataDivisionParser:
    """Parser spécialisé pour DATA DIVISION"""
    
    def __init__(self, lines: List[str], has_line_nums: bool):
        self.lines = lines
        self.has_line_nums = has_line_nums
        
    def _clean_line(self, line: str) -> Tuple[str, str]:
        """Nettoie une ligne"""
        if self.has_line_nums and len(line) >= 6:
            return line[:6].strip(), line[6:].rstrip()
        return "", line.rstrip()
    
    def _is_comment(self, content: str) -> bool:
        """Vérifie si c'est un commentaire"""
        stripped = content.lstrip()
        return stripped.startswith('*') or stripped.startswith('/')
    
    def _find_division_bounds(self) -> Tuple[int, int]:
        """Trouve les bornes de DATA DIVISION"""
        start_idx = -1
        end_idx = len(self.lines)
        
        for i, line in enumerate(self.lines):
            _, content = self._clean_line(line)
            
            if re.search(r'DATA\s+DIVISION', content, re.IGNORECASE):
                start_idx = i
            elif start_idx != -1 and re.search(r'PROCEDURE\s+DIVISION', content, re.IGNORECASE):
                end_idx = i
                break
        
        return start_idx, end_idx
    
    def parse(self) -> Optional[Dict[str, Any]]:
        """Parse la DATA DIVISION complète"""
        start, end = self._find_division_bounds()
        if start == -1:
            return None
        
        division = {
            "type": "DataDivision",
            "file_section": None,
            "working_storage_section": None,
            "linkage_section": None
        }
        
        current_section = None
        section_items = []
        i = start + 1
        
        while i < end:
            line_num, content = self._clean_line(self.lines[i])
            
            if not content.strip():
                i += 1
                continue
            
            # Détection des sections
            if re.search(r'FILE\s+SECTION', content, re.IGNORECASE):
                if current_section and section_items:
                    division[f"{current_section}_section"] = self._build_hierarchy(section_items)
                current_section = "file"
                section_items = []
                i += 1
                continue
                
            elif re.search(r'WORKING-STORAGE\s+SECTION', content, re.IGNORECASE):
                if current_section and section_items:
                    division[f"{current_section}_section"] = self._build_hierarchy(section_items)
                current_section = "working_storage"
                section_items = []
                i += 1
                continue
                
            elif re.search(r'LINKAGE\s+SECTION', content, re.IGNORECASE):
                if current_section and section_items:
                    division[f"{current_section}_section"] = self._build_hierarchy(section_items)
                current_section = "linkage"
                section_items = []
                i += 1
                continue
            
            # Skip commentaires
            if self._is_comment(content):
                i += 1
                continue
            
            # Parse data item (peut être multi-lignes)
            if current_section:
                data_item, lines_consumed = self._parse_data_item_multiline(i, end)
                if data_item:
                    section_items.append(data_item)
                i += lines_consumed
            else:
                i += 1
        
        # Traiter la dernière section
        if current_section and section_items:
            division[f"{current_section}_section"] = self._build_hierarchy(section_items)
        
        return division
    
    def _parse_data_item_multiline(self, start_idx: int, end_idx: int) -> Tuple[Optional[Dict], int]:
        """Parse un data item qui peut s'étendre sur plusieurs lignes"""
        accumulated = ""
        line_num_start = ""
        lines_consumed = 0
        
        idx = start_idx
        while idx < end_idx:
            line_num, content = self._clean_line(self.lines[idx])
            
            if not line_num_start:
                line_num_start = line_num
            
            if not content.strip() or self._is_comment(content):
                idx += 1
                lines_consumed += 1
                continue
            
            # Arrêter si on trouve un nouveau niveau
            if accumulated and re.match(r'^\s*\d{2}\s+', content):
                break
            
            accumulated += " " + content.strip()
            lines_consumed += 1
            idx += 1
            
            # Si on a un point, la déclaration est terminée
            if content.rstrip().endswith('.'):
                break
        
        accumulated = accumulated.strip()
        if not accumulated:
            return None, max(1, lines_consumed)
        
        # Parser l'item accumulé
        item = self._parse_data_item(accumulated, line_num_start)
        return item, max(1, lines_consumed)
    
    def _parse_data_item(self, line: str, line_num: str) -> Optional[Dict[str, Any]]:
        """Parse une déclaration de donnée complète"""
        # Pattern pour niveau + nom
        match = re.match(r'^\s*(\d{2})\s+([A-Z0-9\-]+)(\s+.*)?', line, re.IGNORECASE)
        if not match:
            return None
        
        level = match.group(1)
        name = match.group(2)
        rest = match.group(3).strip() if match.group(3) else ""
        
        item = {
            "type": "DataItem",
            "level": int(level),
            "name": name,
            "picture": None,
            "usage": None,
            "value": None,
            "occurs": None,
            "indexed_by": None,
            "redefines": None,
            "is_filler": name.upper() == "FILLER",
            "children": []
        }
        
        # PIC/PICTURE
        pic_match = re.search(r'PIC(?:TURE)?\s+([^\s.]+)', rest, re.IGNORECASE)
        if pic_match:
            item["picture"] = pic_match.group(1)
        
        # USAGE
        usage_match = re.search(r'USAGE\s+(?:IS\s+)?([^\s.]+)', rest, re.IGNORECASE)
        if usage_match:
            item["usage"] = usage_match.group(1)
        
        # VALUE (extraire tout jusqu'au point ou fin)
        value_match = re.search(r'VALUE\s+(?:IS\s+)?(.+?)(?:\.|$)', rest, re.IGNORECASE)
        if value_match:
            value_str = value_match.group(1).strip().rstrip('.')
            item["value"] = self._parse_value(value_str)
        
        # OCCURS
        occurs_match = re.search(r'OCCURS\s+(\d+)(?:\s+TIMES)?', rest, re.IGNORECASE)
        if occurs_match:
            item["occurs"] = int(occurs_match.group(1))
        
        # INDEXED BY
        indexed_match = re.search(r'INDEXED\s+BY\s+([A-Z0-9\-]+)', rest, re.IGNORECASE)
        if indexed_match:
            item["indexed_by"] = indexed_match.group(1)
        
        # REDEFINES
        redefines_match = re.search(r'REDEFINES\s+([A-Z0-9\-]+)', rest, re.IGNORECASE)
        if redefines_match:
            item["redefines"] = redefines_match.group(1)
        
        return item
    
    def _parse_value(self, value_str: str) -> Any:
        """Parse une VALUE clause"""
        value_str = value_str.strip()
        
        # String entre quotes
        if (value_str.startswith("'") and value_str.endswith("'")) or \
           (value_str.startswith('"') and value_str.endswith('"')):
            return value_str[1:-1]
        
        # Nombre décimal
        try:
            if '.' in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            return value_str
    
    def _build_hierarchy(self, flat_items: List[Dict]) -> List[Dict]:
        """Construit la hiérarchie des data items"""
        if not flat_items:
            return []
        
        root = []
        stack = []
        
        for item in flat_items:
            level = item["level"]
            
            # Retirer du stack tous les éléments de niveau >= actuel
            while stack and stack[-1]["level"] >= level:
                stack.pop()
            
            # Ajouter comme enfant du parent ou à la racine
            if stack:
                parent = stack[-1]
                parent["children"].append(item)
            else:
                root.append(item)
            
            stack.append(item)
        
        return root