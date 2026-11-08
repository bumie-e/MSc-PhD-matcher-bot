"""Helpers that keep user data out of logs. The repo is public, so Actions
logs are world-readable: log short ids and exception types, never raw
provider/library messages (they can echo CV or listing text)."""


def uid(user_id: str | None) -> str:
    """Short, non-identifying form of a user id for log lines."""
    return (user_id or "?")[:8]


def err(exc: BaseException) -> str:
    """Exception type only; the message may contain user content."""
    return type(exc).__name__
