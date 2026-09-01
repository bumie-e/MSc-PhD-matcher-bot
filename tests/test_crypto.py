import base64
import os

import pytest


@pytest.fixture(autouse=True)
def _cookie_key(monkeypatch):
    monkeypatch.setenv("COOKIE_ENCRYPTION_KEY", base64.b64encode(os.urandom(32)).decode())
    import config.settings as settings

    monkeypatch.setattr(settings, "COOKIE_ENCRYPTION_KEY", os.environ["COOKIE_ENCRYPTION_KEY"])


def test_encrypt_decrypt_round_trip():
    from agents import crypto

    plaintext = "AQEDsomefakelinkedincookievalue123"
    token = crypto.encrypt_cookie(plaintext)
    assert token != plaintext
    assert crypto.decrypt_cookie(token) == plaintext


def test_decrypt_rejects_tampered_ciphertext():
    from cryptography.exceptions import InvalidTag

    from agents import crypto

    token = crypto.encrypt_cookie("some-cookie-value")
    raw = bytearray(base64.b64decode(token))
    raw[-1] ^= 0xFF  # flip a bit in the tag
    tampered = base64.b64encode(bytes(raw)).decode()

    with pytest.raises(InvalidTag):
        crypto.decrypt_cookie(tampered)
