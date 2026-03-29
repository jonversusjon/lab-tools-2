from __future__ import annotations

import re


def parse_dilution(text: str | None) -> int | None:
    """Parse messy dilution text into the denominator N of 1:N.

    Supports: "1:100", "1/200", "1 to 100", "100", "1:50-1:100" (takes lower N),
    "1:100 (flow)" (strips parenthetical notes). Returns None if unparseable.
    """
    if not text or not text.strip():
        return None
    raw = text.strip()
    # Strip parenthetical notes
    cleaned = re.sub(r"\s*\(.*?\)\s*", "", raw).strip()

    # Range format: "1:50-1:100" or "1:50 - 1:100"
    range_match = re.search(r"1\s*[:/]\s*(\d+)\s*[-\u2013]\s*1\s*[:/]\s*(\d+)", cleaned)
    if range_match:
        a = int(range_match.group(1))
        b = int(range_match.group(2))
        return min(a, b)

    # Standard: "1:N", "1/N"
    std_match = re.search(r"1\s*[:/]\s*(\d+)", cleaned)
    if std_match:
        return int(std_match.group(1))

    # "1 to N"
    to_match = re.search(r"1\s+to\s+(\d+)", cleaned, re.IGNORECASE)
    if to_match:
        return int(to_match.group(1))

    # Bare number: "100"
    bare_match = re.fullmatch(r"(\d+)", cleaned)
    if bare_match:
        return int(bare_match.group(1))

    return None
