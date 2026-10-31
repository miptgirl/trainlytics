"""Timed sets migration (f6a7b8c9d0e1), run directly on SQLite.

The full Alembic chain has Postgres-only steps, so this binds the migration's
own upgrade/downgrade to an in-memory SQLite connection instead. It also checks
the chain has a single head, so a stale down_revision fails here, not at deploy.
"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).parent.parent
VERSIONS = BACKEND / "migrations/versions"
MIGRATION = VERSIONS / "f6a7b8c9d0e1_add_timed_sets.py"
SET_TABLES = ("strength_sets", "strength_template_sets", "strength_template_history_sets")


def _load_migration():
    spec = importlib.util.spec_from_file_location("timed_sets_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn: sa.Connection, step: str) -> None:
    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), step)()


def _columns(conn: sa.Connection, table: str) -> list[str]:
    return [c["name"] for c in sa.inspect(conn).get_columns(table)]


def test_timed_sets_upgrade_and_downgrade():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE exercises (id INTEGER PRIMARY KEY, name VARCHAR)"))
        conn.execute(sa.text("INSERT INTO exercises (id, name) VALUES (1, 'Squat')"))
        for table in SET_TABLES:
            conn.execute(sa.text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, reps INTEGER)"))
            conn.execute(sa.text(f"INSERT INTO {table} (id, reps) VALUES (1, 5)"))

        _run(conn, "upgrade")
        assert _columns(conn, "exercises") == ["id", "name", "measure"]
        # Existing exercises are measured in reps; existing sets have no duration
        rows = conn.execute(sa.text("SELECT name, measure FROM exercises")).all()
        assert rows == [("Squat", "reps")]
        conn.execute(sa.text("INSERT INTO exercises (id, name) VALUES (2, 'Plank')"))
        new_row = conn.execute(sa.text("SELECT measure FROM exercises WHERE id = 2")).scalar()
        assert new_row == "reps"
        for table in SET_TABLES:
            assert _columns(conn, table) == ["id", "reps", "duration_seconds"]
            rows = conn.execute(sa.text(f"SELECT reps, duration_seconds FROM {table}")).all()
            assert rows == [(5, None)]
            conn.execute(sa.text(f"INSERT INTO {table} (id, duration_seconds) VALUES (2, 45)"))
        conn.execute(sa.text("UPDATE exercises SET measure = 'time' WHERE id = 2"))

        _run(conn, "downgrade")
        assert _columns(conn, "exercises") == ["id", "name"]
        rows = conn.execute(sa.text("SELECT id, name FROM exercises")).all()
        assert rows == [(1, "Squat"), (2, "Plank")]
        for table in SET_TABLES:
            assert _columns(conn, table) == ["id", "reps"]


def test_migration_chain_has_one_head():
    config = Config(str(BACKEND / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    # Two heads: a migration was written against a stale head (`alembic upgrade head` refuses)
    assert len(script.get_heads()) == 1, script.get_heads()
    assert script.get_revision("f6a7b8c9d0e1").down_revision == "e5f6a7b8c9d0"
