"""create exercise_types and exercise_exercise_types tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exercise_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exercise_types_user_id", "exercise_types", ["user_id"])

    op.create_table(
        "exercise_exercise_types",
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("exercise_type_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["exercise_type_id"],
            ["exercise_types.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("exercise_id", "exercise_type_id"),
    )


def downgrade() -> None:
    op.drop_table("exercise_exercise_types")
    op.drop_index("ix_exercise_types_user_id", table_name="exercise_types")
    op.drop_table("exercise_types")
