from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine
from sqlalchemy import inspect

from database import Base


BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _alembic_config(db_url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def _dump_schema(engine) -> dict:
    """Return a structured, ordering-independent representation of the schema.

    Uses SQLAlchemy's Inspector so textual differences (paren placement around
    CURRENT_TIMESTAMP, FK declaration order, etc.) don't cause spurious diffs.
    The schema-level alembic_version table is excluded.
    """
    inspector = inspect(engine)
    out: dict = {}
    for table_name in sorted(inspector.get_table_names()):
        if table_name == "alembic_version":
            continue
        cols = []
        for c in inspector.get_columns(table_name):
            cols.append((
                c["name"],
                str(c["type"]),
                bool(c["nullable"]),
                # Normalize default: Alembic emits "(CURRENT_TIMESTAMP)" while
                # create_all() emits "CURRENT_TIMESTAMP". Functionally identical.
                _normalize_default(c.get("default")),
            ))
        fks = sorted(
            [
                (
                    fk["referred_table"],
                    tuple(fk["constrained_columns"]),
                    tuple(fk["referred_columns"]),
                    (fk.get("options") or {}).get("ondelete"),
                )
                for fk in inspector.get_foreign_keys(table_name)
            ]
        )
        uqs = sorted(
            [
                (uq.get("name"), tuple(uq["column_names"]))
                for uq in inspector.get_unique_constraints(table_name)
            ]
        )
        idxs = sorted(
            [
                (idx["name"], tuple(idx["column_names"]), bool(idx["unique"]))
                for idx in inspector.get_indexes(table_name)
            ]
        )
        pk = inspector.get_pk_constraint(table_name)
        pk_cols = tuple(pk.get("constrained_columns") or ())
        out[table_name] = {
            "columns": cols,
            "foreign_keys": fks,
            "unique_constraints": uqs,
            "indexes": idxs,
            "primary_key": pk_cols,
        }
    return out


def _normalize_default(default):
    if default is None:
        return None
    s = str(default).strip()
    # Strip optional outer parens around server defaults: (CURRENT_TIMESTAMP) -> CURRENT_TIMESTAMP
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1].strip()
    return s.upper() if s.upper() in ("CURRENT_TIMESTAMP",) else s


@pytest.fixture
def alembic_db_url(tmp_path, monkeypatch):
    db_path = tmp_path / "alembic_test.db"
    url = "sqlite:///" + str(db_path)
    # env.py reads DATABASE_URL via database.get_db_url()
    monkeypatch.setenv("DATABASE_URL", url)
    return url


def test_alembic_baseline_matches_create_all(tmp_path, monkeypatch):
    """Apply alembic upgrade head to one fresh DB and create_all() to another;
    the two schemas must be byte-identical (modulo whitespace)."""
    alembic_db = tmp_path / "alembic.db"
    create_all_db = tmp_path / "create_all.db"
    alembic_url = "sqlite:///" + str(alembic_db)
    create_all_url = "sqlite:///" + str(create_all_db)

    # Path 1: alembic upgrade head
    monkeypatch.setenv("DATABASE_URL", alembic_url)
    cfg = _alembic_config(alembic_url)
    command.upgrade(cfg, "head")

    # Path 2: create_all
    create_all_engine = create_engine(create_all_url)
    Base.metadata.create_all(bind=create_all_engine)

    alembic_engine = create_engine(alembic_url)
    alembic_dump = _dump_schema(alembic_engine)
    create_all_dump = _dump_schema(create_all_engine)

    if alembic_dump != create_all_dump:
        diffs = []
        all_tables = sorted(set(alembic_dump) | set(create_all_dump))
        for tname in all_tables:
            a = alembic_dump.get(tname)
            c = create_all_dump.get(tname)
            if a != c:
                diffs.append("--- " + tname + " ---")
                diffs.append("ALEMBIC:    " + repr(a))
                diffs.append("CREATE_ALL: " + repr(c))
        raise AssertionError(
            "Alembic baseline and create_all schemas diverge.\n" + "\n".join(diffs)
        )


def test_alembic_upgrade_head_idempotent(tmp_path, monkeypatch):
    """Running alembic upgrade head twice on the same DB produces no further changes."""
    db = tmp_path / "idem.db"
    url = "sqlite:///" + str(db)
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = _alembic_config(url)

    command.upgrade(cfg, "head")
    engine = create_engine(url)
    first_dump = _dump_schema(engine)

    command.upgrade(cfg, "head")
    second_dump = _dump_schema(engine)

    assert first_dump == second_dump


def test_alembic_stamp_head_on_existing_db(tmp_path, monkeypatch):
    """Adopting Alembic on an existing create_all DB: stamp head succeeds and
    populates alembic_version with the head revision."""
    db = tmp_path / "adopted.db"
    url = "sqlite:///" + str(db)
    monkeypatch.setenv("DATABASE_URL", url)

    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        assert ctx.get_current_revision() is None

    cfg = _alembic_config(url)
    command.stamp(cfg, "head")

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        current = ctx.get_current_revision()
    script = ScriptDirectory.from_config(cfg)
    assert current == script.get_current_head()


def test_alembic_current_reports_head_after_upgrade(tmp_path, monkeypatch):
    db = tmp_path / "current.db"
    url = "sqlite:///" + str(db)
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = _alembic_config(url)

    command.upgrade(cfg, "head")
    engine = create_engine(url)

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        current = ctx.get_current_revision()
    script = ScriptDirectory.from_config(cfg)
    assert current == script.get_current_head()
