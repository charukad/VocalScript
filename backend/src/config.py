import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    file_values = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        file_values[key.strip()] = value.strip().strip('"').strip("'")
    for key, value in file_values.items():
        os.environ.setdefault(key, value)


_ROOT_DIR = Path(__file__).resolve().parents[2]
_load_env_file(_ROOT_DIR / ".env")
_load_env_file(_ROOT_DIR / "backend" / ".env")


@dataclass(frozen=True)
class LocalLLMSettings:
    mode: str = os.getenv("NEURALSCRIBE_LLM_MODE", "rule_based")
    ollama_url: str = os.getenv("NEURALSCRIBE_OLLAMA_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.getenv("NEURALSCRIBE_OLLAMA_MODEL", "llama3.2:3b")
    openai_compatible_url: str = os.getenv("NEURALSCRIBE_LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
    openai_compatible_model: str = os.getenv("NEURALSCRIBE_LOCAL_LLM_MODEL", "local-model")
    openrouter_url: str = os.getenv("NEURALSCRIBE_OPENROUTER_URL", "https://openrouter.ai/api/v1")
    openrouter_api_key: str = os.getenv("NEURALSCRIBE_OPENROUTER_API_KEY", "")
    openrouter_model: str = os.getenv("NEURALSCRIBE_OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    openrouter_reasoning: bool = os.getenv("NEURALSCRIBE_OPENROUTER_REASONING", "true").lower() == "true"
    openrouter_site_url: str = os.getenv("NEURALSCRIBE_OPENROUTER_SITE_URL", "http://127.0.0.1:3000")
    openrouter_app_name: str = os.getenv("NEURALSCRIBE_OPENROUTER_APP_NAME", "NeuralScribe")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", os.getenv("NEURALSCRIBE_GEMINI_API_KEY", ""))
    gemini_model: str = os.getenv("NEURALSCRIBE_GEMINI_MODEL", "gemini-3-flash-preview")


@dataclass(frozen=True)
class BrowserBridgeSettings:
    enabled: bool = os.getenv("NEURALSCRIBE_BROWSER_BRIDGE_ENABLED", "true").lower() == "true"
    preferred_provider: str = os.getenv("NEURALSCRIBE_GENERATION_PROVIDER", "meta")
    websocket_path: str = os.getenv("NEURALSCRIBE_BRIDGE_WS_PATH", "/api/browser-bridge/ws")
    session_token: str = os.getenv("NEURALSCRIBE_BRIDGE_TOKEN", "dev-local")
    generated_media_dir: str = os.getenv("NEURALSCRIBE_GENERATED_MEDIA_DIR", "backend/output/generated")


@dataclass(frozen=True)
class AppSettings:
    llm: LocalLLMSettings = field(default_factory=LocalLLMSettings)
    browser_bridge: BrowserBridgeSettings = field(default_factory=BrowserBridgeSettings)


settings = AppSettings()
