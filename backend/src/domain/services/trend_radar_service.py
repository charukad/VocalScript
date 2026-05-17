from urllib import request as urllib_request
from xml.etree import ElementTree

from backend.src.domain.models.content_profile import ContentProfile
from backend.src.domain.models.content_studio import ContentTrendCreateRequest
from backend.src.domain.models.trend_radar import (
    TrendImportResult,
    TrendRssImportRequest,
    TrendSourceDescriptor,
)
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.infrastructure.trend_sources import TrendSourceRegistry


class TrendRadarService:
    def __init__(
        self,
        content_studio_service: ContentStudioService,
        registry: TrendSourceRegistry | None = None,
    ):
        self.content_studio_service = content_studio_service
        self.registry = registry or TrendSourceRegistry()

    def list_sources(self) -> list[TrendSourceDescriptor]:
        return [
            TrendSourceDescriptor(
                key=provider.key,
                displayName=provider.display_name,
                sourceType=provider.source_type,
                requiresCredentials=provider.requires_credentials,
                status=provider.status,
            )
            for provider in self.registry.list()
        ]

    def import_rss(self, profile: ContentProfile, request: TrendRssImportRequest) -> TrendImportResult:
        with urllib_request.urlopen(str(request.feed_url), timeout=8) as response:
            payload = response.read()
        root = ElementTree.fromstring(payload)
        items = self._extract_items(root)
        existing_topics = {
            trend.topic.casefold()
            for trend in self.content_studio_service.list_trends(profile.id, include_archived=True)
        }
        imported = []
        skipped = 0
        for title in items[: request.max_items]:
            cleaned = " ".join(title.split())
            if not cleaned or cleaned.casefold() in existing_topics:
                skipped += 1
                continue
            trend = self.content_studio_service.create_trend(
                profile.id,
                ContentTrendCreateRequest(
                    topic=cleaned,
                    platform=request.platform or (profile.platforms[0] if profile.platforms else None),
                    trendScore=None,
                    platformRelevance=None,
                    nicheRelevance=None,
                    suggestedAngle=f"Connect this external signal back to {profile.content_type or 'the niche'}.",
                    suggestedHook=f"Why is everyone suddenly talking about {cleaned}?",
                    contentIdeaSuggestions=[
                        f"Explain {cleaned} for {profile.target_audience or 'your audience'}",
                        f"Fast reaction: what {cleaned} means now",
                    ],
                    source=request.source_name or "rss_feed",
                ),
            )
            imported.append(trend)
            existing_topics.add(cleaned.casefold())
        return TrendImportResult(
            provider="rss_feed",
            importedCount=len(imported),
            skippedCount=skipped,
            trends=imported,
        )

    def _extract_items(self, root: ElementTree.Element) -> list[str]:
        items = [item.findtext("title", default="") for item in root.findall(".//item")]
        if items:
            return items
        namespace = "{http://www.w3.org/2005/Atom}"
        return [
            entry.findtext(f"{namespace}title", default="")
            for entry in root.findall(f".//{namespace}entry")
        ]
