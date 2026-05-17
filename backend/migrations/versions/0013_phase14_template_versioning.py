"""phase14 template versioning

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "0013"
down_revision: Union[str, Sequence[str], None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add current_version to strength_templates
    op.add_column(
        "strength_templates",
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
    )

    # Add template_version to planned_sessions
    op.add_column(
        "planned_sessions",
        sa.Column("template_version", sa.Integer(), nullable=True),
    )

    # Create strength_template_history
    op.create_table(
        "strength_template_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["strength_templates.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "version", name="uq_template_history_version"),
    )

    # Create strength_template_history_exercises
    op.create_table(
        "strength_template_history_exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("history_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("exercise_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["history_id"],
            ["strength_template_history.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create strength_template_history_sets
    op.create_table(
        "strength_template_history_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("history_exercise_id", sa.Integer(), nullable=False),
        sa.Column("set_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["history_exercise_id"],
            ["strength_template_history_exercises.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Data migration: write version 1 history snapshot for all existing templates
    conn = op.get_bind()

    templates = conn.execute(
        text("SELECT id FROM strength_templates ORDER BY id")
    ).fetchall()

    for (template_id,) in templates:
        # Insert history row
        result = conn.execute(
            text(
                "INSERT INTO strength_template_history (template_id, version, created_at)"
                " VALUES (:tid, 1, now()) RETURNING id"
            ),
            {"tid": template_id},
        )
        history_id = result.fetchone()[0]

        # Fetch exercises for this template
        exercises = conn.execute(
            text(
                "SELECT id, exercise_id, \"order\" FROM strength_template_exercises"
                " WHERE template_id = :tid ORDER BY \"order\""
            ),
            {"tid": template_id},
        ).fetchall()

        for ex_id, exercise_id, exercise_order in exercises:
            # Insert history exercise
            result2 = conn.execute(
                text(
                    "INSERT INTO strength_template_history_exercises"
                    " (history_id, exercise_id, exercise_order)"
                    " VALUES (:hid, :eid, :eorder) RETURNING id"
                ),
                {"hid": history_id, "eid": exercise_id, "eorder": exercise_order},
            )
            history_exercise_id = result2.fetchone()[0]

            # Fetch sets for this exercise entry
            sets = conn.execute(
                text(
                    "SELECT set_number, reps, weight_kg FROM strength_template_sets"
                    " WHERE exercise_entry_id = :ex_id ORDER BY set_number"
                ),
                {"ex_id": ex_id},
            ).fetchall()

            for set_number, reps, weight_kg in sets:
                conn.execute(
                    text(
                        "INSERT INTO strength_template_history_sets"
                        " (history_exercise_id, set_order, reps, weight_kg)"
                        " VALUES (:heid, :sorder, :reps, :weight_kg)"
                    ),
                    {
                        "heid": history_exercise_id,
                        "sorder": set_number,
                        "reps": reps,
                        "weight_kg": weight_kg,
                    },
                )


def downgrade() -> None:
    op.drop_table("strength_template_history_sets")
    op.drop_table("strength_template_history_exercises")
    op.drop_table("strength_template_history")
    op.drop_column("planned_sessions", "template_version")
    op.drop_column("strength_templates", "current_version")
