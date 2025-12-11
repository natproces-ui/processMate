"""
procedure_division_parser.py
Parser spécialisé pour la PROCEDURE DIVISION
Gère : USING clause, paragraphes, statements
"""

import re
from typing import Dict, List, Any, Optional, Tuple


class ProcedureDivisionParser:
    """Parser spécialisé pour PROCEDURE DIVISION"""
    
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
        """Trouve les bornes de PROCEDURE DIVISION"""
        start_idx = -1
        end_idx = len(self.lines)
        
        for i, line in enumerate(self.lines):
            _, content = self._clean_line(line)
            
            if re.search(r'PROCEDURE\s+DIVISION', content, re.IGNORECASE):
                start_idx = i
                break
        
        return start_idx, end_idx
    
    def parse(self) -> Optional[Dict[str, Any]]:
        """Parse la PROCEDURE DIVISION complète"""
        start, end = self._find_division_bounds()
        if start == -1:
            return None
        
        division = {
            "type": "ProcedureDivision",
            "using_clause": None,
            "paragraphs": []
        }
        
        # Parser USING clause (peut être multi-lignes)
        division["using_clause"], proc_start = self._parse_using_clause(start, end)
        
        # Parser les paragraphes à partir de proc_start
        division["paragraphs"] = self._parse_paragraphs(proc_start, end)
        
        return division
    
    def _parse_using_clause(self, start: int, end: int) -> Tuple[Optional[List[str]], int]:
        """
        Parse la clause USING qui peut s'étendre sur plusieurs lignes
        Returns: (liste des paramètres, index de début des paragraphes)
        """
        i = start
        using_line = ""
        proc_start = start + 1
        
        # Chercher PROCEDURE DIVISION et accumuler jusqu'au point
        while i < min(start + 20, end):
            _, content = self._clean_line(self.lines[i])
            
            if not content.strip() or self._is_comment(content):
                i += 1
                continue
            
            if 'PROCEDURE' in content.upper() and 'DIVISION' in content.upper():
                using_line = content
                proc_start = i + 1
                
                # Continuer à accumuler si pas de point
                j = i + 1
                while j < end and not using_line.rstrip().endswith('.'):
                    _, next_content = self._clean_line(self.lines[j])
                    if next_content.strip() and not self._is_comment(next_content):
                        using_line += " " + next_content.strip()
                        proc_start = j + 1
                    j += 1
                break
            i += 1
        
        if not using_line:
            return None, start + 1
        
        # Extraire USING
        using_match = re.search(r'USING\s+(.+?)\.', using_line, re.IGNORECASE)
        if using_match:
            params_str = using_match.group(1)
            # Split par whitespace/newline
            params = [p.strip() for p in re.split(r'\s+', params_str) if p.strip()]
            return params, proc_start
        
        return None, proc_start
    
    def _parse_paragraphs(self, start: int, end: int) -> List[Dict]:
        """Parse tous les paragraphes"""
        paragraphs = []
        current_paragraph = None
        i = start
        
        while i < end:
            line_num, content = self._clean_line(self.lines[i])
            
            if not content.strip():
                i += 1
                continue
            
            if self._is_comment(content):
                i += 1
                continue
            
            # Détection paragraphe : NNNN-NAME. ou NAME.
            # Critère : ligne se terminant par un point, pas de verbe COBOL
            para_match = re.match(r'^([0-9]{4}-[A-Z0-9\-]+|[A-Z][A-Z0-9\-]*)\.$', 
                                 content.strip(), re.IGNORECASE)
            
            if para_match:
                # Sauvegarder le paragraphe précédent
                if current_paragraph:
                    paragraphs.append(current_paragraph)
                
                # Nouveau paragraphe
                para_name = para_match.group(1).rstrip('.')
                current_paragraph = {
                    "type": "Paragraph",
                    "name": para_name,
                    "line_number": line_num,
                    "statements": []
                }
                i += 1
                continue
            
            # Parse statement dans le paragraphe
            if current_paragraph:
                statement, lines_consumed = self._parse_statement_multiline(i, end)
                if statement:
                    current_paragraph["statements"].append(statement)
                i += lines_consumed
            else:
                i += 1
        
        # Sauvegarder le dernier paragraphe
        if current_paragraph:
            paragraphs.append(current_paragraph)
        
        return paragraphs
    
    def _parse_statement_multiline(self, start_idx: int, end_idx: int) -> Tuple[Optional[Dict], int]:
        """Parse un statement qui peut s'étendre sur plusieurs lignes"""
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
            
            # Arrêter si on trouve un nouveau paragraphe
            if re.match(r'^[0-9]{4}-[A-Z0-9\-]+\.$', content.strip(), re.IGNORECASE):
                break
            
            accumulated += " " + content.strip()
            lines_consumed += 1
            idx += 1
            
            # Arrêter sur point, END-IF, END-PERFORM, ELSE
            if content.rstrip().endswith('.') or \
               content.strip().upper() in ['END-IF', 'END-PERFORM', 'ELSE']:
                break
        
        accumulated = accumulated.strip()
        if not accumulated:
            return None, max(1, lines_consumed)
        
        # Parser le statement
        statement = self._parse_statement(accumulated, line_num_start)
        return statement, max(1, lines_consumed)
    
    def _parse_statement(self, line: str, line_num: str) -> Optional[Dict]:
        """Parse un statement COBOL complet"""
        line_upper = line.upper().lstrip()
        
        # Mapper les types de statements
        if line_upper.startswith('PERFORM'):
            return self._parse_perform(line, line_num)
        elif line_upper.startswith('IF '):
            return self._parse_if(line, line_num)
        elif line_upper.startswith('ELSE'):
            return {"type": "Else", "line_number": line_num}
        elif line_upper.startswith('END-IF'):
            return {"type": "EndIf", "line_number": line_num}
        elif line_upper.startswith('COMPUTE'):
            return self._parse_compute(line, line_num)
        elif line_upper.startswith('MOVE'):
            return self._parse_move(line, line_num)
        elif line_upper.startswith('INITIALIZE'):
            return self._parse_initialize(line, line_num)
        elif line_upper.startswith('CALL'):
            return self._parse_call(line, line_num)
        elif re.match(r'^(GOBACK|STOP\s+RUN|EXIT)', line_upper):
            return {
                "type": "Exit",
                "keyword": line_upper.split()[0],
                "line_number": line_num
            }
        elif line_upper.startswith('DISPLAY'):
            return self._parse_display(line, line_num)
        elif line_upper.startswith('ACCEPT'):
            match = re.search(r'ACCEPT\s+(.+)', line, re.IGNORECASE)
            return {
                "type": "Accept",
                "variable": match.group(1).rstrip('.') if match else None,
                "line_number": line_num
            }
        elif re.match(r'^(ADD|SUBTRACT|MULTIPLY|DIVIDE)', line_upper):
            return self._parse_arithmetic(line, line_num)
        elif line_upper.startswith('COPY'):
            match = re.search(r'COPY\s+([A-Z0-9\-]+)', line, re.IGNORECASE)
            return {
                "type": "Copy",
                "copybook": match.group(1) if match else None,
                "line_number": line_num
            }
        elif 'NEXT SENTENCE' in line_upper:
            return {"type": "NextSentence", "line_number": line_num}
        else:
            # Statement générique
            keyword = line.split()[0].upper() if line.split() else "UNKNOWN"
            return {
                "type": "Statement",
                "keyword": keyword,
                "content": line.rstrip('.'),
                "line_number": line_num
            }
    
    # Les méthodes _parse_perform, _parse_if, etc. suivent...
    # (Identiques à la version précédente mais nettoyées)
    
    def _parse_perform(self, line: str, line_num: str) -> Dict:
        """Parse PERFORM"""
        perform = {
            "type": "Perform",
            "target": None,
            "varying": None,
            "from_value": None,
            "by_value": None,
            "until_condition": None,
            "times": None,
            "line_number": line_num
        }
        
        target_match = re.search(r'PERFORM\s+([A-Z0-9\-]+)', line, re.IGNORECASE)
        if target_match:
            perform["target"] = target_match.group(1)
        
        varying_match = re.search(r'VARYING\s+([A-Z0-9\-]+)\s+FROM\s+(.+?)\s+BY\s+(.+?)\s+UNTIL', 
                                 line, re.IGNORECASE)
        if varying_match:
            perform["varying"] = varying_match.group(1)
            perform["from_value"] = varying_match.group(2).strip()
            perform["by_value"] = varying_match.group(3).strip()
        
        until_match = re.search(r'UNTIL\s+(.+?)(?:\.|$)', line, re.IGNORECASE)
        if until_match:
            perform["until_condition"] = until_match.group(1).strip()
        
        times_match = re.search(r'PERFORM\s+(\d+)\s+TIMES', line, re.IGNORECASE)
        if times_match:
            perform["times"] = int(times_match.group(1))
        
        return perform
    
    def _parse_if(self, line: str, line_num: str) -> Dict:
        """Parse IF"""
        match = re.search(r'IF\s+(.+?)(?:\s+THEN|$)', line, re.IGNORECASE)
        condition = match.group(1).strip() if match else line[2:].strip()
        
        return {
            "type": "If",
            "condition": condition.rstrip('.'),
            "line_number": line_num
        }
    
    def _parse_compute(self, line: str, line_num: str) -> Dict:
        """Parse COMPUTE"""
        match = re.search(r'COMPUTE\s+([A-Z0-9\-]+)\s*(ROUNDED)?\s*=\s*(.+)', 
                         line, re.IGNORECASE)
        
        if match:
            return {
                "type": "Compute",
                "target": match.group(1),
                "rounded": match.group(2) is not None,
                "expression": match.group(3).rstrip('.'),
                "line_number": line_num
            }
        
        return {
            "type": "Compute",
            "target": None,
            "rounded": False,
            "expression": None,
            "line_number": line_num
        }
    
    def _parse_move(self, line: str, line_num: str) -> Dict:
        """Parse MOVE"""
        match = re.search(r'MOVE\s+(.+?)\s+TO\s+(.+)', line, re.IGNORECASE)
        
        if match:
            source = match.group(1).strip()
            targets_str = match.group(2).rstrip('.')
            targets = [t.strip() for t in re.split(r'\s+', targets_str) if t.strip()]
            
            return {
                "type": "Move",
                "source": source,
                "targets": targets,
                "line_number": line_num
            }
        
        return {
            "type": "Move",
            "source": None,
            "targets": [],
            "line_number": line_num
        }
    
    def _parse_initialize(self, line: str, line_num: str) -> Dict:
        """Parse INITIALIZE"""
        match = re.search(r'INITIALIZE\s+(.+)', line, re.IGNORECASE)
        targets = []
        
        if match:
            targets_str = match.group(1).rstrip('.')
            targets = [t.strip() for t in targets_str.split() if t.strip()]
        
        return {
            "type": "Initialize",
            "targets": targets,
            "line_number": line_num
        }
    
    def _parse_call(self, line: str, line_num: str) -> Dict:
        """Parse CALL"""
        match = re.search(r'CALL\s+["\']([^"\']+)["\']', line, re.IGNORECASE)
        
        call = {
            "type": "Call",
            "program": match.group(1) if match else None,
            "using": [],
            "line_number": line_num
        }
        
        using_match = re.search(r'USING\s+(.+)', line, re.IGNORECASE)
        if using_match:
            params = using_match.group(1).rstrip('.').split()
            call["using"] = params
        
        return call
    
    def _parse_display(self, line: str, line_num: str) -> Dict:
        """Parse DISPLAY"""
        match = re.search(r'DISPLAY\s+(.+)', line, re.IGNORECASE)
        
        return {
            "type": "Display",
            "items": match.group(1).rstrip('.').split() if match else [],
            "line_number": line_num
        }
    
    def _parse_arithmetic(self, line: str, line_num: str) -> Dict:
        """Parse arithmétique"""
        keyword = line.split()[0].upper()
        
        patterns = {
            "ADD": r'ADD\s+(.+?)\s+TO\s+(.+)',
            "SUBTRACT": r'SUBTRACT\s+(.+?)\s+FROM\s+(.+)',
            "MULTIPLY": r'MULTIPLY\s+(.+?)\s+BY\s+(.+)',
            "DIVIDE": r'DIVIDE\s+(.+?)\s+(?:INTO|BY)\s+(.+)'
        }
        
        if keyword in patterns:
            match = re.search(patterns[keyword], line, re.IGNORECASE)
            if match:
                operand2 = match.group(2).rstrip('.')
                rounded = 'ROUNDED' in operand2.upper()
                giving = None
                
                giving_match = re.search(r'GIVING\s+([A-Z0-9\-]+)', operand2, re.IGNORECASE)
                if giving_match:
                    giving = giving_match.group(1)
                    operand2 = re.sub(r'GIVING\s+[A-Z0-9\-]+', '', operand2, flags=re.IGNORECASE).strip()
                
                operand2 = re.sub(r'ROUNDED', '', operand2, flags=re.IGNORECASE).strip()
                
                return {
                    "type": "Arithmetic",
                    "operation": keyword,
                    "operand1": match.group(1).strip(),
                    "operand2": operand2,
                    "rounded": rounded,
                    "giving": giving,
                    "line_number": line_num
                }
        
        return {
            "type": "Arithmetic",
            "operation": keyword,
            "operand1": None,
            "operand2": None,
            "rounded": False,
            "giving": None,
            "line_number": line_num
        }
