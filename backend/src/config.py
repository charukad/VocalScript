import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class LocalLLMSettings:
    mode: str = os.getenv("NEURALSCRIBE_LLM_MODE", "rule_based")
    ollama_url: str = os.getenv("NEURALSCRIBE_OLLAMA_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.getenv("NEURALSCRIBE_OLLAMA_MODEL", "llama3.2:3b")
    openai_compatible_url: str = os.getenv("NEURALSCRIBE_LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
    openai_compatible_model: str = os.getenv("NEURALSCRIBE_LOCAL_LLM_MODEL", "local-model")


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
