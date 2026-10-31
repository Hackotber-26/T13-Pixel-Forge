from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    wa_verify_token: str = ""
    wa_app_secret: str = ""
    wa_access_token: str = ""
    wa_phone_number_id: str = ""
    wa_display_number: str = ""
    graph_url: str = "https://graph.facebook.com/v21.0"

    db_host: str
    db_user: str
    db_password: str
    db_name: str = "postgres"

    app_secret: str
    web_base_url: str = "http://localhost:5173"
    test_phones: str = ""

    @property
    def db_dsn(self) -> str:
        return f"host={self.db_host} port=5432 dbname={self.db_name} user={self.db_user} password={self.db_password}"


settings = Settings()
