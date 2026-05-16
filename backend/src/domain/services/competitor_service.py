import uuid
from statistics import mean
from typing import Dict, List, Optional

from backend.src.domain.models.competitor import (
    CompetitorAnalysisSummary,
    CompetitorContent,
    CompetitorContentCreateRequest,
    CompetitorContentUpdateRequest,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class CompetitorService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_content(
        self,
        profile_id: str,
        request: CompetitorContentCreateRequest,
    ) -> CompetitorContent:
        now = utc_now_iso()
        item = CompetitorContent(
            id=f"competitor-content-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_competitor_content(item)
        return item

    def list_content(self, profile_id: str, include_archived: bool = False) -> List[CompetitorContent]:
        return self.store.list_competitor_content(profile_id, include_archived=include_archived)

    def update_content(
        self,
        item_id: str,
        request: CompetitorContentUpdateRequest,
    ) -> Optional[CompetitorContent]:
        existing = self.store.get_competitor_content(item_id)
        if not existing:
            return None
        item = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_competitor_content(item)
        return item

    def archive_content(self, item_id: str) -> Optional[CompetitorContent]:
        existing = self.store.get_competitor_content(item_id)
        if not existing:
            return None
        item = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_competitor_content(item)
        return item

    def analyze(self, profile_id: str) -> CompetitorAnalysisSummary:
        items = self.list_content(profile_id)
        if not items:
            return CompetitorAnalysisSummary(
                competitorCount=0,
                contentCount=0,
                averageViews=0,
                averageEngagementRate=0,
                recommendations=[],
            )

        competitor_groups: Dict[str, List[CompetitorContent]] = {}
        topic_groups: Dict[str, List[CompetitorContent]] = {}
        hook_groups: Dict[str, List[CompetitorContent]] = {}
        for item in items:
            competitor_groups.setdefault(item.competitor_name, []).append(item)
            if item.topic:
                topic_groups.setdefault(item.topic, []).append(item)
            if item.hook:
                hook_groups.setdefault(item.hook, []).append(item)

        top_competitor = max(
            competitor_groups.items(),
            key=lambda pair: mean(entry.views for entry in pair[1]),
        )[0]
        top_topic = (
            max(topic_groups.items(), key=lambda pair: mean(entry.views for entry in pair[1]))[0]
            if topic_groups
            else None
        )
        strongest_hook = (
            max(hook_groups.items(), key=lambda pair: mean(entry.views for entry in pair[1]))[0]
            if hook_groups
            else None
        )
        average_engagement_rate = mean(
            ((item.likes + item.comments + item.shares) / item.views * 100) if item.views else 0
            for item in items
        )
        lengths = [item.video_length_seconds for item in items if item.video_length_seconds is not None]
        recommendations: List[str] = []
        if top_topic:
            recommendations.append(f"Study how competitors package {top_topic}; it is currently the strongest topic by average views.")
        if strongest_hook:
            recommendations.append("Review the strongest recurring hook before drafting the next opening.")
        if lengths:
            recommendations.append(f"Competitor samples average {round(mean(lengths), 1)} seconds; compare that with your own retention sweet spot.")
        return CompetitorAnalysisSummary(
            competitorCount=len(competitor_groups),
            contentCount=len(items),
            averageViews=round(mean(item.views for item in items), 2),
            averageEngagementRate=round(average_engagement_rate, 2),
            topCompetitor=top_competitor,
            topTopic=top_topic,
            strongestHook=strongest_hook,
            averageVideoLengthSeconds=round(mean(lengths), 2) if lengths else None,
            recommendations=recommendations,
        )
