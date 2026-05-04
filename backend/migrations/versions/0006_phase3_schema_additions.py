"""phase 3 schema additions

- workout_sessions.date: Date → DateTime(timezone=True)
- workout_sessions.calories: new nullable integer
- workout_sessions.title: new nullable text
- cardio_segments.title: new nullable text
- strength_sessions.duration_seconds: new nullable integer

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Change workout_sessions.date from Date to DateTime(timezone=True).
    #    Existing date-only rows are coerced to midnight UTC.
    op.execute(
        "ALTER TABLE workout_sessions ALTER COLUMN date TYPE TIMESTAMP WITH TIME ZONE "
        "USING (date::timestamp AT TIME ZONE 'UTC')"
    )

    # 2. Add calories column to workout_sessions
    op.add_column("workout_sessions", sa.Column("calories", sa.Integer(), nullable=True))

    # 3. Add title column to workout_sessions
    op.add_column("workout_sessions", sa.Column("title", sa.Text(), nullable=True))

    # 4. Add title column to cardio_segments
    op.add_column("cardio_segments", sa.Column("title", sa.Text(), nullable=True))

    # 5. Add duration_seconds column to strength_sessions
    op.add_column("strength_sessions", sa.Column("duration_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("strength_sessions", "duration_seconds")
    op.drop_column("cardio_segments", "title")
    op.drop_column("workout_sessions", "title")
    op.drop_column("workout_sessions", "calories")

    # Revert DateTime(timezone=True) back to Date (truncates time)
    op.execute(
        "ALTER TABLE workout_sessions ALTER COLUMN date TYPE DATE "
        "USING (date AT TIME ZONE 'UTC')::date"
    )
