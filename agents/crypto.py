"""AES-256-GCM encrypt/decrypt for the LinkedIn `li_at` session cookie.

Format: base64(iv[12 bytes] || ciphertext || tag[16 bytes]) — this matches
what the Web Crypto API's `crypto.subtle.encrypt({name: "AES-GCM"}, ...)`
produces in the `save-linkedin` Deno Edge Function, so a cookie written by
the Edge Function can be decrypted here, and vice versa.

COOKIE_ENCRYPTION_KEY is a base64-encoded 32-byte key (generate with
`openssl rand -base64 32`). Only the service role (this code, run inside
GitHub Actions) ever sees the decryption key or the plaintext cookie.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import settings

IV_LENGTH = 12


def _get_key() -> bytes:
    if not settings.COOKIE_ENCRYPTION_KEY:
        raise RuntimeError("COOKIE_ENCRYPTION_KEY not set")
    key = base64.b64decode(settings.COOKIE_ENCRYPTION_KEY)
    if len(key) != 32:
        raise RuntimeError("COOKIE_ENCRYPTION_KEY must decode to 32 bytes for AES-256")
    return key


def encrypt_cookie(plaintext: str) -> str:
    key = _get_key()
    iv = os.urandom(IV_LENGTH)
    ciphertext = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(iv + ciphertext).decode("ascii")


def decrypt_cookie(token: str) -> str:
    key = _get_key()
    raw = base64.b64decode(token)
    iv, ciphertext = raw[:IV_LENGTH], raw[IV_LENGTH:]
    plaintext = AESGCM(key).decrypt(iv, ciphertext, None)
    return plaintext.decode("utf-8")
