import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.src.domain.models.brand_kit import BrandKitUpdateRequest
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.publishing import (
    PublishJobCreateRequest,
    PublishingDestinationUpdateRequest,
    PublishingPackageRequest,
)
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.publishing_service import PublishingService
from backend.src.domain.services.sqlite_store import SQLiteStore


class PublishingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.brand_kit_service = BrandKitService(self.store)
        self.service = PublishingService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(
                name="Daily AI Facts",
                platforms=["youtube_shorts"],
                contentType="AI education",
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_package_jobs_and_blocked_dispatch_are_persisted(self) -> None:
        brand_kit = self.brand_kit_service.update(
            self.profile,
            BrandKitUpdateRequest(defaultCta="Subscribe for daily AI ideas."),
        )
        package = self.service.generate_package(
            self.profile,
            PublishingPackageRequest(
                script="Most people miss the fastest AI shift happening right now.",
                topic="AI tools",
                platform="youtube_shorts",
            ),
            brand_kit,
        )
        self.assertIn("#AiTools", package.hashtags)
        self.assertEqual(package.call_to_action, "Subscribe for daily AI ideas.")
        destination = self.service.upsert_destination(
            self.profile.id,
            "youtube_shorts",
            PublishingDestinationUpdateRequest(status="manual_only", displayName="Daily AI Facts"),
        )
        self.assertEqual(destination.status, "manual_only")
        job = self.service.create_job(
            self.profile.id,
            PublishJobCreateRequest(
                platform="youtube_shorts",
                title=package.title,
                package=package,
                status="ready",
            ),
        )
        dispatched, blocker = self.service.dispatch_job(job.id)
        self.assertIsNotNone(dispatched)
        self.assertIsNotNone(blocker)
        assert dispatched is not None
        self.assertEqual(dispatched.status, "failed")
        assert blocker is not None
        self.assertIn("Live provider dispatch is not implemented yet", blocker)
        self.assertIn("Connect a publishing destination before dispatch", blocker)
        self.assertEqual(len(self.service.list_jobs(self.profile.id)), 1)

    def test_provider_readiness_reports_missing_oauth_configuration(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "NEURALSCRIBE_YOUTUBE_CLIENT_ID": "",
                "NEURALSCRIBE_YOUTUBE_CLIENT_SECRET": "",
            },
            clear=False,
        ):
            service = PublishingService(self.store)
            providers = {provider.key: provider for provider in service.list_providers()}
        youtube = providers["youtube"]
        self.assertFalse(youtube.ready_for_oauth)
        self.assertEqual(youtube.status, "needs_configuration")
        self.assertEqual(
            youtube.configuration_issues,
            [
                "NEURALSCRIBE_YOUTUBE_CLIENT_ID",
                "NEURALSCRIBE_YOUTUBE_CLIENT_SECRET",
            ],
        )

    def test_dispatch_requires_connected_destination_token_reference(self) -> None:
        package = self.service.generate_package(
            self.profile,
            PublishingPackageRequest(
                script="Most people miss the fastest AI shift happening right now.",
                topic="AI tools",
                platform="youtube_shorts",
            ),
        )
        self.service.upsert_destination(
            self.profile.id,
            "youtube_shorts",
            PublishingDestinationUpdateRequest(status="connected", displayName="Daily AI Facts"),
        )
        job = self.service.create_job(
            self.profile.id,
            PublishJobCreateRequest(
                platform="youtube_shorts",
                title=package.title,
                package=package,
                status="ready",
            ),
        )
        _, blocker = self.service.dispatch_job(job.id)
        assert blocker is not None
        self.assertIn("Connected destination is missing a secure token reference", blocker)
