import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from backend.src.domain.models.generation import (
    GeneratedMediaType,
    StoryboardRequest,
    StoryboardResponse,
    StoryboardScene,
    TranscriptSlice,
)
from backend.src.infrastructure.local_llm_service import LocalLLMService

logger = logging.getLogger(__name__)

MAX_RULE_BASED_SCENE_SECONDS = 6.0
WORDS_PER_UNTIMED_SCENE = 22


class StoryboardService:
    def __init__(self, local_llm: LocalLLMService):
        self.local_llm = local_llm

    def create_storyboard(self, request: StoryboardRequest) -> StoryboardResponse:
        normalized_request = self._normalize_request(request)
        llm_payload = self.local_llm.generate_storyboard_json(normalized_request)
        if llm_payload:
            scenes = self._parse_llm_scenes(llm_payload, normalized_request)
            if scenes:
                return StoryboardResponse(
                    scenes=scenes,
                    provider=normalized_request.provider,
                    usedLlmMode=self.local_llm.settings.mode,
                    transcript=normalized_request.transcript,
                    segments=normalized_request.segments,
                    duration=self._duration_from_scenes(scenes),
                )

        scenes = self._create_rule_based_scenes(normalized_request)
        return StoryboardResponse(
            scenes=scenes,
            provider=normalized_request.provider,
            usedLlmMode="rule_based",
            transcript=normalized_request.transcript,
            segments=normalized_request.segments,
            duration=self._duration_from_scenes(scenes),
        )

    def _normalize_request(self, request: StoryboardRequest) -> StoryboardRequest:
        segments = [
            TranscriptSlice(
                start=max(0.0, segment.start),
                end=max(max(0.0, segment.start) + 0.1, segment.end),
                text=segment.text.strip(),
            )
            for segment in request.segments
            if segment.text.strip()
        ]
        segments.sort(key=lambda segment: segment.start)
        transcript = request.transcript.strip() or " ".join(segment.text for segment in segments)
        return StoryboardRequest(
            transcript=transcript,
            segments=segments,
            preferredVisualType=request.preferred_visual_type,
            style=request.style.strip() or "cinematic realistic",
            provider=request.provider,
        )

    def _parse_llm_scenes(self, payload: str, request: StoryboardRequest) -> List[StoryboardScene]:
        try:
            parsed = json.loads(self._extract_json(payload))
        except json.JSONDecodeError as exc:
            logger.warning("Local LLM returned invalid JSON: %s", exc)
            return []

        raw_scenes = parsed.get("scenes") if isinstance(parsed, dict) else None
        if not isinstance(raw_scenes, list):
            return []

        scenes: List[StoryboardScene] = []
        for index, raw_scene in enumerate(raw_scenes, 1):
            if not isinstance(raw_scene, dict):
                continue
            repaired = self._repair_scene_dict(raw_scene, index, request)
            try:
                scenes.append(StoryboardScene(**repaired))
            except ValidationError as exc:
                logger.warning("Skipping invalid LLM storyboard scene: %s", exc)

        return self._repair_timing(scenes, request)

    def _create_rule_based_scenes(self, request: StoryboardRequest) -> List[StoryboardScene]:
        if request.segments:
            grouped = self._group_timed_segments(request.segments)
        else:
            grouped = self._group_untimed_transcript(request.transcript)

        scenes = [
            self._scene_from_group(index, start, end, text, request.preferred_visual_type, request.style)
            for index, (start, end, text) in enumerate(grouped, 1)
        ]
        return self._repair_timing(scenes, request)

    def _group_timed_segments(self, segments: List[TranscriptSlice]) -> List[tuple[float, float, str]]:
        groups: List[tuple[float, float, str]] = []
        current_start: Optional[float] = None
        current_end = 0.0
        current_text: List[str] = []

        for segment in segments:
            if current_start is None:
                current_start = segment.start
            proposed_duration = segment.end - current_start
            should_flush = (
                current_text
                and proposed_duration > MAX_RULE_BASED_SCENE_SECONDS
                and self._ends_sentence(current_text[-1])
            )
            if should_flush:
                groups.append((current_start, current_end, " ".join(current_text)))
                current_start = segment.start
                current_text = []

            current_text.append(segment.text.strip())
            current_end = max(current_end, segment.end)

        if current_start is not None and current_text:
            groups.append((current_start, current_end, " ".join(current_text)))

        return groups

    def _group_untimed_transcript(self, transcript: str) -> List[tuple[float, float, str]]:
        words = transcript.split()
        if not words:
            return [(0.0, 5.0, "Create an establishing visual for the audio intro.")]

        groups: List[tuple[float, float, str]] = []
        for index in range(0, len(words), WORDS_PER_UNTIMED_SCENE):
            scene_index = len(groups)
            text = " ".join(words[index:index + WORDS_PER_UNTIMED_SCENE])
            start = scene_index * 5.0
            groups.append((start, start + 5.0, text))
        return groups

    def _scene_from_group(
        self,
        index: int,
        start: float,
        end: float,
        text: str,
        visual_type: GeneratedMediaType,
        style: str,
    ) -> StoryboardScene:
        clean_text = self._clean_text(text)
        prompt_subject = self._prompt_subject(clean_text)
        return StoryboardScene(
            id=f"scene-{index:03d}",
            start=round(start, 3),
            end=round(max(start + 0.1, end), 3),
            transcript=clean_text,
            visualType=visual_type,
            prompt=(
                f"{style}, cinematic visual scene representing: {prompt_subject}. "
                "Natural lighting, clear subject, strong composition, no readable text."
            ),
            negativePrompt="low quality, blurry, distorted, watermark, subtitles, readable text",
            style=style,
            camera="static" if visual_type == "image" else "slow cinematic push-in",
            status="draft",
        )

    def _repair_scene_dict(
        self,
        raw_scene: Dict[str, Any],
        index: int,
        request: StoryboardRequest,
    ) -> Dict[str, Any]:
        start = self._safe_float(raw_scene.get("start"), (index - 1) * 5.0)
        end = self._safe_float(raw_scene.get("end"), start + 5.0)
        transcript = str(raw_scene.get("transcript") or raw_scene.get("text") or "").strip()
        prompt = str(raw_scene.get("prompt") or "").strip()
        if not transcript:
            transcript = self._transcript_for_time(request.segments, start, end) or request.transcript[:220]
        if not prompt:
            prompt = self._scene_from_group(index, start, end, transcript, request.preferred_visual_type, request.style).prompt

        return {
            "id": str(raw_scene.get("id") or f"scene-{index:03d}"),
            "start": start,
            "end": end,
            "transcript": transcript,
            "visualType": raw_scene.get("visualType") or raw_scene.get("visual_type") or request.preferred_visual_type,
            "prompt": prompt,
            "negativePrompt": raw_scene.get("negativePrompt") or raw_scene.get("negative_prompt") or "low quality, blurry, watermark, readable text",
            "style": raw_scene.get("style") or request.style,
            "camera": raw_scene.get("camera") or "static",
            "status": raw_scene.get("status") or "draft",
        }

    def _repair_timing(self, scenes: List[StoryboardScene], request: StoryboardRequest) -> List[StoryboardScene]:
        if not scenes:
            return []

        scenes = sorted(scenes, key=lambda scene: scene.start)
        duration = self._duration_from_request(request) or max(scene.end for scene in scenes)
        repaired: List[StoryboardScene] = []
        previous_end = 0.0

        for index, scene in enumerate(scenes, 1):
            start = max(0.0, scene.start)
            if start < previous_end:
                start = previous_end
            end = max(start + 0.1, scene.end)
            if duration > 0:
                end = min(duration, end)
                if end <= start:
                    end = min(duration, start + 0.1)
            repaired.append(
                scene.model_copy(
                    update={
                        "id": f"scene-{index:03d}",
                        "start": round(start, 3),
                        "end": round(end, 3),
                    }
                )
            )
            previous_end = end

        return repaired

    def _duration_from_request(self, request: StoryboardRequest) -> float:
        if request.segments:
            return max(segment.end for segment in request.segments)
        return 0.0

    def _duration_from_scenes(self, scenes: List[StoryboardScene]) -> float:
        return max((scene.end for scene in scenes), default=0.0)

    def _transcript_for_time(self, segments: List[TranscriptSlice], start: float, end: float) -> str:
        return " ".join(
            segment.text.strip()
            for segment in segments
            if segment.end > start and segment.start < end
        )

    def _extract_json(self, payload: str) -> str:
        stripped = payload.strip()
        if stripped.startswith("{"):
            return stripped
        match = re.search(r"\{.*\}", stripped, re.DOTALL)
        if not match:
            return stripped
        return match.group(0)

    def _clean_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    def _prompt_subject(self, text: str) -> str:
        clean = self._clean_text(text).rstrip(".!?")
        return clean[:260] if clean else "the main idea of this audio moment"

    def _ends_sentence(self, text: str) -> bool:
        return text.strip().endswith((".", "!", "?"))

    def _safe_float(self, value: Any, fallback: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback
