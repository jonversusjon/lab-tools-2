from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Make backend/ importable when alembic CLI runs env.py from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base  # noqa: E402
from database import get_db_url  # noqa: E402
import models  # noqa: F401, E402  # populate Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Resolve URL from DATABASE_URL at runtime; alembic.ini intentionally leaves it blank.
config.set_main_option("sqlalchemy.url", get_db_url())

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
