"""
control_flow_builder.py
Reconstruit les structures de contrôle COBOL imbriquées avec fidélité
Gère : IF-THEN-ELSE imbriqués, PERFORM-UNTIL, boucles complexes
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class CodeBlock:
    """Représente un bloc de code avec contexte"""
    type: str  # "if", "then", "else", "perform", "paragraph"
    level: int  # Niveau d'imbrication
    condition: Optional[str] = None
    statements: List[Any] = field(default_factory=list)
    children: List['CodeBlock'] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        result = {"type": self.type}
        if self.condition:
            result["condition"] = self.condition
        if self.statements:
            result["statements"] = [s if isinstance(s, dict) else str(s) for s in self.statements]
        if self.children:
            result["children"] = [c.to_dict() for c in self.children]
        return result


class ControlFlowBuilder:
    """Construit l'arbre des flux de contrôle"""
    
    def __init__(self):
        self.stack = []  # Stack des blocs ouverts
        self.root_blocks = []
        
    def build_flow(self, statements: List[Dict]) -> List[Dict]:
        """
        Construit l'arbre des flux à partir d'une liste plate de statements
        Retourne une structure hiérarchique fidèle au code COBOL
        """
        self.stack = []
        self.root_blocks = []
        
        i = 0
        while i < len(statements):
            stmt = statements[i]
            consumed = self._process_statement(stmt, statements, i)
            i += consumed
        
        # Fermer les blocs restants
        while self.stack:
            self._close_current_block()
        
        return [b.to_dict() for b in self.root_blocks]
    
    def _process_statement(self, stmt: Dict, all_stmts: List[Dict], idx: int) -> int:
        """
        Traite un statement et retourne le nombre de statements consommés
        """
        stmt_type = stmt.get("type")
        
        # IF : Ouvrir un nouveau bloc
        if stmt_type == "If":
            self._open_if_block(stmt)
            return 1
        
        # ELSE : Basculer du THEN au ELSE
        elif stmt_type == "Else":
            self._switch_to_else()
            return 1
        
        # END-IF : Fermer le bloc IF
        elif stmt_type == "EndIf":
            self._close_if_block()
            return 1
        
        # PERFORM avec VARYING : Ouvrir un bloc de boucle
        elif stmt_type == "Perform" and stmt.get("varying"):
            self._open_perform_block(stmt)
            return 1
        
        # END-PERFORM : Fermer le bloc PERFORM
        elif stmt_type == "EndPerform":
            self._close_perform_block()
            return 1
        
        # PERFORM simple (appel de paragraphe)
        elif stmt_type == "Perform":
            self._add_statement_to_current_block({
                "type": "call",
                "target": stmt.get("target"),
                "condition": stmt.get("until_condition")
            })
            return 1
        
        # COMPUTE
        elif stmt_type == "Compute":
            self._add_statement_to_current_block({
                "type": "compute",
                "target": stmt.get("target"),
                "expression": stmt.get("expression"),
                "rounded": stmt.get("rounded", False)
            })
            return 1
        
        # MOVE
        elif stmt_type == "Move":
            targets = stmt.get("targets", [])
            for target in targets:
                self._add_statement_to_current_block({
                    "type": "assign",
                    "expression": f"{stmt.get('source')} → {target}"
                })
            return 1
        
        # INITIALIZE
        elif stmt_type == "Initialize":
            self._add_statement_to_current_block({
                "type": "initialize",
                "target": ", ".join(stmt.get("targets", []))
            })
            return 1
        
        # EXIT/GOBACK
        elif stmt_type == "Exit":
            self._add_statement_to_current_block({
                "type": "return",
                "keyword": stmt.get("keyword")
            })
            return 1
        
        # Statement générique
        else:
            self._add_statement_to_current_block({
                "type": stmt_type.lower() if stmt_type else "statement",
                "content": stmt.get("content", str(stmt))
            })
            return 1
    
    def _open_if_block(self, stmt: Dict):
        """Ouvre un bloc IF avec branche THEN"""
        level = len(self.stack)
        
        if_block = CodeBlock(
            type="if",
            level=level,
            condition=stmt.get("condition")
        )
        
        # Créer la branche THEN
        then_block = CodeBlock(
            type="then",
            level=level + 1
        )
        
        if_block.children.append(then_block)
        
        # Ajouter au parent ou à la racine
        if self.stack:
            self.stack[-1].statements.append(if_block)
        else:
            self.root_blocks.append(if_block)
        
        # Empiler IF et THEN (THEN devient le bloc courant)
        self.stack.append(if_block)
        self.stack.append(then_block)
    
    def _switch_to_else(self):
        """Bascule de la branche THEN à la branche ELSE"""
        # Fermer le THEN
        if self.stack and self.stack[-1].type == "then":
            self.stack.pop()
        
        # Créer le ELSE
        if self.stack and self.stack[-1].type == "if":
            if_block = self.stack[-1]
            else_block = CodeBlock(
                type="else",
                level=if_block.level + 1
            )
            if_block.children.append(else_block)
            self.stack.append(else_block)
    
    def _close_if_block(self):
        """Ferme un bloc IF (et son THEN/ELSE)"""
        # Fermer THEN ou ELSE
        if self.stack and self.stack[-1].type in ("then", "else"):
            self.stack.pop()
        
        # Fermer IF
        if self.stack and self.stack[-1].type == "if":
            self.stack.pop()
    
    def _open_perform_block(self, stmt: Dict):
        """Ouvre un bloc PERFORM VARYING (boucle)"""
        level = len(self.stack)
        
        perform_block = CodeBlock(
            type="loop",
            level=level,
            condition=f"VARYING {stmt.get('varying')} FROM {stmt.get('from_value')} BY {stmt.get('by_value')} UNTIL {stmt.get('until_condition')}"
        )
        
        if self.stack:
            self.stack[-1].statements.append(perform_block)
        else:
            self.root_blocks.append(perform_block)
        
        self.stack.append(perform_block)
    
    def _close_perform_block(self):
        """Ferme un bloc PERFORM"""
        if self.stack and self.stack[-1].type == "loop":
            self.stack.pop()
    
    def _add_statement_to_current_block(self, stmt: Dict):
        """Ajoute un statement au bloc courant"""
        if self.stack:
            self.stack[-1].statements.append(stmt)
        else:
            # Pas de bloc ouvert : créer un bloc racine
            block = CodeBlock(type="block", level=0)
            block.statements.append(stmt)
            self.root_blocks.append(block)
    
    def _close_current_block(self):
        """Ferme le bloc courant (cleanup)"""
        if self.stack:
            self.stack.pop()


# === Exemple d'utilisation ===

if __name__ == "__main__":
    # Exemple : IF imbriqué avec ELSE
    statements = [
        {"type": "If", "condition": "H-PATIENT-AGE < 18"},
        {"type": "Move", "source": "EB-AGE-LT-13", "targets": ["H-AGE-FACTOR"]},
        {"type": "Else"},
        {"type": "If", "condition": "H-PATIENT-AGE < 45"},
        {"type": "Move", "source": "CM-AGE-18-44", "targets": ["H-AGE-FACTOR"]},
        {"type": "EndIf"},
        {"type": "EndIf"},
        {"type": "Compute", "target": "H-PAYMENT", "expression": "BASE * ADDON", "rounded": True}
    ]
    
    builder = ControlFlowBuilder()
    flow = builder.build_flow(statements)
    
    import json
    print(json.dumps(flow, indent=2))