from __future__ import annotations
from .lexer import Token, TokenType, tokenize
from .ast_nodes import (
    OHLC_FIELDS, BOOL_PROPS, COMPARISON_OPS,
    CandleField, BoolProp, IndicatorCall, NumberLiteral,
    Comparison, LogicalAnd, LogicalOr, BoolNode, ValueNode, PatternAST,
)


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
            # consume optional newline between top-level conditions
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

        if tok.type == TokenType.LPAREN:
            self._advance()
            node = self._parse_or()
            self._expect(TokenType.RPAREN, "grouped expression")
            return node

        if tok.type == TokenType.CANDLE_REF:
            candle_idx = self._parse_candle_index()
            self._expect(TokenType.DOT, f"candle ref c{candle_idx}")
            attr_tok = self._expect(TokenType.IDENTIFIER, f"c{candle_idx}.<attr>")
            attr = attr_tok.value

            if attr in BOOL_PROPS:
                return BoolProp(candle_index=candle_idx, prop=attr)

            if attr in OHLC_FIELDS:
                left: ValueNode = CandleField(candle_index=candle_idx, field=attr)
                op = self._parse_op()
                right = self._parse_value()
                return Comparison(left=left, op=op, right=right)

            raise ParseError(
                f"Line {attr_tok.line}:{attr_tok.col} — '{attr}' is not a valid candle attribute. "
                f"Valid OHLC fields: {sorted(OHLC_FIELDS)}, bool props: {sorted(BOOL_PROPS)}"
            )

        # indicator call or bare number on the left of a comparison
        left = self._parse_value()
        op = self._parse_op()
        right = self._parse_value()
        return Comparison(left=left, op=op, right=right)

    def _parse_candle_index(self) -> int:
        tok = self._expect(TokenType.CANDLE_REF)
        try:
            idx = int(tok.value[1:])  # strip leading 'c'
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

    def _parse_value(self) -> ValueNode:
        tok = self._peek()

        if tok.type == TokenType.NUMBER:
            self._advance()
            return NumberLiteral(value=float(tok.value))

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

        raise ParseError(
            f"Line {tok.line}:{tok.col} — expected a value (candle field, indicator call, or number), "
            f"got {tok.type.name} {tok.value!r}"
        )

    def _parse_indicator_call(self) -> IndicatorCall:
        name_tok = self._expect(TokenType.IDENTIFIER)
        self._expect(TokenType.LPAREN, f"indicator '{name_tok.value}'")

        params: dict[str, int | float] = {}
        while self._peek().type != TokenType.RPAREN:
            key_tok = self._expect(TokenType.IDENTIFIER, "named param")
            self._expect(TokenType.OP)   # consumes the '='
            val_tok = self._expect(TokenType.NUMBER, f"value for param '{key_tok.value}'")
            params[key_tok.value] = float(val_tok.value) if "." in val_tok.value else int(val_tok.value)
            if self._peek().type == TokenType.COMMA:
                self._advance()

        self._expect(TokenType.RPAREN, f"indicator '{name_tok.value}'")
        return IndicatorCall(name=name_tok.value, params=params)


def parse(source: str) -> PatternAST:
    tokens = tokenize(source)
    return Parser(tokens).parse()
