"""exercises.weight_scale migration (e5f6a7b8c9d0), run directly on SQLite.

The full Alembic chain has Postgres-only steps, so this binds the migration's
own upgrade/downgrade to an in-memory SQLite connection instead.
"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = Path(__file__).parent.parent / "migrations/versions"
MIGRATION = VERSIONS / "e5f6a7b8c9d0_add_weight_scale_to_exercises.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("weight_scale_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn: sa.Connection, step: str) -> None:
    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), step)()


def _columns(conn: sa.Connection) -> list[str]:
    return [c["name"] for c in sa.inspect(conn).get_columns("exercises")]


def test_weight_scale_upgrade_and_downgrade():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE exercises (id INTEGER PRIMARY KEY, user_id VARCHAR, name VARCHAR)"
        ))
        conn.execute(sa.text("INSERT INTO exercises (id, user_id, name) VALUES (1, 'marie', 'Leg press')"))

        _run(conn, "upgrade")
        assert _columns(conn) == ["id", "user_id", "name", "weight_scale"]
        # Existing exercises keep the default stack
        assert conn.execute(sa.text("SELECT name, weight_scale FROM exercises")).all() == [
            ("Leg press", None)
        ]
        conn.execute(sa.text(
            """UPDATE exercises SET weight_scale = '{"kind": "stack", "top_lb": 10, "plate_lb": 15, "plates": null}'"""
        ))

        _run(conn, "downgrade")
        assert _columns(conn) == ["id", "user_id", "name"]
        assert conn.execute(sa.text("SELECT id, name FROM exercises")).all() == [(1, "Leg press")]
