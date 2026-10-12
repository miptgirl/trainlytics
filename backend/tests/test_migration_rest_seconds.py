"""user_settings.rest_seconds migration (7a33978e6e65), run directly on SQLite.

The full Alembic chain has Postgres-only steps, so this binds the migration's
own upgrade/downgrade to an in-memory SQLite connection instead.
"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = Path(__file__).parent.parent / "migrations/versions"
MIGRATION = VERSIONS / "7a33978e6e65_add_rest_seconds_to_user_settings.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("rest_seconds_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn: sa.Connection, step: str) -> None:
    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), step)()


def _columns(conn: sa.Connection) -> list[str]:
    return [c["name"] for c in sa.inspect(conn).get_columns("user_settings")]


def test_rest_seconds_upgrade_and_downgrade():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE user_settings (username VARCHAR PRIMARY KEY, display_name VARCHAR)"
        ))
        conn.execute(sa.text("INSERT INTO user_settings VALUES ('marie', 'Marie')"))

        _run(conn, "upgrade")
        assert _columns(conn) == ["username", "display_name", "rest_seconds"]
        # Existing rows start as never set
        rows = conn.execute(sa.text("SELECT * FROM user_settings"))
        assert rows.all() == [("marie", "Marie", None)]
        conn.execute(sa.text("UPDATE user_settings SET rest_seconds = 135"))

        _run(conn, "downgrade")
        assert _columns(conn) == ["username", "display_name"]
        assert conn.execute(sa.text("SELECT username, display_name FROM user_settings")).all() == [
            ("marie", "Marie")
        ]
