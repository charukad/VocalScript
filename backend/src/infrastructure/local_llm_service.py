import json
import logging
import os
from typing import Any, Dict, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.src.config import LocalLLMSettings
from backend.src.domain.models.generation import GenerationJob, StoryboardRequest

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
        if mode == "openrouter":
            return self._generate_with_openrouter(request)
        if mode == "gemini":
            return self._generate_with_gemini(request)
        if mode in ("lm_studio", "openai_compatible", "local_server"):
            return self._generate_with_openai_compatible_server(request)
        logger.warning("Unknown local LLM mode '%s'. Falling back to rule-based storyboard.", mode)
        return None

    def rewrite_generation_prompt(self, job: GenerationJob) -> str:
        mode = self.settings.mode.lower().strip()
        fallback = self._rule_based_prompt_rewrite(job)
        if mode in ("", "rule_based", "off", "none"):
            return fallback

        prompt = self._build_prompt_rewrite_request(job)
        response_text: Optional[str] = None
        if mode == "ollama":
            payload = {
                "model": self.settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.35},
            }
            data = self._post_json(f"{self.settings.ollama_url.rstrip('/')}/api/generate", payload)
            response_text = data.get("response") if isinstance(data.get("response"), str) else None
        elif mode == "openrouter":
            response_text = self._prompt_rewrite_openrouter(prompt)
        elif mode == "gemini":
            response_text = self._prompt_rewrite_gemini(prompt)
        elif mode in ("lm_studio", "openai_compatible", "local_server"):
            payload = {
                "model": self.settings.openai_compatible_model,
                "temperature": 0.35,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Return strict JSON only. No prose, no markdown."},
                    {"role": "user", "content": prompt},
                ],
            }
            data = self._post_json(f"{self.settings.openai_compatible_url.rstrip('/')}/chat/completions", payload)
            choices = data.get("choices")
            if isinstance(choices, list) and choices:
                content = choices[0].get("message", {}).get("content")
                response_text = content if isinstance(content, str) else None

        rewritten = self._extract_rewritten_prompt(response_text)
        return rewritten or fallback

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

    def _generate_with_openrouter(self, request: StoryboardRequest) -> Optional[str]:
        if not self.settings.openrouter_api_key:
            logger.warning("OpenRouter mode is enabled but NEURALSCRIBE_OPENROUTER_API_KEY is not set.")
            return None

        payload: Dict[str, Any] = {
            "model": self.settings.openrouter_model,
            "temperature": 0.2,
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
        if self.settings.openrouter_reasoning:
            payload["reasoning"] = {"enabled": True}

        headers = {
            "HTTP-Referer": self.settings.openrouter_site_url,
            "X-Title": self.settings.openrouter_app_name,
        }
        data = self._post_json(
            f"{self.settings.openrouter_url.rstrip('/')}/chat/completions",
            payload,
            api_key=self.settings.openrouter_api_key,
            extra_headers=headers,
        )
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        message = choices[0].get("message", {})
        content = message.get("content")
        return content if isinstance(content, str) else None

    def _generate_with_gemini(self, request: StoryboardRequest) -> Optional[str]:
        if not self.settings.gemini_api_key:
            logger.warning("Gemini mode is enabled but GEMINI_API_KEY is not set.")
            return None

        try:
            from google import genai
        except ImportError:
            logger.warning("Gemini mode requires the google-genai package. Install backend requirements again.")
            return None

        try:
            client = genai.Client(api_key=self.settings.gemini_api_key)
            response = client.models.generate_content(
                model=self.settings.gemini_model,
                contents=self._build_prompt(request),
                config={
                    "temperature": 0.2,
                    "response_mime_type": "application/json",
                },
            )
            return response.text if isinstance(response.text, str) else None
        except Exception as exc:
            logger.warning("Gemini request failed: %s", exc)
            return None

    def _prompt_rewrite_openrouter(self, prompt: str) -> Optional[str]:
        if not self.settings.openrouter_api_key:
            logger.warning("OpenRouter mode is enabled but NEURALSCRIBE_OPENROUTER_API_KEY is not set.")
            return None
        payload: Dict[str, Any] = {
            "model": self.settings.openrouter_model,
            "temperature": 0.35,
            "messages": [
                {"role": "system", "content": "Return strict JSON only. No prose, no markdown."},
                {"role": "user", "content": prompt},
            ],
        }
        if self.settings.openrouter_reasoning:
            payload["reasoning"] = {"enabled": True}
        data = self._post_json(
            f"{self.settings.openrouter_url.rstrip('/')}/chat/completions",
            payload,
            api_key=self.settings.openrouter_api_key,
            extra_headers={
                "HTTP-Referer": self.settings.openrouter_site_url,
                "X-Title": self.settings.openrouter_app_name,
            },
        )
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        content = choices[0].get("message", {}).get("content")
        return content if isinstance(content, str) else None

    def _prompt_rewrite_gemini(self, prompt: str) -> Optional[str]:
        if not self.settings.gemini_api_key:
            logger.warning("Gemini mode is enabled but GEMINI_API_KEY is not set.")
            return None
        try:
            from google import genai
        except ImportError:
            logger.warning("Gemini mode requires the google-genai package. Install backend requirements again.")
            return None
        try:
            client = genai.Client(api_key=self.settings.gemini_api_key)
            response = client.models.generate_content(
                model=self.settings.gemini_model,
                contents=prompt,
                config={
                    "temperature": 0.35,
                    "response_mime_type": "application/json",
                },
            )
            return response.text if isinstance(response.text, str) else None
        except Exception as exc:
            logger.warning("Gemini prompt rewrite failed: %s", exc)
            return None

    def _post_json(
        self,
        url: str,
        payload: Dict[str, Any],
        api_key: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        api_key = api_key or os.getenv("NEURALSCRIBE_LOCAL_LLM_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        if extra_headers:
            headers.update(extra_headers)
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
        video_mix = request.video_mix_percent
        if video_mix is None:
            video_mix = 100 if request.preferred_visual_type == "video" else 0
        return f"""
Create a timed visual storyboard for an auto-generated video.

Rules:
- Return JSON with a top-level "scenes" array.
- Each scene must include start, end, transcript, visualType, prompt, negativePrompt, style, camera.
- Scene count density: {request.scene_density}.
- Video/image mix: about {video_mix}% of scenes should be video and the rest image.
- Motion intensity for video scenes: {request.motion_intensity}.
- Prompt detail level: {request.prompt_detail}.
- Keep scene timings inside the transcript segment timings when provided.
- Prompts must describe visuals only. Do not ask for subtitles or readable on-screen text.
- Style target: {request.style}

Transcript:
{transcript_context}
""".strip()

    def _build_prompt_rewrite_request(self, job: GenerationJob) -> str:
        transcript = job.metadata.get("sceneTranscript", "")
        aspect_ratio = job.metadata.get("aspectRatio", "")
        return f"""
Rewrite this image/video generation prompt for a retry.

Rules:
- Return JSON only: {{"prompt": "..."}}
- Keep the same story meaning and visual subject.
- Remove anything that could disable a provider generate button, like commands, UI instructions, quotes around the whole prompt, or requests for readable text.
- Make the prompt concrete, visual, safe, and concise.
- Keep the requested media type: {job.media_type}
- Keep the aspect ratio: {aspect_ratio or "unspecified"}
- If the previous error is a login, captcha, or disabled generate button issue, still improve wording but do not pretend that wording alone fixes account/login state.

Original prompt:
{job.prompt}

Negative prompt:
{job.negative_prompt}

Scene transcript:
{transcript}

Previous error:
{job.error or "Unknown provider error"}
""".strip()

    def _extract_rewritten_prompt(self, payload: Optional[str]) -> Optional[str]:
        if not payload:
            return None
        try:
            parsed = json.loads(self._extract_json(payload))
        except json.JSONDecodeError:
            parsed = {}
        if isinstance(parsed, dict):
            value = parsed.get("prompt") or parsed.get("rewrittenPrompt") or parsed.get("rewritten_prompt")
            if isinstance(value, str) and value.strip():
                return value.strip()
        cleaned = payload.strip().strip("`")
        return cleaned if 20 <= len(cleaned) <= 1200 else None

    def _rule_based_prompt_rewrite(self, job: GenerationJob) -> str:
        prompt = " ".join(str(job.prompt or "").split())
        prompt = prompt.replace('"', "").replace("'", "")
        transcript = " ".join(job.metadata.get("sceneTranscript", "").split())
        media_hint = "cinematic video shot" if job.media_type == "video" else "cinematic still image"
        ratio = job.metadata.get("aspectRatio")
        ratio_text = f", {ratio} composition" if ratio else ""
        transcript_text = f" representing this moment: {transcript}" if transcript else ""
        return (
            f"{media_hint}{ratio_text}, clear subject, coherent composition, natural lighting, "
            f"high detail, no readable text, no watermark, {prompt}{transcript_text}"
        )[:1200]

    def _extract_json(self, payload: str) -> str:
        stripped = payload.strip()
        if stripped.startswith("```"):
            stripped = stripped.strip("`").strip()
            if stripped.lower().startswith("json"):
                stripped = stripped[4:].strip()
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1 and end > start:
            return stripped[start:end + 1]
        return stripped
