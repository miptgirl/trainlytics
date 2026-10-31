"""add_timed_sets

Exercises measured in time (planks, carries): `exercises.measure` is 'reps'
(the default, every existing exercise) or 'time', and strength, template and
template-history sets get `duration_seconds`. A set holds reps or a duration,
never both (enforced by the API).

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-31 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SET_TABLES = ('strength_sets', 'strength_template_sets', 'strength_template_history_sets')


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'exercises',
        sa.Column('measure', sa.String(length=10), nullable=False, server_default='reps'),
    )
    for table in SET_TABLES:
        op.add_column(table, sa.Column('duration_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for table in reversed(SET_TABLES):
        op.drop_column(table, 'duration_seconds')
    op.drop_column('exercises', 'measure')
