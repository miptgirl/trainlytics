"""Session RPE remap migration (c3f8e1a2b9d4), run directly on SQLite.

The full Alembic chain has Postgres-only steps, so this binds the migration's
own upgrade/downgrade to an in-memory SQLite connection instead.
"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = Path(__file__).parent.parent / "migrations/versions/c3f8e1a2b9d4_session_rpe_1_to_10.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("session_rpe_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn: sa.Connection, step: str) -> None:
    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), step)()


def _rpes(conn: sa.Connection) -> list[int | None]:
    return list(conn.execute(sa.text("SELECT rpe FROM workout_sessions ORDER BY id")).scalars())


def test_session_rpe_remap_upgrade_and_downgrade():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE workout_sessions (id INTEGER PRIMARY KEY, rpe INTEGER)"))
        for v in [1, 2, 3, 4, 5, None, 0, 7]:
            conn.execute(sa.text("INSERT INTO workout_sessions (rpe) VALUES (:v)"), {"v": v})

        _run(conn, "upgrade")
        # Old 1 (All-out) → 10 … old 5 (Very easy) → 2; out-of-range rows untouched
        assert _rpes(conn) == [10, 8, 6, 4, 2, None, 0, 7]

        conn.execute(sa.text("DELETE FROM workout_sessions WHERE rpe IN (0, 7)"))
        for v in [1, 3, 7, 9]:  # odd values, only possible after the upgrade
            conn.execute(sa.text("INSERT INTO workout_sessions (rpe) VALUES (:v)"), {"v": v})

        _run(conn, "downgrade")
        # Even values restore exactly; odd ones round half away from zero, clamped to 1–5
        assert _rpes(conn) == [1, 2, 3, 4, 5, None, 5, 5, 3, 2]
