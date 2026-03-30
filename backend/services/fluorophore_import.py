from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Fluorophore
from models import FluorophoreSpectrum
from schemas import FluorophoreImportDuplicate
from schemas import FluorophoreImportError
from schemas import FluorophoreImportItem
from schemas import FluorophoreImportPreview


# ---- CSV column mapping ----
COLUMN_MAP: dict[str, str] = {
    "name": "name",
    "fluorophore": "name",
    "fluorophore name": "name",
    "dye": "name",
    "dye name": "name",
    "type": "fluor_type",
    "fluor_type": "fluor_type",
    "fluorophore type": "fluor_type",
    "ex_max": "ex_max_nm",
    "ex_max_nm": "ex_max_nm",
    "excitation max": "ex_max_nm",
    "excitation maximum": "ex_max_nm",
    "excitation peak": "ex_max_nm",
    "em_max": "em_max_nm",
    "em_max_nm": "em_max_nm",
    "emission max": "em_max_nm",
    "emission maximum": "em_max_nm",
    "emission peak": "em_max_nm",
    "ext_coeff": "ext_coeff",
    "extinction coefficient": "ext_coeff",
    "ec": "ext_coeff",
    "molar extinction": "ext_coeff",
    "qy": "qy",
    "quantum yield": "qy",
    "lifetime": "lifetime_ns",
    "lifetime_ns": "lifetime_ns",
    "fluorescence lifetime": "lifetime_ns",
    "oligomerization": "oligomerization",
    "switch_type": "switch_type",
}

FLOAT_FIELDS = {"ex_max_nm", "em_max_nm", "ext_coeff", "qy", "lifetime_ns"}


def _normalize_header(header: str) -> str:
    return header.strip().lower().replace("-", "_").replace("(", "").replace(")", "")


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s == "--" or s == "N/A" or s.lower() == "none":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_csv(content: str, db: Session) -> FluorophoreImportPreview:
    """Parse a CSV string into a fluorophore import preview."""
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return FluorophoreImportPreview(
            new_items=[],
            duplicates=[],
            parse_errors=[FluorophoreImportError(row_number=0, error="No headers found in CSV")],
            format_detected="csv",
            total_rows=0,
        )

    header_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        normalized = _normalize_header(raw_header)
        if normalized in COLUMN_MAP:
            header_map[raw_header] = COLUMN_MAP[normalized]

    if "name" not in header_map.values():
        return FluorophoreImportPreview(
            new_items=[],
            duplicates=[],
            parse_errors=[FluorophoreImportError(
                row_number=0,
                error="CSV must have a 'name' (or 'fluorophore' / 'dye') column",
            )],
            format_detected="csv",
            total_rows=0,
        )

    existing_names = {
        row[0].lower()
        for row in db.query(Fluorophore.name).all()
    }

    new_items: list[FluorophoreImportItem] = []
    duplicates: list[FluorophoreImportDuplicate] = []
    parse_errors: list[FluorophoreImportError] = []
    seen_names: set[str] = set()
    row_num = 0

    for row in reader:
        row_num += 1
        try:
            mapped: dict[str, Any] = {}
            for csv_col, internal_field in header_map.items():
                val = row.get(csv_col, "").strip()
                if internal_field in FLOAT_FIELDS:
                    mapped[internal_field] = _safe_float(val)
                else:
                    mapped[internal_field] = val if val else None

            name = mapped.get("name")
            if not name:
                parse_errors.append(FluorophoreImportError(
                    row_number=row_num,
                    error="Missing fluorophore name",
                    raw_data=dict(row),
                ))
                continue

            name_lower = name.lower()
            warnings: list[str] = []

            if name_lower in existing_names:
                existing = db.query(Fluorophore).filter(
                    func.lower(Fluorophore.name) == name.lower()
                ).first()
                duplicates.append(FluorophoreImportDuplicate(
                    row_number=row_num,
                    name=name,
                    existing_id=existing.id if existing else "unknown",
                ))
                continue

            if name_lower in seen_names:
                warnings.append("Duplicate name within file — only the first occurrence will be imported")
                continue
            seen_names.add(name_lower)

            ex_max = mapped.get("ex_max_nm")
            em_max = mapped.get("em_max_nm")
            if ex_max is not None and (ex_max < 200 or ex_max > 1000):
                warnings.append(
                    "Excitation max %.0f nm is outside typical range (200-1000)" % ex_max
                )
            if em_max is not None and (em_max < 200 or em_max > 1000):
                warnings.append(
                    "Emission max %.0f nm is outside typical range (200-1000)" % em_max
                )
            if ex_max is not None and em_max is not None and em_max < ex_max:
                warnings.append("Emission max is less than excitation max — verify values")

            qy = mapped.get("qy")
            if qy is not None and (qy < 0 or qy > 1):
                warnings.append("Quantum yield %.2f is outside valid range (0-1)" % qy)

            new_items.append(FluorophoreImportItem(
                name=name,
                fluor_type=mapped.get("fluor_type"),
                ex_max_nm=ex_max,
                em_max_nm=em_max,
                ext_coeff=mapped.get("ext_coeff"),
                qy=qy,
                lifetime_ns=mapped.get("lifetime_ns"),
                oligomerization=mapped.get("oligomerization"),
                switch_type=mapped.get("switch_type"),
                spectra=None,
                row_number=row_num,
                warnings=warnings,
            ))

        except Exception as exc:
            parse_errors.append(FluorophoreImportError(
                row_number=row_num,
                error=str(exc),
                raw_data=dict(row),
            ))

    return FluorophoreImportPreview(
        new_items=new_items,
        duplicates=duplicates,
        parse_errors=parse_errors,
        format_detected="csv",
        total_rows=row_num,
    )


