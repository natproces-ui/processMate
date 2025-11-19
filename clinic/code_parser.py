import re
import json
from typing import List, Dict, Any, Optional
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

class WinDevParser:
    def __init__(self, code: str):
        self.code = code
        self.lines = code.split('\n')
        self.current_line = 0
        self.tokens = []

    def parse(self) -> ASTNode:
        """Point d'entrée principal pour l'analyse"""
        root = ASTNode(
            type=NodeType.PROGRAM.value,
            children=[],
            metadata={"total_lines": len(self.lines)}
        )

        while self.current_line < len(self.lines):
            node = self.parse_statement()
            if node:
                root.children.append(node)
            self.current_line += 1

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

        if '=' in line:
            return self.parse_assignment(line)

        if '(' in line and ')' in line:
            return self.parse_function_call(line)

        return None

    def parse_comment(self, line: str) -> ASTNode:
        """Parse un commentaire"""
        return ASTNode(
            type=NodeType.COMMENT.value,
            value=line.lstrip('//').strip()
        )

    def parse_procedure(self) -> ASTNode:
        """Parse une déclaration de procédure"""
        line = self.lines[self.current_line]
        match = re.search(r'PROC[ÉE]DURE\s+(\w+)\s*\((.*?)\)', line, re.IGNORECASE)

        if match:
            proc_name = match.group(1)
            params_str = match.group(2)
            params = [p.strip() for p in params_str.split(',') if p.strip()]

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

            return ASTNode(
                type=NodeType.PROCEDURE.value,
                value=proc_name,
                children=body,
                metadata={"parameters": params}
            )

        return None

    def is_variable_declaration(self, line: str) -> bool:
        """Vérifie si la ligne est une déclaration de variable"""
        keywords = ['EST UNE', 'EST UN', 'est une', 'est un']
        return any(kw in line for kw in keywords)

    def parse_variable_declaration(self, line: str) -> ASTNode:
        """Parse une déclaration de variable"""
        match = re.search(r'(\w+)\s+est\s+un(?:e)?\s+([\w\s<>]+?)(?:\s*=\s*(.+))?$', line, re.IGNORECASE)

        if match:
            var_name = match.group(1)
            var_type = match.group(2).strip()
            initial_value = match.group(3).strip() if match.group(3) else None

            node = ASTNode(
                type=NodeType.VARIABLE_DECLARATION.value,
                value=var_name,
                metadata={
                    "var_type": var_type,
                    "initial_value": initial_value
                }
            )

            return node

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
            indent_level = self.get_indent_level(self.current_line)

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
                    "end": end_expr
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

            children = [ASTNode(type="ThenBranch", children=then_branch)]
            if else_branch:
                children.append(ASTNode(type="ElseBranch", children=else_branch))

            return ASTNode(
                type=NodeType.IF_STATEMENT.value,
                children=children,
                metadata={"condition": condition}
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

    def parse_function_call(self, line: str) -> ASTNode:
        """Parse un appel de fonction"""
        match = re.search(r'(\w+)\s*\((.*)\)', line)

        if match:
            func_name = match.group(1)
            args_str = match.group(2)

            args = []
            if args_str.strip():
                arg_list = self.split_arguments(args_str)
                args = [self.parse_expression(arg.strip()) for arg in arg_list]

            return ASTNode(
                type=NodeType.FUNCTION_CALL.value,
                value=func_name,
                children=args,
                metadata={"argument_count": len(args)}
            )

        return None

    def parse_expression(self, expr: str) -> ASTNode:
        """Parse une expression"""
        expr = expr.strip()

        if expr.startswith('"') and expr.endswith('"'):
            return ASTNode(type=NodeType.LITERAL.value, value=expr, metadata={"literal_type": "string"})

        if expr.replace('.', '', 1).replace('-', '', 1).isdigit():
            return ASTNode(type=NodeType.LITERAL.value, value=expr, metadata={"literal_type": "number"})

        if expr.upper() in ['VRAI', 'FAUX', 'TRUE', 'FALSE']:
            return ASTNode(type=NodeType.LITERAL.value, value=expr, metadata={"literal_type": "boolean"})

        if '[' in expr and ']' in expr:
            match = re.search(r'(\w+)\[(.+?)\]', expr)
            if match:
                array_name = match.group(1)
                index = match.group(2)

                return ASTNode(
                    type=NodeType.ARRAY_ACCESS.value,
                    value=array_name,
                    children=[self.parse_expression(index)],
                    metadata={"index": index}
                )

        if '(' in expr and ')' in expr:
            return self.parse_function_call(expr)

        for op in ['+', '-', '*', '/', '<>', '=', '<', '>', '<=', '>=']:
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

        return ASTNode(type=NodeType.IDENTIFIER.value, value=expr)

    def split_arguments(self, args_str: str) -> List[str]:
        """Sépare les arguments en tenant compte des parenthèses et guillemets"""
        args = []
        current_arg = ""
        paren_depth = 0
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
                elif char == ',' and paren_depth == 0:
                    args.append(current_arg.strip())
                    current_arg = ""
                else:
                    current_arg += char
            else:
                current_arg += char

        if current_arg.strip():
            args.append(current_arg.strip())

        return args

    def get_indent_level(self, line_num: int) -> int:
        """Obtient le niveau d'indentation d'une ligne"""
        if line_num >= len(self.lines):
            return 0
        line = self.lines[line_num]
        return len(line) - len(line.lstrip())


def parse_windev_code(code: str) -> Dict[str, Any]:
    """
    Parse du code WinDev et retourne l'AST en JSON

    Args:
        code: Code WinDev sous forme de string

    Returns:
        Dict représentant l'AST
    """
    parser = WinDevParser(code)
    ast = parser.parse()
    return ast.to_dict()