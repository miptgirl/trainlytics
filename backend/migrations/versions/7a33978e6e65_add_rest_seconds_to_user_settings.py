"""add_rest_seconds_to_user_settings

Workout mode rest timer length per user. Null means the app default (90 s).

Revision ID: 7a33978e6e65
Revises: c3f8e1a2b9d4
Create Date: 2026-10-12 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7a33978e6e65'
down_revision: Union[str, Sequence[str], None] = 'c3f8e1a2b9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user_settings', sa.Column('rest_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user_settings', 'rest_seconds')
