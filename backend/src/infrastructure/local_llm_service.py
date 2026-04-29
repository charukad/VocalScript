import json
import logging
import os
from typing import Any, Dict, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.src.config import LocalLLMSettings
from backend.src.domain.models.generation import StoryboardRequest

logger = logging.getLogger(__name__)


class LocalLLMService:
    def __init__(self, settings: LocalLLMSettings):
        self.settings = settings

    def generate_storyboard_json(self, request: StoryboardRequest) -> Optional[str]:
        mode = self.settings.mode.lower().strip()
        if mode in ("", "rule_based", "off", "none"):
            return None
        if mode == "ollama":
            return self._generate_with_ollama(request)
        if mode in ("lm_studio", "openai_compatible", "local_server"):
            return self._generate_with_openai_compatible_server(request)
        logger.warning("Unknown local LLM mode '%s'. Falling back to rule-based storyboard.", mode)
        return None

    def _generate_with_ollama(self, request: StoryboardRequest) -> Optional[str]:
        payload = {
            "model": self.settings.ollama_model,
            "prompt": self._build_prompt(request),
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2},
        }
        data = self._post_json(f"{self.settings.ollama_url.rstrip('/')}/api/generate", payload)
        response = data.get("response")
        return response if isinstance(response, str) else None

    def _generate_with_openai_compatible_server(self, request: StoryboardRequest) -> Optional[str]:
        payload = {
            "model": self.settings.openai_compatible_model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": "Return strict JSON only. No prose, no markdown.",
                },
                {
                    "role": "user",
                    "content": self._build_prompt(request),
                },
            ],
        }
        data = self._post_json(f"{self.settings.openai_compatible_url.rstrip('/')}/chat/completions", payload)
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        message = choices[0].get("message", {})
        content = message.get("content")
        return content if isinstance(content, str) else None

    def _post_json(self, url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        api_key = os.getenv("NEURALSCRIBE_LOCAL_LLM_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except (OSError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            logger.warning("Local LLM request failed: %s", exc)
            return {}

    def _build_prompt(self, request: StoryboardRequest) -> str:
        segments_text = "\n".join(
            f"- {segment.start:.2f}-{segment.end:.2f}: {segment.text.strip()}"
            for segment in request.segments
        )
        transcript_context = segments_text or request.transcript
        return f"""
Create a timed visual storyboard for an auto-generated video.

Rules:
- Return JSON with a top-level "scenes" array.
- Each scene must include start, end, transcript, visualType, prompt, negativePrompt, style, camera.
- Use visualType "{request.preferred_visual_type}" unless the transcript strongly requires another visual type.
- Keep scene timings inside the transcript segment timings when provided.
- Prompts must describe visuals only. Do not ask for subtitles or readable on-screen text.
- Style target: {request.style}

Transcript:
{transcript_context}
""".strip()
