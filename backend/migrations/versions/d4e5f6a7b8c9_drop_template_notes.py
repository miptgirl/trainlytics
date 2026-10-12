"""drop_template_notes

A template is only exercises with sets (reps, weight): drop the template-level
and per-set notes columns. Downgrade restores the columns empty.

Revision ID: d4e5f6a7b8c9
Revises: 7a33978e6e65
Create Date: 2026-10-12 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = '7a33978e6e65'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('strength_template_sets', 'notes')
    op.drop_column('strength_templates', 'notes')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('strength_templates', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('strength_template_sets', sa.Column('notes', sa.Text(), nullable=True))
