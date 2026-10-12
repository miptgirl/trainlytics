"""Template notes drop migration (d4e5f6a7b8c9), run directly on SQLite.

The full Alembic chain has Postgres-only steps, so this binds the migration's
own upgrade/downgrade to an in-memory SQLite connection instead.
"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = Path(__file__).parent.parent / "migrations/versions"
MIGRATION = VERSIONS / "d4e5f6a7b8c9_drop_template_notes.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("drop_template_notes_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn: sa.Connection, step: str) -> None:
    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), step)()


def _columns(conn: sa.Connection, table: str) -> list[str]:
    return [c["name"] for c in sa.inspect(conn).get_columns(table)]


def test_drop_template_notes_upgrade_and_downgrade():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE strength_templates (id INTEGER PRIMARY KEY, name VARCHAR, notes TEXT)"
        ))
        conn.execute(sa.text(
            "CREATE TABLE strength_template_sets "
            "(id INTEGER PRIMARY KEY, set_number INTEGER, reps INTEGER, weight_kg FLOAT, notes TEXT)"
        ))
        conn.execute(sa.text("INSERT INTO strength_templates VALUES (1, 'Leg day', 'Go heavy')"))
        conn.execute(sa.text("INSERT INTO strength_template_sets VALUES (1, 1, 5, 100.0, 'tough')"))

        _run(conn, "upgrade")
        assert _columns(conn, "strength_templates") == ["id", "name"]
        assert _columns(conn, "strength_template_sets") == ["id", "set_number", "reps", "weight_kg"]
        # Exercises and sets survive; only the notes go
        assert conn.execute(sa.text("SELECT * FROM strength_templates")).all() == [(1, "Leg day")]
        assert conn.execute(sa.text("SELECT * FROM strength_template_sets")).all() == [(1, 1, 5, 100.0)]

        _run(conn, "downgrade")
        assert _columns(conn, "strength_templates") == ["id", "name", "notes"]
        assert _columns(conn, "strength_template_sets") == ["id", "set_number", "reps", "weight_kg", "notes"]
        assert conn.execute(sa.text("SELECT notes FROM strength_template_sets")).all() == [(None,)]
