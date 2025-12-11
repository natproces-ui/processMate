"""
formula_extractor.py
Extrait et structure les formules mathématiques COBOL
Préserve : COMPUTE, calculs multi-lignes, opérateurs, priorités
"""

import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class Formula:
    """Représente une formule mathématique"""
    target: str
    expression: str
    rounded: bool
    variables: List[str]
    operators: List[str]
    complexity: str  # "simple", "medium", "complex"
    
    def to_dict(self) -> Dict:
        return {
            "target": self.target,
            "expression": self.expression,
            "rounded": self.rounded,
            "variables_used": self.variables,
            "operators": self.operators,
            "complexity": self.complexity
        }


class FormulaExtractor:
    """Extrait et analyse les formules mathématiques"""
    
    # Opérateurs COBOL
    OPERATORS = ['+', '-', '*', '/', '**', '(', ')']
    
    def extract_from_statement(self, stmt: Dict) -> Optional[Formula]:
        """Extrait une formule d'un statement COMPUTE"""
        if stmt.get("type") != "Compute":
            return None
        
        target = stmt.get("target", "")
        expression = stmt.get("expression", "")
        rounded = stmt.get("rounded", False)
        
        if not target or not expression:
            return None
        
        # Extraire les variables
        variables = self._extract_variables(expression)
        
        # Extraire les opérateurs
        operators = self._extract_operators(expression)
        
        # Évaluer la complexité
        complexity = self._evaluate_complexity(expression, operators)
        
        return Formula(
            target=target,
            expression=expression,
            rounded=rounded,
            variables=variables,
            operators=operators,
            complexity=complexity
        )
    
    def extract_from_paragraph(self, paragraph: Dict) -> List[Formula]:
        """Extrait toutes les formules d'un paragraphe"""
        formulas = []
        
        statements = paragraph.get("statements", [])
        for stmt in statements:
            formula = self.extract_from_statement(stmt)
            if formula:
                formulas.append(formula)
        
        return formulas
    
    def _extract_variables(self, expression: str) -> List[str]:
        """Extrait les noms de variables d'une expression"""
        # Retirer les opérateurs et nombres
        cleaned = expression
        for op in self.OPERATORS:
            cleaned = cleaned.replace(op, ' ')
        
        # Extraire les tokens qui ressemblent à des variables COBOL
        tokens = cleaned.split()
        variables = []
        
        for token in tokens:
            token = token.strip()
            # Variable COBOL : commence par lettre, contient lettres/chiffres/-
            if re.match(r'^[A-Z][A-Z0-9\-]*$', token, re.IGNORECASE):
                if not token.replace('.', '').isdigit():  # Pas un nombre
                    variables.append(token)
        
        return list(set(variables))  # Unique
    
    def _extract_operators(self, expression: str) -> List[str]:
        """Extrait les opérateurs utilisés"""
        found = []
        for op in self.OPERATORS:
            if op in expression:
                found.append(op)
        return found
    
    def _evaluate_complexity(self, expression: str, operators: List[str]) -> str:
        """Évalue la complexité d'une formule"""
        # Compter les opérations
        op_count = sum(expression.count(op) for op in operators if op not in ['(', ')'])
        paren_depth = self._max_parenthesis_depth(expression)
        
        if op_count <= 2 and paren_depth <= 1:
            return "simple"
        elif op_count <= 5 and paren_depth <= 2:
            return "medium"
        else:
            return "complex"
    
    def _max_parenthesis_depth(self, expression: str) -> int:
        """Calcule la profondeur maximale des parenthèses"""
        max_depth = 0
        current_depth = 0
        
        for char in expression:
            if char == '(':
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            elif char == ')':
                current_depth -= 1
        
        return max_depth
    
    def group_formulas_by_complexity(self, formulas: List[Formula]) -> Dict[str, List[Dict]]:
        """Groupe les formules par complexité"""
        grouped = {
            "simple": [],
            "medium": [],
            "complex": []
        }
        
        for formula in formulas:
            grouped[formula.complexity].append(formula.to_dict())
        
        return grouped


# === Intégration avec AST Builder ===

class EnhancedASTBuilder:
    """Extension de ASTBuilder avec extraction de formules"""
    
    def __init__(self):
        self.formula_extractor = FormulaExtractor()
        self.all_formulas = []
    
    def extract_formulas_from_procedures(self, paragraphs: List[Dict]) -> Dict:
        """Extrait toutes les formules des paragraphes"""
        formulas_by_paragraph = {}
        
        for para in paragraphs:
            para_name = para.get("name", "unknown")
            formulas = self.formula_extractor.extract_from_paragraph(para)
            
            if formulas:
                formulas_by_paragraph[para_name] = [f.to_dict() for f in formulas]
                self.all_formulas.extend(formulas)
        
        return {
            "by_paragraph": formulas_by_paragraph,
            "by_complexity": self.formula_extractor.group_formulas_by_complexity(self.all_formulas),
            "total_count": len(self.all_formulas)
        }


# === Exemple ===

if __name__ == "__main__":
    # Test avec formule complexe du COBOL ESRD
    test_statement = {
        "type": "Compute",
        "target": "H-BUN-ADJUSTED-BASE-WAGE-AMT",
        "expression": "(H-BUN-BASE-WAGE-AMT * H-BUN-AGE-FACTOR) * (H-BUN-BSA-FACTOR * H-BUN-BMI-FACTOR) * (H-BUN-ONSET-FACTOR * H-BUN-COMORBID-MULTIPLIER) * (H-BUN-LOW-VOL-MULTIPLIER)",
        "rounded": True
    }
    
    extractor = FormulaExtractor()
    formula = extractor.extract_from_statement(test_statement)
    
    import json
    print(json.dumps(formula.to_dict(), indent=2))