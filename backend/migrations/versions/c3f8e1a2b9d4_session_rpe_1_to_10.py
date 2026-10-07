"""session_rpe_1_to_10

Moves workout_sessions.rpe from the inverted 1–5 scale (1 = All-out,
5 = Very easy) to the standard 1–10 RPE scale (10 = maximal effort):
new = 12 - 2 * old.

Revision ID: c3f8e1a2b9d4
Revises: a1b2c3d4e5f6
Create Date: 2026-10-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3f8e1a2b9d4'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only the old scale's values: anything outside 1–5 would land outside 1–10
    op.execute("UPDATE workout_sessions SET rpe = 12 - 2 * rpe WHERE rpe BETWEEN 1 AND 5")


def downgrade() -> None:
    # Inverse of the upgrade, exact for even values. Odd values (entered after
    # the upgrade) round half away from zero; the CASE clamps to 1–5 without
    # GREATEST/LEAST, which SQLite lacks.
    op.execute(
        """
        UPDATE workout_sessions SET rpe = CASE
            WHEN rpe <= 2 THEN 5
            WHEN rpe >= 10 THEN 1
            ELSE CAST(ROUND((12 - rpe) / 2.0) AS INTEGER)
        END
        WHERE rpe IS NOT NULL
        """
    )
