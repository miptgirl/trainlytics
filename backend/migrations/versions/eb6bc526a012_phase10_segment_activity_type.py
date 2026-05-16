"""phase10_segment_activity_type

Revision ID: eb6bc526a012
Revises: 0010
Create Date: 2026-05-16 21:12:20.990650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'eb6bc526a012'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('cardio_segments', sa.Column('activity_type_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'cardio_segments', 'cardio_activity_types', ['activity_type_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'cardio_segments', type_='foreignkey')
    op.drop_column('cardio_segments', 'activity_type_id')

