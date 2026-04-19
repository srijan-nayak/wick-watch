from __future__ import annotations
from .lexer import Token, TokenType, tokenize
from .ast_nodes import (
    OHLC_FIELDS, BOOL_PROPS, COMPARISON_OPS,
    CandleField, BoolProp, IndicatorCall, NumberLiteral, BinaryArith,
    Comparison, LogicalAnd, LogicalOr, BoolNode, ValueNode, PatternAST,
)

_ARITH_ADD = frozenset({'+', '-'})
_ARITH_MUL = frozenset({'*', '/'})


class ParseError(Exception):
    pass


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    # ------------------------------------------------------------------ helpers

    def _peek(self, offset: int = 0) -> Token:
        idx = self._pos + offset
        return self._tokens[idx] if idx < len(self._tokens) else self._tokens[-1]

    def _advance(self) -> Token:
        tok = self._tokens[self._pos]
        self._pos += 1
        return tok

    def _expect(self, tt: TokenType, context: str = "") -> Token:
        tok = self._peek()
        if tok.type != tt:
            hint = f" (in {context})" if context else ""
            raise ParseError(
                f"Line {tok.line}:{tok.col} — expected {tt.name}, got {tok.type.name} {tok.value!r}{hint}"
            )
        return self._advance()

    def _skip_newlines(self) -> None:
        while self._peek().type == TokenType.NEWLINE:
            self._advance()

    # ------------------------------------------------------------------ grammar

    def parse(self) -> PatternAST:
        conditions: list[BoolNode] = []
        self._skip_newlines()
        while self._peek().type != TokenType.EOF:
            conditions.append(self._parse_or())
            if self._peek().type == TokenType.NEWLINE:
                self._advance()
            self._skip_newlines()
        if not conditions:
            raise ParseError("Pattern is empty")
        return PatternAST(conditions=conditions)

    def _parse_or(self) -> BoolNode:
        node = self._parse_and()
        while self._peek().type == TokenType.IDENTIFIER and self._peek().value == "OR":
            self._advance()
            right = self._parse_and()
            node = LogicalOr(left=node, right=right)
        return node

    def _parse_and(self) -> BoolNode:
        node = self._parse_primary()
        while self._peek().type == TokenType.IDENTIFIER and self._peek().value == "AND":
            self._advance()
            right = self._parse_primary()
            node = LogicalAnd(left=node, right=right)
        return node

    def _parse_primary(self) -> BoolNode:
        tok = self._peek()

        # Parenthesised group — lookahead decides: arithmetic comparison vs bool group
        if tok.type == TokenType.LPAREN:
            if self._is_arith_group():
                left = self._parse_arith()
                op = self._parse_op()
                right = self._parse_arith()
                return Comparison(left=left, op=op, right=right)
            else:
                self._advance()
                node = self._parse_or()
                self._expect(TokenType.RPAREN, "grouped expression")
                return node

        # Candle ref — bool prop or OHLC field (possibly with arithmetic)
        if tok.type == TokenType.CANDLE_REF:
            candle_idx = self._parse_candle_index()
            self._expect(TokenType.DOT, f"candle ref c{candle_idx}")
            attr_tok = self._expect(TokenType.IDENTIFIER, f"c{candle_idx}.<attr>")
            attr = attr_tok.value

            if attr in BOOL_PROPS:
                return BoolProp(candle_index=candle_idx, prop=attr)

            if attr in OHLC_FIELDS:
                left: ValueNode = CandleField(candle_index=candle_idx, field=attr)
                # arithmetic continuation on the left side?
                if self._peek().type == TokenType.ARITH:
                    left = self._continue_arith(left)
                op = self._parse_op()
                right = self._parse_arith()
                return Comparison(left=left, op=op, right=right)

            raise ParseError(
                f"Line {attr_tok.line}:{attr_tok.col} — '{attr}' is not a valid candle attribute. "
                f"Valid OHLC fields: {sorted(OHLC_FIELDS)}, bool props: {sorted(BOOL_PROPS)}"
            )

        # Indicator call, number, or nested arithmetic group on the left of a comparison
        left = self._parse_arith()
        op = self._parse_op()
        right = self._parse_arith()
        return Comparison(left=left, op=op, right=right)

    # ------------------------------------------------------------------ arithmetic

    def _parse_arith(self) -> ValueNode:
        """additive expression: term (('+' | '-') term)*"""
        left = self._parse_term()
        while self._peek().type == TokenType.ARITH and self._peek().value in _ARITH_ADD:
            op = self._advance().value
            right = self._parse_term()
            left = BinaryArith(left=left, op=op, right=right)
        return left

    def _parse_term(self) -> ValueNode:
        """multiplicative expression: factor (('*' | '/') factor)*"""
        left = self._parse_factor()
        while self._peek().type == TokenType.ARITH and self._peek().value in _ARITH_MUL:
            op = self._advance().value
            right = self._parse_factor()
            left = BinaryArith(left=left, op=op, right=right)
        return left

    def _parse_factor(self) -> ValueNode:
        """atomic: NUMBER | candle_field | indicator_call | '(' arith_expr ')'"""
        tok = self._peek()

        if tok.type == TokenType.NUMBER:
            self._advance()
            return NumberLiteral(float(tok.value))

        if tok.type == TokenType.CANDLE_REF:
            candle_idx = self._parse_candle_index()
            self._expect(TokenType.DOT, f"c{candle_idx}")
            field_tok = self._expect(TokenType.IDENTIFIER, f"c{candle_idx}.<field>")
            if field_tok.value not in OHLC_FIELDS:
                raise ParseError(
                    f"Line {field_tok.line}:{field_tok.col} — '{field_tok.value}' is not a valid OHLC field. "
                    f"Expected one of {sorted(OHLC_FIELDS)}"
                )
            return CandleField(candle_index=candle_idx, field=field_tok.value)

        if tok.type == TokenType.IDENTIFIER:
            return self._parse_indicator_call()

        if tok.type == TokenType.LPAREN:
            self._advance()
            node = self._parse_arith()
            self._expect(TokenType.RPAREN, "arithmetic sub-expression")
            return node

        raise ParseError(
            f"Line {tok.line}:{tok.col} — expected a value (candle field, indicator call, or number), "
            f"got {tok.type.name} {tok.value!r}"
        )

    def _continue_arith(self, initial: ValueNode) -> ValueNode:
        """
        Continue building an arithmetic expression starting from an already-parsed
        initial factor.  Handles * / first, then + -.
        """
        left = initial
        while self._peek().type == TokenType.ARITH and self._peek().value in _ARITH_MUL:
            op = self._advance().value
            right = self._parse_factor()
            left = BinaryArith(left=left, op=op, right=right)
        while self._peek().type == TokenType.ARITH and self._peek().value in _ARITH_ADD:
            op = self._advance().value
            right = self._parse_term()
            left = BinaryArith(left=left, op=op, right=right)
        return left

    def _is_arith_group(self) -> bool:
        """
        Lookahead from the current LPAREN: return True if this parenthesised
        group is the start of an arithmetic expression (not a boolean group).

        True when:
        - there is an arithmetic op (+  - * /) inside the parens at depth 1, OR
        - the token immediately after the matching ')' is an arithmetic op.
        """
        depth = 0
        for i in range(self._pos, len(self._tokens)):
            tok = self._tokens[i]
            if tok.type == TokenType.LPAREN:
                depth += 1
            elif tok.type == TokenType.RPAREN:
                depth -= 1
                if depth == 0:
                    nxt_idx = i + 1
                    if nxt_idx < len(self._tokens):
                        nxt = self._tokens[nxt_idx]
                        return nxt.type == TokenType.ARITH
                    return False
            elif tok.type == TokenType.ARITH and depth == 1:
                return True
        return False

    # ------------------------------------------------------------------ shared helpers

    def _parse_candle_index(self) -> int:
        tok = self._expect(TokenType.CANDLE_REF)
        try:
            idx = int(tok.value[1:])
        except ValueError:
            raise ParseError(f"Line {tok.line}:{tok.col} — invalid candle ref {tok.value!r}")
        if idx < 1:
            raise ParseError(f"Line {tok.line}:{tok.col} — candle index must be >= 1, got {idx}")
        return idx

    def _parse_op(self) -> str:
        tok = self._expect(TokenType.OP)
        if tok.value not in COMPARISON_OPS:
            raise ParseError(f"Line {tok.line}:{tok.col} — unknown operator {tok.value!r}")
        return tok.value

    def _parse_indicator_call(self) -> IndicatorCall:
        name_tok = self._expect(TokenType.IDENTIFIER)
        self._expect(TokenType.LPAREN, f"indicator '{name_tok.value}'")

        params: dict[str, int | float] = {}
        while self._peek().type != TokenType.RPAREN:
            key_tok = self._expect(TokenType.IDENTIFIER, "named param")
            self._expect(TokenType.OP)   # consumes '='
            val_tok = self._expect(TokenType.NUMBER, f"value for param '{key_tok.value}'")
            params[key_tok.value] = float(val_tok.value) if "." in val_tok.value else int(val_tok.value)
            if self._peek().type == TokenType.COMMA:
                self._advance()

        self._expect(TokenType.RPAREN, f"indicator '{name_tok.value}'")
        return IndicatorCall(name=name_tok.value, params=params)


def parse(source: str) -> PatternAST:
    tokens = tokenize(source)
    return Parser(tokens).parse()
