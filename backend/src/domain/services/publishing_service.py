import re
import uuid
from typing import List, Optional

from backend.src.domain.models.brand_kit import BrandKit
from backend.src.domain.models.content_profile import ContentProfile, PlatformTarget
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.models.publishing import (
    PublishJob,
    PublishJobCreateRequest,
    PublishJobUpdateRequest,
    PublishingDestination,
    PublishingDestinationUpdateRequest,
    PublishingPackage,
    PublishingPackageRequest,
    PublishingProviderDescriptor,
)
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.infrastructure.publishing_providers import PublishingProviderRegistry


class PublishingService:
    def __init__(self, store: SQLiteStore, registry: PublishingProviderRegistry | None = None):
        self.store = store
        self.registry = registry or PublishingProviderRegistry()

    def list_providers(self) -> list[PublishingProviderDescriptor]:
        return [
            PublishingProviderDescriptor(
                key=provider.key,
                displayName=provider.display_name,
                supportsOauth=provider.supports_oauth,
                supportsLivePublish=provider.supports_live_publish,
                supportsScheduling=provider.supports_scheduling,
                status=provider.status,
                readyForOauth=provider.ready_for_oauth,
                configurationIssues=list(provider.configuration_issues),
            )
            for provider in self.registry.list()
        ]

    def list_destinations(self, profile_id: str) -> List[PublishingDestination]:
        return self.store.list_publishing_destinations(profile_id)

    def upsert_destination(
        self,
        profile_id: str,
        platform: PlatformTarget,
        request: PublishingDestinationUpdateRequest,
    ) -> PublishingDestination:
        existing = self.store.get_publishing_destination(profile_id, platform)
        now = utc_now_iso()
        destination = PublishingDestination(
            id=existing.id if existing else f"publishing-destination-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            platform=platform,
            createdAt=existing.created_at if existing else now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_publishing_destination(destination)
        return destination

    def generate_package(
        self,
        profile: ContentProfile,
        request: PublishingPackageRequest,
        brand_kit: Optional[BrandKit] = None,
    ) -> PublishingPackage:
        platform = request.platform or (profile.platforms[0] if profile.platforms else "youtube_shorts")
        title = request.title.strip() or self._default_title(request.script, profile)
        topic = request.topic.strip() or profile.content_type or "content"
        hashtags = self._hashtags(topic, profile)
        cta = brand_kit.default_cta if brand_kit and brand_kit.default_cta else "Follow for more."
        description = (
            f"{title}\n\n"
            f"{self._summary(request.script)}\n\n"
            f"{' '.join(hashtags)}"
        )
        post_copy = f"{title} {hashtags[0] if hashtags else ''}".strip()
        platform_notes = self._platform_notes(platform)
        return PublishingPackage(
            title=title,
            description=description,
            postCopy=post_copy,
            hashtags=hashtags,
            callToAction=cta,
            platformNotes=platform_notes,
        )

    def create_job(self, profile_id: str, request: PublishJobCreateRequest) -> PublishJob:
        now = utc_now_iso()
        job = PublishJob(
            id=f"publish-job-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_publish_job(job)
        return job

    def list_jobs(self, profile_id: str, include_archived: bool = False) -> List[PublishJob]:
        return self.store.list_publish_jobs(profile_id, include_archived=include_archived)

    def update_job(self, job_id: str, request: PublishJobUpdateRequest) -> Optional[PublishJob]:
        existing = self.store.get_publish_job(job_id)
        if not existing:
            return None
        job = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_publish_job(job)
        return job

    def archive_job(self, job_id: str) -> Optional[PublishJob]:
        existing = self.store.get_publish_job(job_id)
        if not existing:
            return None
        job = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_publish_job(job)
        return job

    def dispatch_job(self, job_id: str) -> tuple[Optional[PublishJob], Optional[str]]:
        existing = self.store.get_publish_job(job_id)
        if not existing:
            return None, None
        provider = self.registry.get(existing.platform)
        blockers = self._dispatch_blockers(existing, provider)
        if blockers:
            message = " ".join(blockers)
            failed = existing.model_copy(
                update={
                    "status": "failed",
                    "provider_status": provider.status if provider else "unavailable",
                    "error": message,
                    "updated_at": utc_now_iso(),
                }
            )
            self.store.upsert_publish_job(failed)
            return failed, message
        dispatched = existing.model_copy(
            update={
                "status": "dispatched",
                "provider_status": provider.status,
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_publish_job(dispatched)
        return dispatched, None

    def _dispatch_blockers(self, job: PublishJob, provider) -> list[str]:
        if not provider:
            return ["Publishing provider is unavailable for this platform."]

        blockers: list[str] = []
        if provider.configuration_issues:
            blockers.append(
                "Missing provider configuration: "
                + ", ".join(provider.configuration_issues)
                + "."
            )
        if not provider.supports_live_publish:
            blockers.append(
                "Live provider dispatch is not implemented yet; OAuth-backed publishing still needs a real provider adapter."
            )

        destination = self.store.get_publishing_destination(job.profile_id, job.platform)
        if not destination or destination.status != "connected":
            blockers.append("Connect a publishing destination before dispatch.")
        elif not destination.token_reference:
            blockers.append("Connected destination is missing a secure token reference.")

        return blockers

    def _default_title(self, script: str, profile: ContentProfile) -> str:
        sentence = re.split(r"(?<=[.!?])\s+", script.strip())[0].rstrip(".!?")
        return sentence[:96] or profile.name

    def _summary(self, script: str) -> str:
        words = script.split()
        return " ".join(words[:32]) + ("..." if len(words) > 32 else "")

    def _hashtags(self, topic: str, profile: ContentProfile) -> list[str]:
        raw = [topic, profile.content_type, profile.name]
        tags = []
        for value in raw:
            cleaned = re.sub(r"[^a-zA-Z0-9]+", "", value.title())
            if cleaned and f"#{cleaned}" not in tags:
                tags.append(f"#{cleaned}")
        return tags[:5]

    def _platform_notes(self, platform: str) -> list[str]:
        if platform in {"youtube_shorts", "facebook_reels", "tiktok"}:
            return ["Keep the opening payoff in the first 2 seconds.", "Use vertical-safe captions and concise copy."]
        if platform == "youtube":
            return ["Pair the package with a strong thumbnail concept.", "Use the first description lines for the core promise."]
        return ["Review native platform constraints before final publish."]
