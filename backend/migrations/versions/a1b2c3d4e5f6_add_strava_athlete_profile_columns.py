"""add_strava_athlete_profile_columns

Revision ID: a1b2c3d4e5f6
Revises: bdc9905e1b7f
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'bdc9905e1b7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('strava_athlete_name', sa.Text(), nullable=True))
    op.add_column('user_settings', sa.Column('strava_athlete_avatar_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_settings', 'strava_athlete_avatar_url')
    op.drop_column('user_settings', 'strava_athlete_name')
