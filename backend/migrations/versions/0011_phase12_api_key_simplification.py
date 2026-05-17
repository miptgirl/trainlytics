"""phase12 api key simplification

Revision ID: 0011
Revises: 60932c425cfd
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "60932c425cfd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("ai_key_encrypted", sa.Text(), nullable=True))
    # Wipe existing provider-specific keys — user must re-enter after deploy
    op.execute("UPDATE user_settings SET anthropic_api_key_encrypted = NULL, openai_api_key_encrypted = NULL")


def downgrade() -> None:
    op.drop_column("user_settings", "ai_key_encrypted")
