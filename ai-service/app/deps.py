from fastapi import Header, HTTPException, status

from app.config import get_settings


async def verify_service_key(x_service_key: str | None = Header(default=None)) -> None:
    """If SERVICE_API_KEY is configured, require the backend to send it."""
    expected = get_settings().service_api_key
    if expected and x_service_key != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key")
