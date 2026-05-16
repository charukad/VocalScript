import json
import re
from typing import List, Optional

from pydantic import ValidationError

from backend.src.domain.models.brand_kit import BrandKit
from backend.src.domain.models.content_profile import ContentProfile
from backend.src.domain.models.packaging import (
    PackagingGenerationRequest,
    PackagingGenerationResponse,
    ThumbnailConcept,
    TitleCandidate,
)
from backend.src.domain.models.viral import IdeaScoreRequest
from backend.src.domain.services.viral_scoring_service import ViralScoringService
from backend.src.infrastructure.local_llm_service import LocalLLMService


class PackagingService:
    def __init__(self, local_llm: LocalLLMService, viral_scoring_service: ViralScoringService):
        self.local_llm = local_llm
        self.viral_scoring_service = viral_scoring_service

    def generate(
        self,
        profile: ContentProfile,
        request: PackagingGenerationRequest,
        brand_kit: Optional[BrandKit] = None,
    ) -> PackagingGenerationResponse:
        llm_payload = self.local_llm.generate_packaging_json(
            self._build_prompt(profile, request, brand_kit)
        )
        if llm_payload:
            parsed = self._parse_llm_response(llm_payload, request)
            if parsed:
                return parsed.model_copy(update={"used_llm_mode": self.local_llm.settings.mode})
        return self._rule_based_generation(profile, request, brand_kit)

    def _rule_based_generation(
        self,
        profile: ContentProfile,
        request: PackagingGenerationRequest,
        brand_kit: Optional[BrandKit],
    ) -> PackagingGenerationResponse:
        topic = self._topic(profile, request)
        visual_style = brand_kit.thumbnail_style if brand_kit and brand_kit.thumbnail_style else profile.visual_style
        titles = self._dedupe_titles([
            request.current_title,
            f"Most People Miss This About {topic}",
            f"{topic} Mistakes Beginners Still Make",
            f"What Nobody Tells You About {topic}",
        ])
        title_candidates = [
            TitleCandidate(
                title=title,
                rationale=self._title_rationale(title),
                estimatedViralPotential=self.viral_scoring_service.score_idea(
                    IdeaScoreRequest(
                        title=title,
                        hook=self._first_sentence(request.script),
                        topic=topic,
                        platform=request.platform or profile.platforms[0],
                    )
                ),
            )
            for title in titles[:4]
        ]
        thumbnail_concepts = [
            ThumbnailConcept(
                headline="THE HIDDEN MISTAKE",
                visualPrompt=f"{visual_style}, {topic}, one clear focal subject, bold mobile-first contrast",
                composition="Close subject on one side, one supporting object on the other, clean negative space for the headline.",
                emotion="curiosity",
                rationale="Pairs a concrete visual with an unanswered question, which supports curiosity-led packaging.",
            ),
            ThumbnailConcept(
                headline="DO THIS INSTEAD",
                visualPrompt=f"{visual_style}, before-and-after comparison for {topic}, clean split composition",
                composition="Two-state contrast with the stronger outcome visually dominant and readable at small size.",
                emotion="relief",
                rationale="Makes the payoff legible before the viewer reads the title.",
            ),
            ThumbnailConcept(
                headline=topic.upper()[:28],
                visualPrompt=f"{visual_style}, energetic subject reacting to {topic}, crisp foreground detail",
                composition="Centered subject, strong eye line, minimal props, high separation from background.",
                emotion="surprise",
                rationale="Uses the niche itself as the recognition anchor for repeat viewers.",
            ),
        ]
        return PackagingGenerationResponse(
            titles=title_candidates,
            thumbnailConcepts=thumbnail_concepts,
            usedLlmMode="rule_based",
        )

    def _parse_llm_response(
        self,
        payload: str,
        request: PackagingGenerationRequest,
    ) -> Optional[PackagingGenerationResponse]:
        try:
            parsed = json.loads(self._extract_json(payload))
            title_candidates = []
            for item in parsed.get("titles", []):
                title = str(item.get("title", "")).strip()
                if not title:
                    continue
                title_candidates.append({
                    "title": title,
                    "rationale": str(item.get("rationale", "")).strip() or "Generated packaging candidate.",
                    "estimatedViralPotential": self.viral_scoring_service.score_idea(
                        IdeaScoreRequest(
                            title=title,
                            hook=self._first_sentence(request.script),
                            topic=request.topic,
                            platform=request.platform,
                        )
                    ).model_dump(by_alias=True),
                })
            parsed["titles"] = title_candidates
            return PackagingGenerationResponse(**parsed)
        except (json.JSONDecodeError, ValidationError, ValueError, TypeError):
            return None

    def _build_prompt(
        self,
        profile: ContentProfile,
        request: PackagingGenerationRequest,
        brand_kit: Optional[BrandKit],
    ) -> str:
        brand_context = ""
        if brand_kit:
            brand_context = (
                f"Brand colors: {', '.join(brand_kit.color_palette) or 'none'}\n"
                f"Fonts: {', '.join(brand_kit.font_families) or 'none'}\n"
                f"Tone keywords: {', '.join(brand_kit.tone_keywords) or 'none'}\n"
                f"Avoid keywords: {', '.join(brand_kit.avoid_keywords) or 'none'}\n"
                f"Thumbnail style: {brand_kit.thumbnail_style or 'none'}\n"
                f"Default CTA: {brand_kit.default_cta or 'none'}\n"
            )
        return (
            "Create social-video packaging options. Return strict JSON with keys: "
            "titles and thumbnailConcepts. titles must be a list of objects with title and rationale. "
            "thumbnailConcepts must be a list of objects with headline, visualPrompt, composition, emotion, rationale. "
            "Do not promise guaranteed virality. "
            f"Profile name: {profile.name}\n"
            f"Content type: {profile.content_type}\n"
            f"Target audience: {profile.target_audience}\n"
            f"Tone: {profile.tone}\n"
            f"Visual style: {profile.visual_style}\n"
            f"Hook style: {profile.hook_style}\n"
            f"{brand_context}"
            f"Platform: {request.platform or profile.platforms[0]}\n"
            f"Current title: {request.current_title or 'none'}\n"
            f"Topic: {request.topic or profile.content_type}\n"
            f"Script:\n{request.script}"
        )

    def _topic(self, profile: ContentProfile, request: PackagingGenerationRequest) -> str:
        topic = (request.topic or profile.content_type or "This Topic").strip()
        return " ".join(part if part.isupper() else part.capitalize() for part in topic.split())

    def _dedupe_titles(self, titles: List[str]) -> List[str]:
        seen = set()
        values = []
        for title in titles:
            cleaned = " ".join((title or "").split())
            if not cleaned or cleaned.casefold() in seen:
                continue
            seen.add(cleaned.casefold())
            values.append(cleaned)
        return values

    def _title_rationale(self, title: str) -> str:
        lowered = title.lower()
        if "mistake" in lowered:
            return "Mistake framing creates immediate stakes and a clear viewer benefit."
        if "nobody tells you" in lowered:
            return "Curiosity framing suggests hidden knowledge without overstating certainty."
        if "most people" in lowered:
            return "Broad social proof plus a knowledge gap can support the opening click."
        return "Keeps the current idea while making the packaging explicit."

    def _first_sentence(self, script: str) -> str:
        parts = [item.strip() for item in re.split(r"(?<=[.!?])\s+", script.strip()) if item.strip()]
        return parts[0] if parts else script.strip()

    def _extract_json(self, payload: str) -> str:
        start = payload.find("{")
        end = payload.rfind("}")
        return payload[start:end + 1] if start >= 0 and end >= start else payload
