"""migrate location listtypes to unified locations

Revision ID: f8f4eb71dcac
Revises: 0bd3126639f0
Create Date: 2026-05-14 22:38:06.226352

Data migration. Merges existing ``instrument_location`` and
``microscope_location`` list_entries rows into the new unified
``locations`` list_type, with case-insensitive dedup. The first
occurrence (ordered by list_type, sort_order, then value) wins;
duplicate spellings collapse, the canonical row keeps the original
casing of the first occurrence.

Downgrade is inherently lossy: the original split between instrument
and microscope locations cannot be reconstructed from the unified
list. The downgrade dumps every ``locations`` row back into
``instrument_location`` (so at least the values survive) and leaves
``microscope_location`` empty.
"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8f4eb71dcac'
down_revision: Union[str, Sequence[str], None] = '0bd3126639f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, list_type, value, sort_order FROM list_entries "
            "WHERE list_type IN ('instrument_location', 'microscope_location') "
            "ORDER BY list_type, sort_order, value"
        )
    ).fetchall()

    canonical: dict[str, dict[str, object]] = {}
    for row in rows:
        key = (row.value or "").strip().lower()
        if not key:
            continue
        if key not in canonical:
            canonical[key] = {
                "id": str(uuid.uuid4()),
                "list_type": "locations",
                "value": row.value,
                "sort_order": row.sort_order or 0,
            }

    if canonical:
        # If a 'locations' row already exists with the same lowercased value
        # (e.g. user re-created it manually after Phase 1 introduced the new
        # listType), skip — DB unique constraint would reject it anyway.
        existing_locations = {
            (row.value or "").strip().lower()
            for row in bind.execute(
                sa.text(
                    "SELECT value FROM list_entries WHERE list_type = 'locations'"
                )
            ).fetchall()
        }

        to_insert = [
            row for key, row in canonical.items() if key not in existing_locations
        ]

        if to_insert:
            # Use bulk insert so each row's sort_order is preserved as-is.
            list_entries = sa.table(
                "list_entries",
                sa.column("id", sa.String),
                sa.column("list_type", sa.String),
                sa.column("value", sa.String),
                sa.column("sort_order", sa.Integer),
            )
            op.bulk_insert(list_entries, to_insert)

    op.execute(
        sa.text(
            "DELETE FROM list_entries "
            "WHERE list_type IN ('instrument_location', 'microscope_location')"
        )
    )


def downgrade() -> None:
    """Best-effort downgrade.

    Inherently lossy: the original split between instrument and microscope
    locations is not recoverable from the unified list. All ``locations``
    rows go back into ``instrument_location``; ``microscope_location``
    stays empty.
    """
    op.execute(
        sa.text(
            "UPDATE list_entries SET list_type = 'instrument_location' "
            "WHERE list_type = 'locations'"
        )
    )
