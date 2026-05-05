from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy import text

from database import DEFAULT_DB_URL
from database import get_db_path
from database import get_db_url


# ── get_db_url ────────────────────────────────────────────────────────────────

def test_get_db_url_default(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert get_db_url() == DEFAULT_DB_URL


def test_get_db_url_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///custom.db")
    assert get_db_url() == "sqlite:///custom.db"


def test_get_db_url_empty_string_falls_back(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    assert get_db_url() == DEFAULT_DB_URL


# ── get_db_path ───────────────────────────────────────────────────────────────

def test_get_db_path_relative(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///foo.db")
    result = get_db_path()
    assert result.is_absolute()
    assert result.name == "foo.db"


def test_get_db_path_absolute(monkeypatch, tmp_path):
    abs_path = str(tmp_path / "foo.db")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + abs_path)
    result = get_db_path()
    assert result == Path(abs_path)


def test_get_db_path_rejects_in_memory(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    with pytest.raises(ValueError, match="in-memory"):
        get_db_path()


def test_get_db_path_rejects_non_sqlite(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    with pytest.raises(ValueError, match="sqlite:///"):
        get_db_path()


# ── WAL pragma ────────────────────────────────────────────────────────────────

def test_wal_and_fk_pragmas_on_file_db(tmp_path):
    """A fresh file-based DB with the production connect listener gets WAL mode and FK enforcement."""
    db_file = tmp_path / "test_wal.db"
    eng = create_engine(
        "sqlite:///" + str(db_file),
        connect_args={"check_same_thread": False},
    )

    # Mirror the production connect listener from database.py
    @event.listens_for(eng, "connect")
    def _pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

    with eng.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode;")).scalar()
        fk = conn.execute(text("PRAGMA foreign_keys;")).scalar()

    assert mode == "wal", "journal_mode must be 'wal' after pragma listener fires"
    assert fk == 1, "foreign_keys must be ON after pragma listener fires"


def test_wal_mode_persists_in_db_header(tmp_path):
    """WAL mode set via pragma persists in the DB file header across reconnects."""
    db_file = tmp_path / "test_persist.db"

    # First connection sets WAL
    c1 = __import__("sqlite3").connect(str(db_file))
    c1.execute("PRAGMA journal_mode=WAL;")
    c1.close()

    # Second connection reads mode without setting it
    c2 = __import__("sqlite3").connect(str(db_file))
    result = c2.execute("PRAGMA journal_mode;").fetchone()
    c2.close()

    assert result[0] == "wal", "WAL mode should persist in DB header across reconnects"


# ── startup path check ────────────────────────────────────────────────────────

def test_check_db_startup_raises_when_missing_and_no_env(tmp_path, monkeypatch):
    """_check_db_startup raises RuntimeError when DB missing and LAB_INIT_DB not set."""
    from main import _check_db_startup

    missing_db = tmp_path / "panels.db"  # does not exist
    monkeypatch.delenv("LAB_INIT_DB", raising=False)

    with pytest.raises(RuntimeError, match="LAB_INIT_DB"):
        _check_db_startup(missing_db)


def test_check_db_startup_passes_with_init_flag(tmp_path, monkeypatch):
    """_check_db_startup does not raise when DB missing but LAB_INIT_DB=1."""
    from main import _check_db_startup

    missing_db = tmp_path / "panels.db"  # does not exist
    monkeypatch.setenv("LAB_INIT_DB", "1")

    _check_db_startup(missing_db)  # must not raise


def test_check_db_startup_passes_when_db_exists(tmp_path, monkeypatch):
    """_check_db_startup does not raise when DB exists."""
    from main import _check_db_startup

    existing_db = tmp_path / "panels.db"
    existing_db.touch()
    monkeypatch.delenv("LAB_INIT_DB", raising=False)

    _check_db_startup(existing_db)  # must not raise


# ── permission warning ────────────────────────────────────────────────────────

def test_check_db_startup_warns_on_world_readable(tmp_path, monkeypatch, caplog):
    """_check_db_startup logs a warning when DB is world-readable (mode 644)."""
    from main import _check_db_startup
    import logging

    db = tmp_path / "panels.db"
    db.touch()
    os.chmod(db, 0o644)
    monkeypatch.delenv("LAB_INIT_DB", raising=False)

    with caplog.at_level(logging.WARNING, logger="main"):
        _check_db_startup(db)

    assert any("permissions" in r.message for r in caplog.records), (
        "Expected a permissions warning for 644 mode"
    )


def test_check_db_startup_no_warning_on_600(tmp_path, monkeypatch, caplog):
    """_check_db_startup does NOT warn when DB has strict 600 permissions."""
    from main import _check_db_startup
    import logging

    db = tmp_path / "panels.db"
    db.touch()
    os.chmod(db, 0o600)
    monkeypatch.delenv("LAB_INIT_DB", raising=False)

    with caplog.at_level(logging.WARNING, logger="main"):
        _check_db_startup(db)

    assert not any("permissions" in r.message for r in caplog.records), (
        "No permissions warning expected for 600 mode"
    )


# ── stray DB detection ────────────────────────────────────────────────────────

def test_check_db_startup_logs_error_for_stray_db(tmp_path, monkeypatch, caplog):
    """_check_db_startup logs an error when a stray panels.db exists one level up."""
    from main import _check_db_startup
    import logging

    # Simulate: real DB at tmp_path/backend/panels.db, stray at tmp_path/panels.db
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    real_db = backend_dir / "panels.db"
    real_db.touch()
    os.chmod(real_db, 0o600)

    stray_db = tmp_path / "panels.db"
    stray_db.touch()

    monkeypatch.delenv("LAB_INIT_DB", raising=False)

    with caplog.at_level(logging.ERROR, logger="main"):
        _check_db_startup(real_db)

    assert any("Stray" in r.message for r in caplog.records), (
        "Expected an error log about the stray panels.db"
    )
