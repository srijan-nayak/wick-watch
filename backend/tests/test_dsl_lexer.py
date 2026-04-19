import pytest
from dsl.lexer import tokenize, TokenType, LexError


def types(source: str) -> list[TokenType]:
    return [t.type for t in tokenize(source) if t.type != TokenType.EOF]


def values(source: str) -> list[str]:
    return [t.value for t in tokenize(source) if t.type != TokenType.EOF]


class TestCandleRef:
    def test_single(self):
        assert types("c1") == [TokenType.CANDLE_REF]

    def test_multi_digit(self):
        toks = tokenize("c12")
        assert toks[0].value == "c12"

    def test_not_confused_with_identifier(self):
        # 'close' should be IDENTIFIER, not CANDLE_REF
        assert types("close") == [TokenType.IDENTIFIER]


class TestOperators:
    def test_two_char_ops(self):
        for op in ("<=", ">=", "!="):
            result = values(op)
            assert result == [op], f"Expected [{op!r}] for {op!r}, got {result}"

    def test_single_char_ops(self):
        for op in ("<", ">", "="):
            assert values(op) == [op]


class TestNumbers:
    def test_integer(self):
        toks = tokenize("14")
        assert toks[0].type == TokenType.NUMBER
        assert toks[0].value == "14"

    def test_float(self):
        toks = tokenize("2.0")
        assert toks[0].type == TokenType.NUMBER
        assert toks[0].value == "2.0"


class TestComments:
    def test_comment_discarded(self):
        assert types("# this is a comment") == []

    def test_comment_inline(self):
        result = types("c1.high # comment")
        assert TokenType.IDENTIFIER in result
        assert all(t != TokenType.EOF for t in result)

    def test_comment_does_not_emit_newline(self):
        # comment on its own line should not leave a NEWLINE token
        result = types("c1.high\n# comment\nc2.low")
        assert result.count(TokenType.NEWLINE) == 1


class TestNewlines:
    def test_consecutive_newlines_collapsed(self):
        result = types("c1.high\n\n\nc2.low")
        assert result.count(TokenType.NEWLINE) == 1

    def test_leading_trailing_stripped(self):
        result = types("\nc1.high\n")
        assert result[0] == TokenType.CANDLE_REF
        assert result[-1] != TokenType.NEWLINE


class TestFullExpression:
    def test_candle_field(self):
        assert values("c1.high") == ["c1", ".", "high"]

    def test_indicator_call(self):
        result = values("ema(candle=1, period=20)")
        assert result == ["ema", "(", "candle", "=", "1", ",", "period", "=", "20", ")"]

    def test_comparison(self):
        result = types("c1.high < c3.low")
        assert result == [
            TokenType.CANDLE_REF, TokenType.DOT, TokenType.IDENTIFIER,
            TokenType.OP,
            TokenType.CANDLE_REF, TokenType.DOT, TokenType.IDENTIFIER,
        ]
