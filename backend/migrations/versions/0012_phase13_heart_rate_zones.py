"""phase13 heart rate zones

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("cardio_segments", "heart_rate_avg")

    op.add_column("workout_sessions", sa.Column("avg_hr_bpm", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("z1_seconds", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("z2_seconds", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("z3_seconds", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("z4_seconds", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("z5_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.add_column("cardio_segments", sa.Column("heart_rate_avg", sa.Integer(), nullable=True))

    op.drop_column("workout_sessions", "z5_seconds")
    op.drop_column("workout_sessions", "z4_seconds")
    op.drop_column("workout_sessions", "z3_seconds")
    op.drop_column("workout_sessions", "z2_seconds")
    op.drop_column("workout_sessions", "z1_seconds")
    op.drop_column("workout_sessions", "avg_hr_bpm")