def parse_json(content: str, db: Session) -> FluorophoreImportPreview:
    """Parse a JSON string into a fluorophore import preview.

    Accepts two JSON shapes:
    1. Array of objects: [{"name": "EGFP", "ex_max_nm": 488, ...}, ...]
    2. Object with "fluorophores" key: {"fluorophores": [...]}
    """
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        return FluorophoreImportPreview(
            new_items=[],
            duplicates=[],
            parse_errors=[FluorophoreImportError(
                row_number=0,
                error="Invalid JSON: %s" % str(exc),
            )],
            format_detected="json",
            total_rows=0,
        )

    if isinstance(data, dict):
        if "fluorophores" in data:
            items_raw = data["fluorophores"]
        else:
            items_raw = [data]
    elif isinstance(data, list):
        items_raw = data
    else:
        return FluorophoreImportPreview(
            new_items=[],
            duplicates=[],
            parse_errors=[FluorophoreImportError(
                row_number=0,
                error="JSON must be an array of fluorophore objects or an object with a 'fluorophores' key",
            )],
            format_detected="json",
            total_rows=0,
        )

    existing_names = {
        row[0].lower()
        for row in db.query(Fluorophore.name).all()
    }

    new_items: list[FluorophoreImportItem] = []
    duplicates: list[FluorophoreImportDuplicate] = []
    parse_errors: list[FluorophoreImportError] = []
    seen_names: set[str] = set()

    for idx, obj in enumerate(items_raw):
        row_num = idx + 1
        if not isinstance(obj, dict):
            parse_errors.append(FluorophoreImportError(
                row_number=row_num,
                error="Expected an object, got %s" % type(obj).__name__,
            ))
            continue

        name = obj.get("name")
        if not name or not isinstance(name, str):
            parse_errors.append(FluorophoreImportError(
                row_number=row_num,
                error="Missing or invalid 'name' field",
                raw_data=obj,
            ))
            continue

        name = name.strip()
        name_lower = name.lower()
        warnings: list[str] = []

        if name_lower in existing_names:
            existing = db.query(Fluorophore).filter(
                func.lower(Fluorophore.name) == name.lower()
            ).first()
            duplicates.append(FluorophoreImportDuplicate(
                row_number=row_num,
                name=name,
                existing_id=existing.id if existing else "unknown",
            ))
            continue

        if name_lower in seen_names:
            warnings.append("Duplicate name within file — only the first occurrence will be imported")
            continue
        seen_names.add(name_lower)

        ex_max = _safe_float(obj.get("ex_max_nm") or obj.get("ex_max"))
        em_max = _safe_float(obj.get("em_max_nm") or obj.get("em_max"))
        qy = _safe_float(obj.get("qy") or obj.get("quantum_yield"))

        if ex_max is not None and (ex_max < 200 or ex_max > 1000):
            warnings.append(
                "Excitation max %.0f nm is outside typical range (200-1000)" % ex_max
            )
        if em_max is not None and (em_max < 200 or em_max > 1000):
            warnings.append(
                "Emission max %.0f nm is outside typical range (200-1000)" % em_max
            )
        if ex_max is not None and em_max is not None and em_max < ex_max:
            warnings.append("Emission max is less than excitation max — verify values")
        if qy is not None and (qy < 0 or qy > 1):
            warnings.append("Quantum yield %.2f is outside valid range (0-1)" % qy)

        spectra: dict[str, list[list[float]]] | None = None
        raw_spectra = obj.get("spectra")
        if raw_spectra and isinstance(raw_spectra, dict):
            spectra = {}
            for spec_type, spec_data in raw_spectra.items():
                spec_type_upper = spec_type.upper()
                if spec_type_upper not in ("EX", "EM", "AB", "A_2P"):
                    warnings.append("Unknown spectrum type '%s' — skipping" % spec_type)
                    continue
                if not isinstance(spec_data, list):
                    warnings.append("Spectrum '%s' is not an array — skipping" % spec_type)
                    continue
                parsed_points: list[list[float]] = []
                for point in spec_data:
                    if isinstance(point, (list, tuple)) and len(point) >= 2:
                        wl = _safe_float(point[0])
                        intensity = _safe_float(point[1])
                        if wl is not None and intensity is not None:
                            parsed_points.append([wl, intensity])
                if parsed_points:
                    spectra[spec_type_upper] = parsed_points
            if not spectra:
                spectra = None

        new_items.append(FluorophoreImportItem(
            name=name,
            fluor_type=obj.get("fluor_type") or obj.get("type"),
            ex_max_nm=ex_max,
            em_max_nm=em_max,
            ext_coeff=_safe_float(obj.get("ext_coeff") or obj.get("extinction_coefficient")),
            qy=qy,
            lifetime_ns=_safe_float(obj.get("lifetime_ns") or obj.get("lifetime")),
            oligomerization=obj.get("oligomerization"),
            switch_type=obj.get("switch_type"),
            spectra=spectra,
            row_number=row_num,
            warnings=warnings,
        ))

    return FluorophoreImportPreview(
        new_items=new_items,
        duplicates=duplicates,
        parse_errors=parse_errors,
        format_detected="json",
        total_rows=len(items_raw),
    )


