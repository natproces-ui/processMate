import re
import json
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass
from enum import Enum

class NodeType(Enum):
    PROGRAM = "Program"
    PROCEDURE = "Procedure"
    VARIABLE_DECLARATION = "VariableDeclaration"
    ASSIGNMENT = "Assignment"
    FOR_LOOP = "ForLoop"
    IF_STATEMENT = "IfStatement"
    FUNCTION_CALL = "FunctionCall"
    RETURN_STATEMENT = "ReturnStatement"
    COMMENT = "Comment"
    ARRAY_ACCESS = "ArrayAccess"
    BINARY_OPERATION = "BinaryOperation"
    LITERAL = "Literal"
    IDENTIFIER = "Identifier"
    EXPRESSION = "Expression"
    COMPOUND_ASSIGNMENT = "CompoundAssignment"
    CHAIN_ACCESS = "ChainAccess"
    GLOBAL_VARIABLE = "GlobalVariable"
    BREAK_STATEMENT = "BreakStatement"
    DIALOG_CALL = "DialogCall"
    ASSOCIATIVE_ARRAY = "AssociativeArray"
    CONCATENATION = "Concatenation"

@dataclass
class ASTNode:
    type: str
    value: Optional[Any] = None
    children: Optional[List['ASTNode']] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self):
        result = {"type": self.type}
        if self.value is not None:
            result["value"] = self.value
        if self.children:
            result["children"] = [child.to_dict() for child in self.children]
        if self.metadata:
            result["metadata"] = self.metadata
        return result

class ProcedureAnalyzer:
    """Analyseur enrichi pour les procédures"""
    def __init__(self):
        self.global_reads = set()
        self.global_writes = set()
        self.return_values = []
        self.api_calls = []
        self.database_tables = []
        self.dialog_calls = []
        self.external_functions = []
        
    def analyze_node(self, node: ASTNode, in_assignment_left: bool = False):
        """Analyse récursive d'un nœud pour extraire les side effects"""
        if not node:
            return
            
        # Détection des variables globales
        if node.type == NodeType.GLOBAL_VARIABLE.value:
            if in_assignment_left:
                self.global_writes.add(node.value)
            else:
                self.global_reads.add(node.value)
        
        # Détection des accès tableau globaux
        if node.type in [NodeType.ARRAY_ACCESS.value, NodeType.CHAIN_ACCESS.value]:
            if node.metadata and node.metadata.get("is_global"):
                if in_assignment_left:
                    self.global_writes.add(node.value)
                else:
                    self.global_reads.add(node.value)
        
        # Détection des retours
        if node.type == NodeType.RETURN_STATEMENT.value:
            self.return_values.append({
                "value": node.value,
                "type": self._infer_type(node.children[0]) if node.children else "unknown"
            })
        
        # Détection des appels API
        if node.type == NodeType.FUNCTION_CALL.value:
            if node.metadata and node.metadata.get("is_api_call"):
                self.api_calls.append(node.value)
            if node.metadata and node.metadata.get("is_business_function"):
                self.external_functions.append(node.value)
        
        # Détection des dialogues
        if node.type == NodeType.DIALOG_CALL.value:
            self.dialog_calls.append({
                "type": "error" if node.metadata.get("is_error_dialog") else "info"
            })
        
        # Détection des tables de base de données (dans les assignations)
        if node.type == NodeType.ASSIGNMENT.value:
            if node.children and len(node.children) == 2:
                right = node.children[1]
                if right.type == NodeType.LITERAL.value and right.metadata.get("literal_type") == "string":
                    table_match = re.match(r'"([A-Z_]+)"', right.value)
                    if table_match and table_match.group(1).isupper():
                        self.database_tables.append(table_match.group(1))
        
        # Analyse des assignations (côté gauche = écriture)
        if node.type in [NodeType.ASSIGNMENT.value, NodeType.COMPOUND_ASSIGNMENT.value]:
            if node.children:
                self.analyze_node(node.children[0], in_assignment_left=True)
                if len(node.children) > 1:
                    self.analyze_node(node.children[1], in_assignment_left=False)
        else:
            # Analyse récursive des enfants
            if node.children:
                for child in node.children:
                    self.analyze_node(child, in_assignment_left)
    
    def _infer_type(self, node: ASTNode) -> str:
        """Infère le type d'une expression"""
        if not node:
            return "unknown"
        
        if node.type == NodeType.LITERAL.value:
            return node.metadata.get("literal_type", "unknown")
        
        if node.type == NodeType.FUNCTION_CALL.value:
            # Heuristiques basées sur le nom de la fonction
            func_name = node.value.lower()
            if "date" in func_name:
                return "date"
            if "chaine" in func_name or "string" in func_name:
                return "string"
            if "numeric" in func_name or "entier" in func_name:
                return "number"
            return "variant"
        
        return "inferred"
    
    def get_summary(self) -> Dict[str, Any]:
        """Retourne un résumé de l'analyse"""
        # Déterminer le type de retour
        return_type = "void"
        return_values_unique = list({rv["value"] for rv in self.return_values})
        
        if self.return_values:
            types = {rv["type"] for rv in self.return_values}
            if len(types) == 1:
                return_type = list(types)[0]
            else:
                return_type = "mixed"
        
        return {
            "inputs": {
                "parameters": [],  # À remplir par le parser
                "global_dependencies": sorted(list(self.global_reads))
            },
            "outputs": {
                "return_type": return_type,
                "return_values": return_values_unique,
                "return_count": len(self.return_values),
                "global_modifications": sorted(list(self.global_writes))
            },
            "side_effects": {
                "api_calls": sorted(list(set(self.api_calls))),
                "database_operations": sorted(list(set(self.database_tables))),
                "dialogs": len(self.dialog_calls),
                "external_functions": sorted(list(set(self.external_functions)))
            },
            "complexity": {
                "global_reads": len(self.global_reads),
                "global_writes": len(self.global_writes),
                "has_side_effects": len(self.api_calls) > 0 or len(self.database_tables) > 0 or len(self.dialog_calls) > 0
            }
        }

