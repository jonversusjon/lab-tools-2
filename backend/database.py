from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import sessionmaker

DEFAULT_DB_URL = "sqlite:///panels.db"


def get_db_url() -> str:
    """Return the SQLAlchemy connection URL from DATABASE_URL env var, or the default."""
    return os.environ.get("DATABASE_URL", DEFAULT_DB_URL).strip() or DEFAULT_DB_URL


def get_db_path() -> Path:
    """Return the filesystem path for the configured SQLite DB.

    Raises ValueError for non-sqlite:/// URLs.
    """
    url = get_db_url()
    if url.startswith("sqlite:///"):
        remainder = url[len("sqlite:///"):]
        if remainder.startswith("/"):
            return Path(remainder)
        return Path(remainder).resolve()
    if url == "sqlite://":
        raise ValueError("DATABASE_URL is in-memory (sqlite://); not supported outside tests")
    raise ValueError("DATABASE_URL must use sqlite:/// scheme, got: " + url)


engine = create_engine(
    get_db_url(),
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
