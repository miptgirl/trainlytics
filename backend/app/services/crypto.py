"""Symmetric encryption/decryption for sensitive fields (e.g. API keys).

A Fernet key is derived from the application SECRET_KEY using PBKDF2-HMAC-SHA256
with a fixed application salt so that encryption is deterministic across restarts
as long as SECRET_KEY does not change.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_APP_SALT = b"trainlytics-crypto-salt-v1"
_ITERATIONS = 100_000


def _derive_fernet_key() -> bytes:
    """Derive a 32-byte key from SECRET_KEY and return it base64url-encoded for Fernet."""
    raw = hashlib.pbkdf2_hmac(
        "sha256",
        settings.secret_key.encode(),
        _APP_SALT,
        _ITERATIONS,
        dklen=32,
    )
    return base64.urlsafe_b64encode(raw)


def _get_fernet() -> Fernet:
    return Fernet(_derive_fernet_key())


def encrypt(plaintext: str) -> str:
    """Encrypt *plaintext* and return a Fernet token as a str."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet token back to plaintext.

    Raises ``cryptography.fernet.InvalidToken`` when the token is invalid or
    the key has changed since encryption.
    """
    return _get_fernet().decrypt(ciphertext.encode()).decode()


__all__ = ["encrypt", "decrypt", "InvalidToken"]
