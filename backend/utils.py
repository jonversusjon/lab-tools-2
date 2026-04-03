from __future__ import annotations

import re


def tokenize_search(search: str) -> list[str]:
    """Split a search string into normalized tokens for AND-style filtering.

    "Alexa 700" → ["alexa", "700"]
    "anti-Mouse AF555" → ["antimouse", "af555"]
    """
    cleaned = re.sub(r'[-.()/]', '', search.lower())
    return [t for t in cleaned.split() if t]
