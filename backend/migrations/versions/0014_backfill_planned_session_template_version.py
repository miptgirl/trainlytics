"""backfill template_version on planned_sessions

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-17

For planned sessions created before Phase 14 (template_version IS NULL),
set template_version to the template's current_version. This is the best
available approximation — not the exact version at plan-time, but it lets
the comparison panel work for historical sessions.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "0014"
down_revision: Union[str, Sequence[str], None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE planned_sessions ps
            SET template_version = st.current_version
            FROM strength_templates st
            WHERE ps.template_id = st.id
              AND ps.template_version IS NULL
              AND ps.template_id IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    pass  # not reversible — we don't know which sessions were pre-Phase-14
