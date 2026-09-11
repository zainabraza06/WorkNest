from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    allowed_origins: str = "http://localhost:5000"
    service_api_key: str = ""

    # "dummy" = hardcoded heuristics; flip per-feature to "model" once trained models exist
    matching_backend: str = "dummy"
    trust_backend: str = "dummy"
    pricing_backend: str = "dummy"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