def confirm_import(
    items: list[FluorophoreImportItem],
    db: Session,
) -> tuple[int, int, list[str]]:
    """Create fluorophores (and optional spectra) from confirmed import items.

    Returns (created_count, skipped_count, errors).
    """
    created = 0
    skipped = 0
    errors: list[str] = []

    to_create: list[tuple[FluorophoreImportItem, str]] = []

    for item in items:
        exists = db.query(Fluorophore).filter(
            func.lower(Fluorophore.name) == item.name.strip().lower()
        ).first()
        if exists:
            skipped += 1
            continue

        slug = item.name.lower().replace(" ", "-").replace("_", "-")
        slug = "".join(c for c in slug if c.isalnum() or c == "-")
        if not slug:
            slug = str(uuid.uuid4())

        candidate_id = slug
        suffix = 0
        while db.query(Fluorophore).filter(
            Fluorophore.id == candidate_id
        ).first():
            suffix += 1
            candidate_id = "%s-%d" % (slug, suffix)

        if any(cid == candidate_id for _, cid in to_create):
            skipped += 1
            continue

        to_create.append((item, candidate_id))

    for item, candidate_id in to_create:
        try:
            has_spectra = bool(item.spectra and any(item.spectra.values()))
            source = "json-import" if item.spectra else "csv-import"

            fl = Fluorophore(
                id=candidate_id,
                name=item.name.strip(),
                fluor_type=item.fluor_type,
                source=source,
                ex_max_nm=item.ex_max_nm,
                em_max_nm=item.em_max_nm,
                ext_coeff=item.ext_coeff,
                qy=item.qy,
                lifetime_ns=item.lifetime_ns,
                oligomerization=item.oligomerization,
                switch_type=item.switch_type,
                has_spectra=has_spectra,
                is_favorite=False,
            )
            db.add(fl)

            if item.spectra:
                for spec_type, points in item.spectra.items():
                    for wl, intensity in points:
                        db.add(FluorophoreSpectrum(
                            fluorophore_id=candidate_id,
                            spectrum_type=spec_type,
                            wavelength_nm=wl,
                            intensity=intensity,
                        ))

            created += 1

        except Exception as exc:
            errors.append("%s: %s" % (item.name, str(exc)))

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        errors.append("Commit failed: %s" % str(exc))
        created = 0

    return created, skipped, errors