class WinDevParser:
    def __init__(self, code: str):
        self.code = code
        self.lines = code.split('\n')
        self.current_line = 0
        self.global_variables = set()
        self.local_variables = set()
        self.functions_called = set()

    def parse(self) -> ASTNode:
        """Point d'entrée principal pour l'analyse"""
        root = ASTNode(
            type=NodeType.PROGRAM.value,
            children=[],
            metadata={
                "total_lines": len(self.lines),
                "global_variables": [],
                "functions_called": [],
                "procedures_count": 0
            }
        )

        while self.current_line < len(self.lines):
            node = self.parse_statement()
            if node:
                root.children.append(node)
            self.current_line += 1

        root.metadata["global_variables"] = sorted(list(self.global_variables))
        root.metadata["functions_called"] = sorted(list(self.functions_called))
        root.metadata["procedures_count"] = sum(
            1 for child in root.children if child.type == NodeType.PROCEDURE.value
        )

        return root

    def parse_statement(self) -> Optional[ASTNode]:
        """Parse une instruction WinDev"""
        line = self.lines[self.current_line].strip()

        if not line or line.startswith('//'):
            return self.parse_comment(line)

        if line.upper().startswith('PROCÉDURE') or line.upper().startswith('PROCEDURE'):
            return self.parse_procedure()

        if self.is_variable_declaration(line):
            return self.parse_variable_declaration(line)

        if line.upper().startswith('POUR'):
            return self.parse_for_loop()

        if line.upper().startswith('SI'):
            return self.parse_if_statement()

        if line.upper().startswith('RENVOYER'):
            return self.parse_return_statement(line)

        if line.upper() == 'SORTIR':
            return ASTNode(type=NodeType.BREAK_STATEMENT.value, value="SORTIR")

        if '+=' in line or '-=' in line or '*=' in line or '/=' in line:
            return self.parse_compound_assignment(line)

        if '=' in line and not self.is_comparison(line):
            return self.parse_assignment(line)

        if 'Dialogue(' in line or 'dialogue(' in line:
            return self.parse_dialog_call(line)

        if '(' in line and ')' in line:
            return self.parse_function_call(line)

        return None

    def is_comparison(self, line: str) -> bool:
        """Vérifie si le '=' est une comparaison et non une assignation"""
        comparison_patterns = [
            r'\s+SI\s+.*=.*ALORS',
            r'<>',
            r'<=',
            r'>='
        ]
        line_upper = line.upper()
        return any(re.search(pattern, line_upper, re.IGNORECASE) for pattern in comparison_patterns)

    def parse_comment(self, line: str) -> ASTNode:
        """Parse un commentaire"""
        content = line.lstrip('//').strip()
        is_summary = content.startswith('Résumé') or content.startswith('Description')
        
        return ASTNode(
            type=NodeType.COMMENT.value,
            value=content,
            metadata={"is_documentation": is_summary}
        )

    def parse_procedure(self) -> ASTNode:
        """Parse une déclaration de procédure avec analyse enrichie"""
        line = self.lines[self.current_line]
        match = re.search(r'PROC[ÉE]DURE\s+(\w+)\s*\((.*?)\)', line, re.IGNORECASE)

        if match:
            proc_name = match.group(1)
            params_str = match.group(2)
            params = [p.strip() for p in params_str.split(',') if p.strip()]

            # Sauvegarder les variables locales actuelles
            saved_local_vars = self.local_variables.copy()
            self.local_variables.clear()
            
            for param in params:
                self.local_variables.add(param)

            body = []
            self.current_line += 1

            while self.current_line < len(self.lines):
                line_content = self.lines[self.current_line].strip()

                if line_content.upper().startswith('PROCÉDURE') or \
                   line_content.upper().startswith('PROCEDURE'):
                    self.current_line -= 1
                    break

                node = self.parse_statement()
                if node:
                    body.append(node)

                self.current_line += 1

            # Analyse enrichie de la procédure
            analyzer = ProcedureAnalyzer()
            for node in body:
                analyzer.analyze_node(node)
            
            analysis = analyzer.get_summary()
            analysis["inputs"]["parameters"] = params
            
            # Restaurer les variables locales
            self.local_variables = saved_local_vars

            return ASTNode(
                type=NodeType.PROCEDURE.value,
                value=proc_name,
                children=body,
                metadata={
                    "parameters": params,
                    "parameter_count": len(params),
                    "body_statements": len(body),
                    "analysis": analysis
                }
            )

        return None

    def is_variable_declaration(self, line: str) -> bool:
        """Vérifie si la ligne est une déclaration de variable"""
        keywords = ['EST UNE', 'EST UN', 'est une', 'est un']
        return any(kw in line for kw in keywords)

    def parse_variable_declaration(self, line: str) -> ASTNode:
        """Parse une déclaration de variable avec initial_value parsé"""
        match = re.search(r'(\w+)\s+est\s+un(?:e)?\s+([\w\s<>]+?)(?:\s*=\s*(.+))?$', line, re.IGNORECASE)

        if match:
            var_name = match.group(1)
            var_type = match.group(2).strip()
            initial_value_str = match.group(3).strip() if match.group(3) else None

            is_global = var_name.startswith('g')
            is_param = var_name.startswith('p') or var_name.startswith('t')
            is_array = 'tableau' in var_type.lower()
            is_associative = 'associatif' in var_type.lower()

            if is_global:
                self.global_variables.add(var_name)
            else:
                self.local_variables.add(var_name)

            children = []
            if initial_value_str:
                initial_value_node = self.parse_expression(initial_value_str)
                children.append(initial_value_node)

            metadata = {
                "var_type": var_type,
                "is_global": is_global,
                "is_parameter": is_param,
                "is_array": is_array,
                "is_associative_array": is_associative
            }

            node = ASTNode(
                type=NodeType.VARIABLE_DECLARATION.value,
                value=var_name,
                children=children,
                metadata=metadata
            )

            return node

        return None

    def parse_compound_assignment(self, line: str) -> ASTNode:
        """Parse les assignations composées (+=, -=, etc.)"""
        operators = ['+=', '-=', '*=', '/=']
        for op in operators:
            if op in line:
                parts = line.split(op, 1)
                if len(parts) == 2:
                    left = parts[0].strip()
                    right = parts[1].strip()

                    left_node = self.parse_expression(left)
                    right_node = self.parse_expression(right)

                    return ASTNode(
                        type=NodeType.COMPOUND_ASSIGNMENT.value,
                        children=[left_node, right_node],
                        metadata={"operator": op}
                    )
        return None

    def parse_assignment(self, line: str) -> ASTNode:
        """Parse une assignation"""
        parts = line.split('=', 1)
        if len(parts) == 2:
            left = parts[0].strip()
            right = parts[1].strip()

            left_node = self.parse_expression(left)
            right_node = self.parse_expression(right)

            return ASTNode(
                type=NodeType.ASSIGNMENT.value,
                children=[left_node, right_node],
                metadata={"operator": "="}
            )

        return None

    def parse_for_loop(self) -> ASTNode:
        """Parse une boucle FOR"""
        line = self.lines[self.current_line]
        match = re.search(r'POUR\s+(\w+)\s*=\s*(.+?)\s+_À_\s+(.+)', line, re.IGNORECASE)

        body = []
        if match:
            var_name = match.group(1)
            start_expr = match.group(2).strip()
            end_expr = match.group(3).strip()

            self.current_line += 1

            while self.current_line < len(self.lines):
                line_content = self.lines[self.current_line].strip().upper()

                if line_content == 'FIN':
                    break

                node = self.parse_statement()
                if node:
                    body.append(node)

                self.current_line += 1

            return ASTNode(
                type=NodeType.FOR_LOOP.value,
                children=body,
                metadata={
                    "iterator": var_name,
                    "start": start_expr,
                    "end": end_expr,
                    "body_statements": len(body)
                }
            )

        return None

    def parse_if_statement(self) -> ASTNode:
        """Parse une structure IF"""
        line = self.lines[self.current_line]
        match = re.search(r'SI\s+(.+?)\s+ALORS', line, re.IGNORECASE)

        if match:
            condition = match.group(1).strip()
            then_branch = []
            else_branch = []
            current_branch = then_branch

            self.current_line += 1

            while self.current_line < len(self.lines):
                line_content = self.lines[self.current_line].strip().upper()

                if line_content == 'FIN':
                    break

                if line_content == 'SINON':
                    current_branch = else_branch
                    self.current_line += 1
                    continue

                node = self.parse_statement()
                if node:
                    current_branch.append(node)

                self.current_line += 1

            children = [ASTNode(
                type="ThenBranch",
                children=then_branch,
                metadata={"statement_count": len(then_branch)}
            )]
            
            if else_branch:
                children.append(ASTNode(
                    type="ElseBranch",
                    children=else_branch,
                    metadata={"statement_count": len(else_branch)}
                ))

            return ASTNode(
                type=NodeType.IF_STATEMENT.value,
                children=children,
                metadata={
                    "condition": condition,
                    "has_else": len(else_branch) > 0
                }
            )

        return None

    def parse_return_statement(self, line: str) -> ASTNode:
        """Parse un RENVOYER"""
        match = re.search(r'RENVOYER\s+(.+)', line, re.IGNORECASE)

        if match:
            return_value = match.group(1).strip()
            return ASTNode(
                type=NodeType.RETURN_STATEMENT.value,
                value=return_value,
                children=[self.parse_expression(return_value)]
            )

        return None

    def parse_dialog_call(self, line: str) -> ASTNode:
        """Parse un appel Dialogue()"""
        match = re.search(r'Dialogue\s*\((.*)\)', line, re.IGNORECASE)
        
        if match:
            args_str = match.group(1)
            args = []
            if args_str.strip():
                arg_list = self.split_arguments(args_str)
                args = [self.parse_expression(arg.strip()) for arg in arg_list]
            
            self.functions_called.add("Dialogue")
            
            return ASTNode(
                type=NodeType.DIALOG_CALL.value,
                value="Dialogue",
                children=args,
                metadata={
                    "argument_count": len(args),
                    "is_error_dialog": "dlgIcôneErreur" in line or "Erreur" in line
                }
            )
        
        return None

    def parse_function_call(self, line: str) -> ASTNode:
        """Parse un appel de fonction"""
        match = re.search(r'(\w+)\s*\((.*)\)', line)

        if match:
            func_name = match.group(1)
            args_str = match.group(2)

            self.functions_called.add(func_name)

            args = []
            if args_str.strip():
                arg_list = self.split_arguments(args_str)
                args = [self.parse_expression(arg.strip()) for arg in arg_list]

            is_api_call = func_name.startswith('_api') or 'api' in func_name.lower()
            is_business_function = func_name.startswith('_') or func_name.startswith('fct')

            return ASTNode(
                type=NodeType.FUNCTION_CALL.value,
                value=func_name,
                children=args,
                metadata={
                    "argument_count": len(args),
                    "is_api_call": is_api_call,
                    "is_business_function": is_business_function
                }
            )

        return None

    def parse_expression(self, expr: str) -> ASTNode:
        """Parse une expression"""
        expr = expr.strip()

        if expr.startswith('"') and expr.endswith('"'):
            return ASTNode(
                type=NodeType.LITERAL.value,
                value=expr,
                metadata={"literal_type": "string"}
            )

        if expr.replace('.', '', 1).replace('-', '', 1).isdigit():
            return ASTNode(
                type=NodeType.LITERAL.value,
                value=expr,
                metadata={"literal_type": "number"}
            )

        if expr.upper() in ['VRAI', 'FAUX', 'TRUE', 'FALSE']:
            return ASTNode(
                type=NodeType.LITERAL.value,
                value=expr,
                metadata={"literal_type": "boolean"}
            )

        if self.is_chain_access(expr):
            return self.parse_chain_access(expr)

        if '[' in expr and ']' in expr and '(' not in expr:
            match = re.search(r'(\w+)\[(.+?)\]', expr)
            if match:
                array_name = match.group(1)
                index = match.group(2)

                is_global = array_name.startswith('g')
                if is_global:
                    self.global_variables.add(array_name)

                return ASTNode(
                    type=NodeType.ARRAY_ACCESS.value,
                    value=array_name,
                    children=[self.parse_expression(index)],
                    metadata={
                        "index": index,
                        "is_global": is_global
                    }
                )

        if '(' in expr and ')' in expr:
            return self.parse_function_call(expr)

        if '+' in expr and ('"' in expr or any(op in expr for op in [';'])):
            return self.parse_concatenation(expr)

        for op in ['<>', '<=', '>=', '<', '>', '=']:
            if op in expr and not (expr.startswith('"') and expr.endswith('"')):
                parts = expr.split(op, 1)
                if len(parts) == 2:
                    return ASTNode(
                        type=NodeType.BINARY_OPERATION.value,
                        children=[
                            self.parse_expression(parts[0].strip()),
                            self.parse_expression(parts[1].strip())
                        ],
                        metadata={"operator": op}
                    )

        for op in ['+', '-', '*', '/']:
            if op in expr:
                parts = expr.split(op, 1)
                if len(parts) == 2:
                    return ASTNode(
                        type=NodeType.BINARY_OPERATION.value,
                        children=[
                            self.parse_expression(parts[0].strip()),
                            self.parse_expression(parts[1].strip())
                        ],
                        metadata={"operator": op}
                    )

        is_global = expr.startswith('g')
        if is_global:
            self.global_variables.add(expr)

        return ASTNode(
            type=NodeType.GLOBAL_VARIABLE.value if is_global else NodeType.IDENTIFIER.value,
            value=expr,
            metadata={"is_global": is_global}
        )

    def is_chain_access(self, expr: str) -> bool:
        """Vérifie si c'est un accès chaîné"""
        bracket_count = expr.count('[')
        if bracket_count <= 1:
            return False
        
        if '(' in expr:
            paren_pos = expr.find('(')
            first_bracket = expr.find('[')
            if first_bracket > paren_pos:
                return False
        
        return True

    def parse_chain_access(self, expr: str) -> ASTNode:
        """Parse un accès chaîné: gProduit[i]["IDProduit"]"""
        base_match = re.match(r'(\w+)', expr)
        if not base_match:
            return self.parse_expression(expr)

        base_name = base_match.group(1)
        
        accesses = re.findall(r'\[([^\]]+)\]', expr)
        
        children = [self.parse_expression(access) for access in accesses]
        
        is_global = base_name.startswith('g')
        if is_global:
            self.global_variables.add(base_name)
        
        return ASTNode(
            type=NodeType.CHAIN_ACCESS.value,
            value=base_name,
            children=children,
            metadata={
                "access_chain": accesses,
                "depth": len(accesses),
                "is_global": is_global
            }
        )

    def parse_concatenation(self, expr: str) -> ASTNode:
        """Parse une concaténation de chaînes"""
        parts = []
        current = ""
        in_string = False
        
        for char in expr:
            if char == '"':
                in_string = not in_string
                current += char
            elif char == '+' and not in_string:
                if current.strip():
                    parts.append(current.strip())
                current = ""
            else:
                current += char
        
        if current.strip():
            parts.append(current.strip())
        
        if len(parts) > 1:
            children = [self.parse_expression(part) for part in parts]
            return ASTNode(
                type=NodeType.CONCATENATION.value,
                children=children,
                metadata={"part_count": len(parts)}
            )
        
        return self.parse_expression(expr)

    def split_arguments(self, args_str: str) -> List[str]:
        """Sépare les arguments en tenant compte des parenthèses et guillemets"""
        args = []
        current_arg = ""
        paren_depth = 0
        bracket_depth = 0
        in_string = False

        for char in args_str:
            if char == '"':
                in_string = not in_string
                current_arg += char
            elif not in_string:
                if char == '(':
                    paren_depth += 1
                    current_arg += char
                elif char == ')':
                    paren_depth -= 1
                    current_arg += char
                elif char == '[':
                    bracket_depth += 1
                    current_arg += char
                elif char == ']':
                    bracket_depth -= 1
                    current_arg += char
                elif char == ',' and paren_depth == 0 and bracket_depth == 0:
                    args.append(current_arg.strip())
                    current_arg = ""
                else:
                    current_arg += char
            else:
                current_arg += char

        if current_arg.strip():
            args.append(current_arg.strip())

        return args


def parse_windev_code(code: str) -> Dict[str, Any]:
    """
    Parse du code WinDev et retourne l'AST enrichi en JSON

    Args:
        code: Code WinDev sous forme de string

    Returns:
        Dict représentant l'AST avec métadonnées enrichies incluant:
        - Analyse complète des inputs/outputs
        - Détection des side effects
        - Variables globales lues/écrites
        - Appels API et fonctions externes
    """
    parser = WinDevParser(code)
    ast = parser.parse()
    return ast.to_dict()