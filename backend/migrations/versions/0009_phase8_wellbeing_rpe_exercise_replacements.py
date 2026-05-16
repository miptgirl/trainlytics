"""phase8 wellbeing rpe and exercise replacements

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workout_sessions", sa.Column("wellbeing", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("rpe", sa.Integer(), nullable=True))

    op.create_table(
        "exercise_replacements",
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("replacement_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replacement_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("exercise_id", "replacement_id"),
    )


def downgrade() -> None:
    op.drop_table("exercise_replacements")
    op.drop_column("workout_sessions", "rpe")
    op.drop_column("workout_sessions", "wellbeing")
