import hmac

from fastapi import Header, HTTPException, status

from app.config import get_settings


async def verify_service_key(x_service_key: str | None = Header(default=None)) -> None:
    """If SERVICE_API_KEY is configured, require the backend to send it.

    Compared in constant time so the key cannot be recovered by timing guesses.
    """
    expected = get_settings().service_api_key
    if not expected:
        return
    supplied = x_service_key or ""
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key")
