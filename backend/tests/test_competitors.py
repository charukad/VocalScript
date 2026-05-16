import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.competitor import (
    CompetitorContentCreateRequest,
    CompetitorContentUpdateRequest,
)
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.competitor_service import CompetitorService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class CompetitorServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.competitor_service = CompetitorService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"])
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_competitor_content_can_be_created_updated_archived_and_summarized(self) -> None:
        first = self.competitor_service.create_content(
            self.profile.id,
            CompetitorContentCreateRequest(
                competitorName="Creator A",
                platform="youtube_shorts",
                title="AI myths",
                topic="AI myths",
                hook="Most people still get this wrong.",
                videoLengthSeconds=42,
                views=1000,
                likes=120,
                comments=18,
                shares=22,
            ),
        )
        second = self.competitor_service.create_content(
            self.profile.id,
            CompetitorContentCreateRequest(
                competitorName="Creator B",
                platform="youtube_shorts",
                title="AI mistakes",
                topic="AI mistakes",
                hook="Avoid this first.",
                videoLengthSeconds=36,
                views=600,
                likes=60,
                comments=8,
                shares=12,
            ),
        )

        updated = self.competitor_service.update_content(
            second.id,
            CompetitorContentUpdateRequest(views=900),
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.views, 900)

        summary = self.competitor_service.analyze(self.profile.id)
        self.assertEqual(summary.competitor_count, 2)
        self.assertEqual(summary.content_count, 2)
        self.assertEqual(summary.top_competitor, "Creator A")
        self.assertEqual(summary.top_topic, "AI myths")
        self.assertEqual(summary.strongest_hook, "Most people still get this wrong.")
        self.assertEqual(summary.average_video_length_seconds, 39.0)
        self.assertGreater(summary.average_engagement_rate, 0)
        self.assertTrue(summary.recommendations)

        archived = self.competitor_service.archive_content(first.id)
        self.assertIsNotNone(archived)
        self.assertEqual([item.id for item in self.competitor_service.list_content(self.profile.id)], [second.id])
        self.assertEqual(
            len(self.competitor_service.list_content(self.profile.id, include_archived=True)),
            2,
        )
