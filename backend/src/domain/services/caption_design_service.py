from typing import List

from backend.src.domain.models.brand_kit import BrandKit
from backend.src.domain.models.caption_design import (
    CaptionDesignPreset,
    CaptionDesignRequest,
    CaptionDesignResponse,
)
from backend.src.domain.models.content_profile import ContentProfile


class CaptionDesignService:
    def generate(
        self,
        profile: ContentProfile,
        brand_kit: BrandKit,
        request: CaptionDesignRequest,
    ) -> CaptionDesignResponse:
        font_family = brand_kit.font_families[0] if brand_kit.font_families else "Inter, sans-serif"
        accent_color = brand_kit.color_palette[0] if brand_kit.color_palette else "#5b8def"
        vertical_platform = request.platform in {"youtube_shorts", "facebook_reels", "tiktok", "instagram_reels"}
        lower_y = 82 if vertical_platform else 84
        max_chars = 26 if vertical_platform else 32

        designs = [
            CaptionDesignPreset(
                name="Clean Subtitle",
                rationale="Readable, restrained captions for narration-heavy edits.",
                fontFamily=font_family,
                fontSize=40 if request.emphasis == "minimal" else 42,
                color="#ffffff",
                accentColor=accent_color,
                bgColor="#000000",
                bgOpacity=0.42 if request.emphasis == "minimal" else 0.48,
                bold=False,
                align="center",
                x=50,
                y=lower_y,
                maxCharsPerLine=max_chars,
                previewLines=self._wrap_preview(request.sample_text, max_chars),
                estimatedReadabilityScore=95,
                notes=[
                    "Best default for dense narration.",
                    "Keep captions inside the lower mobile-safe area.",
                ],
            ),
            CaptionDesignPreset(
                name="Brand Pop",
                rationale="Uses the brand accent for stronger short-form emphasis.",
                fontFamily=font_family,
                fontSize=44 if request.emphasis != "minimal" else 42,
                color="#ffffff",
                accentColor=accent_color,
                bgColor=accent_color,
                bgOpacity=0.76 if request.emphasis == "bold" else 0.68,
                bold=True,
                align="center",
                x=50,
                y=max(76, lower_y - 2),
                maxCharsPerLine=max(22, max_chars - 2),
                previewLines=self._wrap_preview(request.sample_text, max(22, max_chars - 2)),
                estimatedReadabilityScore=90,
                notes=[
                    "Useful when the brand color has enough contrast with white text.",
                    "Pairs well with curiosity and list-style hooks.",
                ],
            ),
            CaptionDesignPreset(
                name="Headline Burst",
                rationale="Moves emphasis upward for opening hooks and scene-change moments.",
                fontFamily=font_family,
                fontSize=48 if request.emphasis == "bold" else 46,
                color="#ffffff",
                accentColor=accent_color,
                bgColor="#000000",
                bgOpacity=0.2,
                bold=True,
                align="center",
                x=50,
                y=24 if vertical_platform else 26,
                maxCharsPerLine=max(18, max_chars - 6),
                previewLines=self._wrap_preview(request.sample_text, max(18, max_chars - 6)),
                estimatedReadabilityScore=84,
                notes=[
                    "Best for short hook phrases rather than every subtitle line.",
                    "Use sparingly so the layout still has visual rhythm.",
                ],
            ),
        ]
        return CaptionDesignResponse(designs=designs)

    def _wrap_preview(self, text: str, max_chars: int) -> List[str]:
        words = text.split()
        lines: List[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if len(candidate) <= max_chars or not current:
                current = candidate
                continue
            lines.append(current)
            current = word
            if len(lines) == 2:
                break
        if current and len(lines) < 2:
            lines.append(current)
        return lines or [text[:max_chars]]
