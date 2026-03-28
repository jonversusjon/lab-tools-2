from __future__ import annotations

import csv
import io
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)

# CSV column header mapping (Notion export headers -> internal field names)
CSV_COLUMN_MAP = {
    "Antibody": "name",
    "Catalog No.": "catalog_number",
    "Cojugate": "conjugate_raw",  # Note: typo is from the source
    "Confirmed we have it": "confirmed_in_stock",
    "Date Received": "date_received",
    "Flow Dilution": "flow_dilution",
    "Host Species": "host_species_raw",
    "ICC/IF Dilution": "icc_if_dilution",
    "Manufacturer": "manufacturer",
    "Notes": "notes",
    "Reacts with": "reacts_with",
    "Storage Temperature": "storage_temp",
    "Validation": "validation_notes",
    "WB Dilution": "wb_dilution",
    "website": "website",
    "where?": "physical_location",
}

# Fields that are flagged as "missing" if empty (useful for panel design)
NOTABLE_MISSING_FIELDS = [
    "host_species",
    "manufacturer",
    "catalog_number",
    "conjugate",
    "flow_dilution",
    "storage_temp",
]

# Known conjugate patterns found in Host Species field
_CONJUGATE_PATTERN = re.compile(
    r"^(AF\d+|BV\d+|FITC|PE|APC|PerCP|Cy\d+)\s+Conjugated$",
    re.IGNORECASE,
)

# Known isotype patterns
_ISOTYPE_PATTERN = re.compile(
    r"^(?:Human\s+)?IgG\d?[a-z]?$",
    re.IGNORECASE,
)


def parse_host_species(raw: str | None) -> dict:
    """Parse the Host Species field into host, conjugate, and isotype.

    The Host Species field is messy — it may contain conjugate info
    (e.g. "FITC Conjugated, IgG1, Mouse") and isotype info mixed in.

    Returns dict with keys: host_species, conjugate, isotype
    """
    result = {
        "host_species": None,
        "conjugate": None,
        "isotype": None,
    }

    if not raw or raw.strip().lower() in ("none", ""):
        return result

    tokens = [t.strip() for t in raw.split(",") if t.strip()]
    host_parts = []

    for token in tokens:
        # Check for conjugate pattern
        conj_match = _CONJUGATE_PATTERN.match(token)
        if conj_match:
            result["conjugate"] = conj_match.group(1).upper()
            continue

        # Also check for "<name> Conjugated" without matching the regex above
        if token.lower().endswith("conjugated"):
            prefix = token.rsplit(" ", 1)[0].strip()
            if prefix:
                result["conjugate"] = prefix
            continue

        # Check for isotype pattern
        if _ISOTYPE_PATTERN.match(token):
            result["isotype"] = token
            continue

        # Everything else is host species
        host_parts.append(token)

    if host_parts:
        host = " ".join(host_parts).strip()
        if host.lower() not in ("none", ""):
            result["host_species"] = host

    return result


def _parse_date(raw: str | None) -> str | None:
    """Parse human-readable date string to ISO format."""
    if not raw or not raw.strip():
        return None

    raw = raw.strip()
    formats = [
        "%B %d, %Y",      # "March 3, 2022"
        "%b %d, %Y",      # "Mar 3, 2022"
        "%m/%d/%Y",        # "03/03/2022"
        "%Y-%m-%d",        # already ISO
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue

    logger.warning("Unparseable date: %s", raw)
    return raw  # Return as-is if we can't parse it


def _parse_reacts_with(raw: str | None) -> list[str]:
    """Parse comma-separated reactivity string into a list."""
    if not raw or not raw.strip():
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _parse_confirmed(raw: str | None) -> bool:
    """Parse 'Yes'/'No' string to bool."""
    if not raw:
        return False
    return raw.strip().lower() == "yes"


def parse_csv_row(row: dict, row_index: int) -> dict:
    """Parse a single CSV row into our internal format.

    Returns a dict with keys:
      - parsed: dict of parsed fields
      - missing_fields: list of notable missing fields
      - warnings: list of warning strings
      - error: str or None if row is unparseable
    """
    warnings = []

    # Map CSV columns to internal names
    mapped = {}
    for csv_col, internal_name in CSV_COLUMN_MAP.items():
        val = row.get(csv_col, "")
        if isinstance(val, str):
            val = val.strip()
        mapped[internal_name] = val if val else None

    # Check required field
    name = mapped.get("name")
    if not name:
        return {
            "parsed": None,
            "missing_fields": [],
            "warnings": [],
            "error": "Missing required 'Antibody' column value",
        }

    # Parse host species (the messy one)
    host_parsed = parse_host_species(mapped.get("host_species_raw"))

    # Merge conjugate: explicit Cojugate field takes precedence
    conjugate_raw = mapped.get("conjugate_raw")
    conjugate = conjugate_raw if conjugate_raw else host_parsed["conjugate"]

    # Parse other fields
    parsed = {
        "name": name,
        "catalog_number": mapped.get("catalog_number"),
        "conjugate": conjugate,
        "host_species": host_parsed["host_species"],
        "isotype": host_parsed["isotype"] or None,
        "manufacturer": mapped.get("manufacturer"),
        "confirmed_in_stock": _parse_confirmed(mapped.get("confirmed_in_stock")),
        "date_received": _parse_date(mapped.get("date_received")),
        "flow_dilution": mapped.get("flow_dilution"),
        "icc_if_dilution": mapped.get("icc_if_dilution"),
        "wb_dilution": mapped.get("wb_dilution"),
        "reacts_with": _parse_reacts_with(mapped.get("reacts_with")),
        "storage_temp": mapped.get("storage_temp"),
        "validation_notes": mapped.get("validation_notes"),
        "notes": mapped.get("notes"),
        "website": mapped.get("website"),
        "physical_location": mapped.get("physical_location"),
    }

    # Determine missing notable fields
    missing_fields = []
    for field in NOTABLE_MISSING_FIELDS:
        val = parsed.get(field)
        if val is None or val == "" or val == []:
            missing_fields.append(field)

    # Log unparseable host species
    raw_host = mapped.get("host_species_raw")
    if raw_host and not host_parsed["host_species"] and not host_parsed["conjugate"]:
        warnings.append("Could not parse host species: %s" % raw_host)

    return {
        "parsed": parsed,
        "missing_fields": missing_fields,
        "warnings": warnings,
        "error": None,
    }


def parse_csv_file(file_content: bytes) -> list[dict]:
    """Parse a full CSV file into a list of row results.

    Handles UTF-8 BOM encoding from Notion exports.
    Returns list of dicts from parse_csv_row.
    """
    text = file_content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    results = []

    for idx, row in enumerate(reader):
        result = parse_csv_row(row, idx)
        result["csv_row_index"] = idx
        results.append(result)

    return results
