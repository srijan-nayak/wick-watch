from __future__ import annotations
import re
from dataclasses import dataclass
from enum import Enum, auto


class TokenType(Enum):
    CANDLE_REF  = auto()   # c1, c2, ...
    DOT         = auto()   # .
    IDENTIFIER  = auto()   # AND, OR, field names, indicator names
    LPAREN      = auto()   # (
    RPAREN      = auto()   # )
    COMMA       = auto()   # ,
    OP          = auto()   # < > <= >= != =
    NUMBER      = auto()   # 14, 2.0
    NEWLINE     = auto()
    EOF         = auto()


@dataclass(frozen=True)
class Token:
    type: TokenType
    value: str
    line: int
    col: int

    def __repr__(self) -> str:
        return f"Token({self.type.name}, {self.value!r}, {self.line}:{self.col})"


class LexError(Exception):
    pass


# Order matters: longer/more-specific patterns first
_RULES: list[tuple[str, TokenType | None]] = [
    (r"#[^\n]*",         None),            # comment — discard
    (r"[ \t]+",          None),            # horizontal whitespace — discard
    (r"\n",              TokenType.NEWLINE),
    (r"c\d+",            TokenType.CANDLE_REF),
    (r"<=|>=|!=",        TokenType.OP),
    (r"[<>=]",           TokenType.OP),
    (r"\d+\.\d+",        TokenType.NUMBER),
    (r"\d+",             TokenType.NUMBER),
    (r"[A-Za-z_]\w*",   TokenType.IDENTIFIER),
    (r"\.",              TokenType.DOT),
    (r"\(",              TokenType.LPAREN),
    (r"\)",              TokenType.RPAREN),
    (r",",               TokenType.COMMA),
]

_MASTER = re.compile(
    "|".join(f"(?P<g{i}>{pat})" for i, (pat, _) in enumerate(_RULES))
)
_TYPE_MAP = [tt for _, tt in _RULES]


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    line = 1
    line_start = 0

    for m in _MASTER.finditer(source):
        group_idx = next(i for i, g in enumerate(m.groups()) if g is not None)
        tt = _TYPE_MAP[group_idx]
        value = m.group()
        col = m.start() - line_start + 1

        if tt is None:
            # discarded token (comment, whitespace)
            pass
        elif tt == TokenType.NEWLINE:
            # collapse consecutive newlines into one
            if not tokens or tokens[-1].type != TokenType.NEWLINE:
                tokens.append(Token(TokenType.NEWLINE, "\\n", line, col))
            line += 1
            line_start = m.end()
        else:
            tokens.append(Token(tt, value, line, col))

    # strip leading/trailing newlines
    while tokens and tokens[0].type == TokenType.NEWLINE:
        tokens.pop(0)
    while tokens and tokens[-1].type == TokenType.NEWLINE:
        tokens.pop()

    tokens.append(Token(TokenType.EOF, "", line, 0))

    # check for unmatched characters — record every position covered by a match
    matched_positions: set[int] = set()
    for m in _MASTER.finditer(source):
        matched_positions.update(range(m.start(), m.end()))
    for i, ch in enumerate(source):
        if i not in matched_positions and ch not in ("\r",):
            col = i - source.rfind("\n", 0, i)
            raise LexError(f"Unexpected character {ch!r} at line {source[:i].count(chr(10)) + 1}:{col}")

    return tokens
