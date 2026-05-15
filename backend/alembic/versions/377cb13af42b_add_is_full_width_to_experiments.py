"""add is_full_width to experiments

Revision ID: 377cb13af42b
Revises: f8f4eb71dcac
Create Date: 2026-05-14 22:44:19.258435

Adds the ``is_full_width`` boolean column to ``experiments``.

Existing rows get ``server_default='1'`` so pre-migration experiments
keep their familiar full-width visual behavior (the global toggle that
was reverted in commit 21453e0 effectively rendered everything full-
width). After the column is added the server_default is dropped so
future inserts use the Python-level default (``False``); the API path
always provides an explicit value via Pydantic anyway.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '377cb13af42b'
down_revision: Union[str, Sequence[str], None] = 'f8f4eb71dcac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_full_width",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )

    with op.batch_alter_table("experiments") as batch_op:
        batch_op.alter_column("is_full_width", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.drop_column("is_full_width")
