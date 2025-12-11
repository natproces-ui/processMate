"""
cobol_parser.py - Version refactorée
Génère un AST sémantique structuré, pas un dump syntaxique
"""

import json
from typing import Dict, Any
from parsers.data_division_parser import DataDivisionParser
from parsers.procedure_division_parser import ProcedureDivisionParser
from parsers.ast_builder import ASTBuilder


class COBOLParser:
    """Parser COBOL orienté logique métier"""
    
    def __init__(self, code: str):
        self.code = code
        self.lines = code.split('\n')
        self.has_line_nums = self._detect_line_numbers()
        
    def _detect_line_numbers(self) -> bool:
        """Détecte les numéros de ligne"""
        if not self.lines:
            return False
        return bool(len(self.lines[0]) >= 6 and self.lines[0][:6].isdigit())
    
    def parse(self) -> Dict[str, Any]:
        """Parse et génère un AST sémantique structuré"""
        
        # 1. Parsing syntaxique brut (existant)
        raw_ast = self._parse_raw()
        
        # 2. Construction de l'AST sémantique
        builder = ASTBuilder()
        semantic_ast = builder.build_ast(raw_ast)
        
        return semantic_ast
    
    def _parse_raw(self) -> Dict[str, Any]:
        """Parse brut (utilise les parsers existants)"""
        raw_ast = {
            "identification_division": self._parse_identification(),
            "data_division": None,
            "procedure_division": None
        }
        
        # Data Division
        data_parser = DataDivisionParser(self.lines, self.has_line_nums)
        raw_ast["data_division"] = data_parser.parse()
        
        # Procedure Division
        proc_parser = ProcedureDivisionParser(self.lines, self.has_line_nums)
        raw_ast["procedure_division"] = proc_parser.parse()
        
        return raw_ast
    
    def _parse_identification(self) -> Dict:
        """Parse IDENTIFICATION DIVISION (simplifié)"""
        division = {"program_id": None}
        
        for line in self.lines[:100]:  # Chercher dans les 100 premières lignes
            clean = line[6:].strip() if self.has_line_nums else line.strip()
            
            if "PROGRAM-ID" in clean:
                parts = clean.split("PROGRAM-ID.")
                if len(parts) > 1:
                    division["program_id"] = parts[1].strip().rstrip('.')
                    break
        
        return division


def parse_cobol_file(filename: str) -> Dict[str, Any]:
    """Parse un fichier COBOL"""
    with open(filename, 'r', encoding='utf-8') as f:
        code = f.read()
    
    parser = COBOLParser(code)
    ast = parser.parse()
    return ast


def parse_cobol_code(code: str) -> Dict[str, Any]:
    """Parse du code COBOL"""
    parser = COBOLParser(code)
    ast = parser.parse()
    return ast


# Example d'utilisation
if __name__ == "__main__":
    sample_code = """000100 IDENTIFICATION DIVISION.
000200 PROGRAM-ID. ESCAL130.
001900 DATA DIVISION.
002000 WORKING-STORAGE SECTION.
002100 01  BASE-PAYMENT-RATE      PIC 9(04)V9(02) VALUE 145.20.
002200 01  DRUG-ADDON             PIC 9(01)V9(04) VALUE 1.1400.
004800 PROCEDURE DIVISION.
005000 0000-START-TO-FINISH.
005100     PERFORM 1000-VALIDATE.
005200     IF PPS-RTC = 00 THEN
005300        PERFORM 2000-CALCULATE
005400     END-IF.
005500     GOBACK.
005600
005700 1000-VALIDATE.
005800     IF B-PATIENT-WGT = 0 THEN
005900        MOVE 55 TO PPS-RTC
006000     END-IF.
006100
006200 2000-CALCULATE.
006300     COMPUTE H-PAYMENT ROUNDED = BASE-PAYMENT-RATE * DRUG-ADDON."""
    
    ast = parse_cobol_code(sample_code)
    print(json.dumps(ast, indent=2))