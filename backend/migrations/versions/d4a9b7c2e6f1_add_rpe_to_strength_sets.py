"""add_rpe_to_strength_sets

Optional per-set RPE on the 1–10 scale in half steps.

Revision ID: d4a9b7c2e6f1
Revises: c3f8e1a2b9d4
Create Date: 2026-10-07 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4a9b7c2e6f1'
down_revision: Union[str, Sequence[str], None] = 'c3f8e1a2b9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('strength_sets', sa.Column('rpe', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('strength_sets', 'rpe')
