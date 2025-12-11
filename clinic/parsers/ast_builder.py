"""
ast_builder.py
Construit un AST sémantique structuré pour COBOL
Focus sur la LOGIQUE MÉTIER, pas sur la syntaxe littérale
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field


@dataclass
class Variable:
    """Représente une variable COBOL avec sa structure hiérarchique"""
    name: str
    level: int
    picture: Optional[str] = None
    value: Any = None
    occurs: Optional[int] = None
    children: List['Variable'] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        result = {
            "name": self.name,
            "level": self.level
        }
        if self.picture:
            result["type"] = self._infer_type()
        if self.value is not None:
            result["value"] = self.value
        if self.occurs:
            result["array_size"] = self.occurs
        if self.children:
            result["fields"] = [c.to_dict() for c in self.children]
        return result
    
    def _infer_type(self) -> str:
        """Infère le type à partir du PICTURE"""
        if not self.picture:
            return "group"
        pic = self.picture.upper()
        if '9' in pic:
            return "decimal" if 'V' in pic else "integer"
        if 'X' in pic:
            return "string"
        return "unknown"


@dataclass
class ControlFlow:
    """Représente une structure de contrôle (IF, PERFORM, etc.)"""
    type: str  # "if", "perform", "loop", "compute"
    condition: Optional[str] = None
    then_block: List['ControlFlow'] = field(default_factory=list)
    else_block: List['ControlFlow'] = field(default_factory=list)
    target: Optional[str] = None  # Pour PERFORM
    expression: Optional[str] = None  # Pour COMPUTE
    
    def to_dict(self) -> Dict:
        result = {"type": self.type}
        
        if self.condition:
            result["condition"] = self.condition
        
        if self.then_block:
            result["then"] = [b.to_dict() for b in self.then_block]
        
        if self.else_block:
            result["else"] = [b.to_dict() for b in self.else_block]
        
        if self.target:
            result["target"] = self.target
        
        if self.expression:
            result["expression"] = self.expression
        
        return result


@dataclass
class Paragraph:
    """Représente un paragraphe COBOL avec son flux de contrôle"""
    name: str
    statements: List[ControlFlow] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "logic": [s.to_dict() for s in self.statements]
        }


class ASTBuilder:
    """Construit l'AST sémantique final"""
    
    def __init__(self):
        self.variables = {}
        self.paragraphs = []
        self.constants = {}
        
    def build_ast(self, raw_ast: Dict) -> Dict:
        """Transforme le parsing brut en AST sémantique"""
        
        # 1. Extraire les variables importantes
        if raw_ast.get("data_division"):
            self._extract_variables(raw_ast["data_division"])
        
        # 2. Reconstruire les paragraphes avec logique
        if raw_ast.get("procedure_division"):
            self._extract_paragraphs(raw_ast["procedure_division"])
        
        # 3. Construire l'AST final
        return {
            "program": raw_ast["identification_division"]["program_id"],
            "version": self._extract_version(raw_ast),
            "constants": self.constants,
            "data_structures": self._build_data_structures(),
            "procedures": [p.to_dict() for p in self.paragraphs],
            "business_logic": self._extract_business_logic()
        }
    
    def _extract_variables(self, data_div: Dict):
        """Extrait les variables significatives (pas les FILLER)"""
        working_storage = data_div.get("working_storage_section", [])
        
        for item in working_storage:
            if not item.get("is_filler"):
                var = Variable(
                    name=item["name"],
                    level=item["level"],
                    picture=item.get("picture"),
                    value=item.get("value"),
                    occurs=item.get("occurs")
                )
                
                # Stocker les constantes séparément
                if item.get("value") is not None and item["level"] == 1:
                    self.constants[item["name"]] = item["value"]
                else:
                    self.variables[item["name"]] = var
    
    def _extract_paragraphs(self, proc_div: Dict):
        """Extrait les paragraphes avec leur logique structurée"""
        paragraphs = proc_div.get("paragraphs", [])
        
        for para in paragraphs:
            # Ignorer les paragraphes vides ou génériques
            if not para.get("statements") or self._is_generic_paragraph(para["name"]):
                continue
            
            paragraph = Paragraph(name=para["name"])
            
            # Reconstruire le flux de contrôle
            statements = para["statements"]
            i = 0
            while i < len(statements):
                flow, consumed = self._build_control_flow(statements, i)
                if flow:
                    paragraph.statements.append(flow)
                i += consumed if consumed > 0 else 1
            
            self.paragraphs.append(paragraph)
    
    def _build_control_flow(self, statements: List[Dict], start: int) -> tuple:
        """Reconstruit une structure de contrôle à partir des statements"""
        stmt = statements[start]
        stmt_type = stmt.get("type")
        
        # IF statement
        if stmt_type == "If":
            return self._build_if_block(statements, start)
        
        # PERFORM statement
        elif stmt_type == "Perform":
            flow = ControlFlow(
                type="call",
                target=stmt.get("target"),
                condition=stmt.get("until_condition")
            )
            return flow, 1
        
        # COMPUTE statement
        elif stmt_type == "Compute":
            flow = ControlFlow(
                type="compute",
                target=stmt.get("target"),
                expression=stmt.get("expression")
            )
            return flow, 1
        
        # MOVE statement
        elif stmt_type == "Move":
            flow = ControlFlow(
                type="assign",
                expression=f"{stmt.get('source')} → {', '.join(stmt.get('targets', []))}"
            )
            return flow, 1
        
        # Initialize
        elif stmt_type == "Initialize":
            flow = ControlFlow(
                type="initialize",
                target=", ".join(stmt.get("targets", []))
            )
            return flow, 1
        
        # Exit/Return
        elif stmt_type == "Exit":
            flow = ControlFlow(type="return")
            return flow, 1
        
        return None, 1
    
    def _build_if_block(self, statements: List[Dict], start: int) -> tuple:
        """Reconstruit un bloc IF/THEN/ELSE complet"""
        if_stmt = statements[start]
        flow = ControlFlow(
            type="if",
            condition=if_stmt.get("condition")
        )
        
        i = start + 1
        in_else = False
        
        while i < len(statements):
            stmt = statements[i]
            
            if stmt.get("type") == "EndIf":
                return flow, i - start + 1
            
            elif stmt.get("type") == "Else":
                in_else = True
                i += 1
                continue
            
            # Construire récursivement
            sub_flow, consumed = self._build_control_flow(statements, i)
            if sub_flow:
                if in_else:
                    flow.else_block.append(sub_flow)
                else:
                    flow.then_block.append(sub_flow)
            
            i += consumed if consumed > 0 else 1
        
        return flow, i - start
    
    def _build_data_structures(self) -> List[Dict]:
        """Construit les structures de données importantes"""
        structures = []
        
        # Grouper par famille (HOLD-*, H-*, etc.)
        for name, var in self.variables.items():
            if var.level == 1:
                structures.append(var.to_dict())
        
        return structures
    
    def _extract_business_logic(self) -> Dict:
        """Extrait la logique métier du programme"""
        return {
            "main_flow": self._identify_main_flow(),
            "calculations": self._identify_calculations(),
            "validations": self._identify_validations()
        }
    
    def _identify_main_flow(self) -> List[str]:
        """Identifie le flux principal d'exécution"""
        main_paragraphs = []
        
        # Chercher le point d'entrée (0000-*, MAIN, etc.)
        for para in self.paragraphs:
            if para.name.startswith("0000") or "MAIN" in para.name or "START" in para.name:
                main_paragraphs.append(para.name)
        
        return main_paragraphs
    
    def _identify_calculations(self) -> List[str]:
        """Identifie les paragraphes de calcul"""
        calc_paragraphs = []
        
        for para in self.paragraphs:
            # Heuristique : nom contient CALC, COMPUTE, etc.
            if any(kw in para.name for kw in ["CALC", "COMPUTE", "BUNDLED", "RATE"]):
                calc_paragraphs.append(para.name)
        
        return calc_paragraphs
    
    def _identify_validations(self) -> List[str]:
        """Identifie les paragraphes de validation"""
        valid_paragraphs = []
        
        for para in self.paragraphs:
            if any(kw in para.name for kw in ["VALIDATE", "CHECK", "EDIT"]):
                valid_paragraphs.append(para.name)
        
        return valid_paragraphs
    
    def _is_generic_paragraph(self, name: str) -> bool:
        """Vérifie si un paragraphe est générique (DATE-COMPILED, etc.)"""
        generic_names = ["DATE-COMPILED", "FILE-CONTROL", "GOBACK"]
        return any(g in name for g in generic_names)
    
    def _extract_version(self, raw_ast: Dict) -> str:
        """Extrait la version du programme"""
        for item in raw_ast.get("data_division", {}).get("working_storage_section", []):
            if item.get("name") == "CAL-VERSION":
                return item.get("value", "unknown")
        return "unknown"